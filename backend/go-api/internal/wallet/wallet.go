// Package wallet implements the double-entry ledger.
//
// ⚠  SIMULATED MONEY. No real funds move. Handling real money in India
//
//	requires an RBI Prepaid Payment Instrument licence; this models how such
//	a system works, with test balances.
//
// EVERY AMOUNT IS int64 PAISE. Never float64. A ledger that does not balance
// to the paisa is not a ledger, and binary floating point cannot represent
// 0.1 exactly.
package wallet

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

var (
	ErrInsufficientFunds = errors.New("wallet: insufficient funds")
	ErrInvalidAmount     = errors.New("wallet: amount must be positive")
	ErrNotFound          = errors.New("wallet: account not found")
)

type Service struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

type Balance struct {
	WalletPaise int64      `json:"wallet_paise"`
	Invested    int64      `json:"invested_paise"`
	Holdings    []Position `json:"holdings"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Position struct {
	Ticker    string          `json:"ticker"`
	CostPaise int64           `json:"cost_paise"`
	Units     decimal.Decimal `json:"units"`
}

type Entry struct {
	TxnID     string    `json:"txn_id"`
	Kind      string    `json:"kind"`
	Memo      string    `json:"memo"`
	Amount    int64     `json:"amount_paise"`
	Account   string    `json:"account"`
	Ticker    *string   `json:"ticker,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// EnsureAccounts creates the standing accounts for a user. Safe to call on
// every login; ON CONFLICT makes it idempotent.
func (s *Service) EnsureAccounts(ctx context.Context, userID string) error {
	const q = `
		INSERT INTO ledger_accounts (user_id, kind, ticker)
		VALUES ($1, 'wallet', NULL), ($1, 'external', NULL), ($1, 'fee', NULL)
		ON CONFLICT DO NOTHING`
	_, err := s.pool.Exec(ctx, q, userID)
	return err
}

func (s *Service) accountID(ctx context.Context, tx pgx.Tx, userID, kind string, ticker *string) (string, error) {
	// A holding account is created the first time that instrument is bought,
	// which is why this inserts rather than only selecting.
	const q = `
		INSERT INTO ledger_accounts (user_id, kind, ticker)
		VALUES ($1, $2::account_kind, $3)
		ON CONFLICT (user_id, kind, ticker) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING id`
	var id string
	err := tx.QueryRow(ctx, q, userID, kind, ticker).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("wallet: account %s: %w", kind, err)
	}
	return id, nil
}

// TopUp moves money in from outside.
//
//	external  -amount   (the outside world gives it up)
//	wallet    +amount   (the user receives it)
//
// Sums to zero, which is the invariant the database enforces at commit.
func (s *Service) TopUp(ctx context.Context, userID string, paise int64, idem, memo string) (string, error) {
	if paise <= 0 {
		return "", ErrInvalidAmount
	}
	return s.transact(ctx, userID, "topup", idem, memo, func(ctx context.Context, tx pgx.Tx, txnID string) error {
		ext, err := s.accountID(ctx, tx, userID, "external", nil)
		if err != nil {
			return err
		}
		wal, err := s.accountID(ctx, tx, userID, "wallet", nil)
		if err != nil {
			return err
		}
		if err := insert(ctx, tx, txnID, ext, -paise, nil); err != nil {
			return err
		}
		return insert(ctx, tx, txnID, wal, paise, nil)
	})
}

// Invest moves money from the wallet into a holding.
//
//	wallet   -amount
//	holding  +amount, +units
//
// The negative-balance guard lives in a database trigger, so an over-invest
// fails even if this code forgets to check. Belt and braces, deliberately:
// application checks are racy across concurrent requests, the constraint is
// not.
func (s *Service) Invest(
	ctx context.Context, userID, ticker string, paise int64,
	unitPricePaise int64, idem, memo string,
) (string, error) {
	if paise <= 0 {
		return "", ErrInvalidAmount
	}
	if unitPricePaise <= 0 {
		return "", fmt.Errorf("wallet: unit price must be positive")
	}

	units := decimal.NewFromInt(paise).Div(decimal.NewFromInt(unitPricePaise)).Round(10)

	return s.transact(ctx, userID, "invest", idem, memo, func(ctx context.Context, tx pgx.Tx, txnID string) error {
		wal, err := s.accountID(ctx, tx, userID, "wallet", nil)
		if err != nil {
			return err
		}
		hold, err := s.accountID(ctx, tx, userID, "holding", &ticker)
		if err != nil {
			return err
		}
		if err := insert(ctx, tx, txnID, wal, -paise, nil); err != nil {
			return err
		}
		return insert(ctx, tx, txnID, hold, paise, &units)
	})
}

// Redeem sells a holding back into the wallet.
func (s *Service) Redeem(
	ctx context.Context, userID, ticker string, paise int64,
	unitPricePaise int64, idem, memo string,
) (string, error) {
	if paise <= 0 {
		return "", ErrInvalidAmount
	}
	units := decimal.NewFromInt(paise).Div(decimal.NewFromInt(unitPricePaise)).Round(10).Neg()

	return s.transact(ctx, userID, "redeem", idem, memo, func(ctx context.Context, tx pgx.Tx, txnID string) error {
		hold, err := s.accountID(ctx, tx, userID, "holding", &ticker)
		if err != nil {
			return err
		}
		wal, err := s.accountID(ctx, tx, userID, "wallet", nil)
		if err != nil {
			return err
		}
		if err := insert(ctx, tx, txnID, hold, -paise, &units); err != nil {
			return err
		}
		return insert(ctx, tx, txnID, wal, paise, nil)
	})
}

// Withdraw sends money back out to the bank.
func (s *Service) Withdraw(ctx context.Context, userID string, paise int64, idem, memo string) (string, error) {
	if paise <= 0 {
		return "", ErrInvalidAmount
	}
	return s.transact(ctx, userID, "withdraw", idem, memo, func(ctx context.Context, tx pgx.Tx, txnID string) error {
		wal, err := s.accountID(ctx, tx, userID, "wallet", nil)
		if err != nil {
			return err
		}
		ext, err := s.accountID(ctx, tx, userID, "external", nil)
		if err != nil {
			return err
		}
		if err := insert(ctx, tx, txnID, wal, -paise, nil); err != nil {
			return err
		}
		return insert(ctx, tx, txnID, ext, paise, nil)
	})
}

// transact wraps one ledger movement.
//
// The idempotency key is checked FIRST, inside the same transaction. A
// duplicate request returns the original transaction id and moves nothing —
// which is what makes a double-tap or a client retry safe.
func (s *Service) transact(
	ctx context.Context, userID, kind, idem, memo string,
	body func(context.Context, pgx.Tx, string) error,
) (string, error) {
	if idem == "" {
		return "", fmt.Errorf("wallet: idempotency key is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("wallet: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var txnID string
	err = tx.QueryRow(ctx,
		`INSERT INTO ledger_transactions (user_id, kind, idempotency_key, memo)
		 VALUES ($1,$2,$3,$4) RETURNING id`,
		userID, kind, idem, memo,
	).Scan(&txnID)

	if err != nil {
		// Already processed. Return the original id rather than an error: from
		// the caller's point of view the request succeeded, which it did.
		var existing string
		if e := s.pool.QueryRow(ctx,
			`SELECT id FROM ledger_transactions WHERE user_id=$1 AND idempotency_key=$2`,
			userID, idem,
		).Scan(&existing); e == nil {
			return existing, nil
		}
		return "", fmt.Errorf("wallet: create transaction: %w", err)
	}

	if err := body(ctx, tx, txnID); err != nil {
		return "", err
	}

	// The balance trigger raises check_violation on a negative wallet or
	// holding, and the deferred constraint raises if entries do not sum to
	// zero. Both surface here, at COMMIT.
	if err := tx.Commit(ctx); err != nil {
		if isCheckViolation(err) {
			return "", ErrInsufficientFunds
		}
		return "", fmt.Errorf("wallet: commit: %w", err)
	}
	return txnID, nil
}

func insert(ctx context.Context, tx pgx.Tx, txnID, accountID string, paise int64, units *decimal.Decimal) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO ledger_entries (txn_id, account_id, amount_paise, units)
		 VALUES ($1,$2,$3,$4)`,
		txnID, accountID, paise, units,
	)
	if err != nil {
		if isCheckViolation(err) {
			return ErrInsufficientFunds
		}
		return fmt.Errorf("wallet: entry: %w", err)
	}
	return nil
}

// Balance reads the cached balances, which the trigger keeps in step.
func (s *Service) Balance(ctx context.Context, userID string) (*Balance, error) {
	const q = `
		SELECT a.kind::text, a.ticker,
		       COALESCE(b.balance_paise, 0), COALESCE(b.units, 0),
		       COALESCE(b.updated_at, now())
		FROM ledger_accounts a
		LEFT JOIN ledger_balances b ON b.account_id = a.id
		WHERE a.user_id = $1 AND a.kind IN ('wallet','holding')
		ORDER BY a.kind, a.ticker`

	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("wallet: balance: %w", err)
	}
	defer rows.Close()

	out := &Balance{Holdings: []Position{}}
	for rows.Next() {
		var kind string
		var ticker *string
		var paise int64
		var units decimal.Decimal
		var updated time.Time
		if err := rows.Scan(&kind, &ticker, &paise, &units, &updated); err != nil {
			return nil, err
		}
		if updated.After(out.UpdatedAt) {
			out.UpdatedAt = updated
		}
		if kind == "wallet" {
			out.WalletPaise = paise
			continue
		}
		if ticker == nil {
			continue
		}
		// A holding account survives being sold down to nothing - the
		// account row stays so its history stays. But a position with no
		// cost basis is not something the user owns, and listing it puts a
		// ghost row in the portfolio for every instrument ever touched.
		//
		// Units are compared to a small epsilon, not exact zero. A "sell
		// everything" redemption specifies unit_price_paise as a whole
		// number of paise, while the true average cost per unit is an
		// arbitrary decimal - so the removed unit count (paise divided by
		// that rounded price) essentially never lands on the position's
		// exact remaining units. Cost hits exactly zero every time (integer
		// arithmetic throughout the ledger); units are left with genuine,
		// unavoidable dust - orders of magnitude smaller than the smallest
		// position that could exist for any instrument this app prices
		// (the cheapest is tens of rupees a unit), and well below the 4
		// decimal places formatUnits on the frontend would ever render.
		const unitDust = 0.0001
		if paise == 0 && units.Abs().LessThan(decimal.NewFromFloat(unitDust)) {
			continue
		}
		out.Invested += paise
		out.Holdings = append(out.Holdings, Position{
			Ticker: *ticker, CostPaise: paise, Units: units,
		})
	}
	return out, rows.Err()
}

// History returns the ledger entries a user can actually see.
func (s *Service) History(ctx context.Context, userID string, limit int) ([]Entry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
		SELECT t.id::text, t.kind, COALESCE(t.memo,''), e.amount_paise,
		       a.kind::text, a.ticker, e.created_at
		FROM ledger_entries e
		JOIN ledger_transactions t ON t.id = e.txn_id
		JOIN ledger_accounts a ON a.id = e.account_id
		WHERE t.user_id = $1 AND a.kind <> 'external'
		ORDER BY e.id DESC
		LIMIT $2`

	rows, err := s.pool.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("wallet: history: %w", err)
	}
	defer rows.Close()

	out := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.TxnID, &e.Kind, &e.Memo, &e.Amount,
			&e.Account, &e.Ticker, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Drift reports any account whose cached balance disagrees with its entries.
// Should always be empty; if it is not, the ledger is right and the cache is
// wrong. Wired into readiness so corruption surfaces immediately.
func (s *Service) Drift(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM ledger_drift`).Scan(&n)
	return n, err
}

func isCheckViolation(err error) bool {
	type sqlState interface{ SQLState() string }
	var pgErr sqlState
	if errors.As(err, &pgErr) {
		s := pgErr.SQLState()
		return s == "23514" || s == "P0001"
	}
	return false
}
