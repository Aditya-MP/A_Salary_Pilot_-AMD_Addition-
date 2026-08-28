package wallet

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Integration tests against a real PostgreSQL.
//
//	DATABASE_URL=postgres://... go test ./internal/wallet/ -v
//
// Skipped when DATABASE_URL is unset, so `go test ./...` stays green on a
// machine with no database. These are deliberately NOT mocked: the whole point
// of this package is that the invariants live in the database, and a mock
// would test the mock.
//
// Every test creates its own throwaway user, so they can run in any order and
// in parallel without seeing each other's money.

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping ledger integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newUser(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	ctx := context.Background()
	email := fmt.Sprintf("test-%d-%s@example.test", time.Now().UnixNano(), t.Name())

	var id string
	err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ($1,'x') RETURNING id`,
		email).Scan(&id)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	// ON DELETE CASCADE removes the accounts and entries with the user, so a
	// failed test never leaves money lying around in the database.
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, id)
	})
	return id
}

func rupees(n int64) int64 { return n * 100 }

// ── the happy path ──────────────────────────────────────────────────────

func TestTopUpAndInvest(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	ctx := context.Background()
	user := newUser(t, pool)

	if err := svc.EnsureAccounts(ctx, user); err != nil {
		t.Fatalf("ensure accounts: %v", err)
	}

	if _, err := svc.TopUp(ctx, user, rupees(50_000), "topup-1", "test funding"); err != nil {
		t.Fatalf("topup: %v", err)
	}

	bal, err := svc.Balance(ctx, user)
	if err != nil {
		t.Fatalf("balance: %v", err)
	}
	if bal.WalletPaise != rupees(50_000) {
		t.Fatalf("after topup: got %d paise, want %d", bal.WalletPaise, rupees(50_000))
	}

	// Invest 20,000 at 261 per unit -> 76.6284... units
	if _, err := svc.Invest(ctx, user, "NIFTY50", rupees(20_000), rupees(261),
		"invest-1", "index fund"); err != nil {
		t.Fatalf("invest: %v", err)
	}

	bal, _ = svc.Balance(ctx, user)
	if bal.WalletPaise != rupees(30_000) {
		t.Errorf("wallet after invest: got %d, want %d", bal.WalletPaise, rupees(30_000))
	}
	if bal.Invested != rupees(20_000) {
		t.Errorf("invested: got %d, want %d", bal.Invested, rupees(20_000))
	}
	if len(bal.Holdings) != 1 || bal.Holdings[0].Ticker != "NIFTY50" {
		t.Fatalf("expected one NIFTY50 holding, got %+v", bal.Holdings)
	}

	units := bal.Holdings[0].Units.InexactFloat64()
	if units < 76.6 || units > 76.7 {
		t.Errorf("units: got %v, want ~76.63", units)
	}

	assertLedgerBalances(t, pool)
}

// ── the invariants ──────────────────────────────────────────────────────

func TestCannotOverdraw(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	ctx := context.Background()
	user := newUser(t, pool)
	_ = svc.EnsureAccounts(ctx, user)

	_, _ = svc.TopUp(ctx, user, rupees(1_000), "topup-od", "")

	// Spending more than the wallet holds must fail, and it must fail in the
	// DATABASE - the Go code never checks the balance before writing.
	_, err := svc.Invest(ctx, user, "NIFTY50", rupees(5_000), rupees(261), "invest-od", "")
	if !errors.Is(err, ErrInsufficientFunds) {
		t.Fatalf("expected ErrInsufficientFunds, got %v", err)
	}

	bal, _ := svc.Balance(ctx, user)
	if bal.WalletPaise != rupees(1_000) {
		t.Errorf("failed invest changed the balance: %d", bal.WalletPaise)
	}
	if len(bal.Holdings) != 0 {
		t.Errorf("failed invest created a holding: %+v", bal.Holdings)
	}
	assertLedgerBalances(t, pool)
}

// The reason idempotency keys exist: a double tap, a client retry, a flaky
// network. Any of them replays the request, and money must move once.
func TestIdempotencyPreventsDoubleSpend(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	ctx := context.Background()
	user := newUser(t, pool)
	_ = svc.EnsureAccounts(ctx, user)

	first, err := svc.TopUp(ctx, user, rupees(10_000), "same-key", "")
	if err != nil {
		t.Fatalf("first topup: %v", err)
	}

	// Same key, five more times, as if the client kept retrying.
	for i := 0; i < 5; i++ {
		again, err := svc.TopUp(ctx, user, rupees(10_000), "same-key", "")
		if err != nil {
			t.Fatalf("retry %d: %v", i, err)
		}
		if again != first {
			t.Fatalf("retry %d returned a NEW transaction %s, want the original %s",
				i, again, first)
		}
	}

	bal, _ := svc.Balance(ctx, user)
	if bal.WalletPaise != rupees(10_000) {
		t.Fatalf("six identical requests credited %d paise, want %d — money was created",
			bal.WalletPaise, rupees(10_000))
	}
}

// An unbalanced transaction must be impossible, even writing raw SQL that
// bypasses this package entirely.
func TestUnbalancedTransactionRejected(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	user := newUser(t, pool)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var acct string
	if err := tx.QueryRow(ctx,
		`INSERT INTO ledger_accounts (user_id, kind, ticker) VALUES ($1,'wallet',NULL) RETURNING id`,
		user).Scan(&acct); err != nil {
		t.Fatal(err)
	}

	var txn string
	if err := tx.QueryRow(ctx,
		`INSERT INTO ledger_transactions (user_id, kind, idempotency_key)
		 VALUES ($1,'topup',$2) RETURNING id`, user, "bad-"+t.Name()).Scan(&txn); err != nil {
		t.Fatal(err)
	}

	// One leg only. Money appearing from nowhere.
	if _, err := tx.Exec(ctx,
		`INSERT INTO ledger_entries (txn_id, account_id, amount_paise) VALUES ($1,$2,$3)`,
		txn, acct, rupees(1_000)); err != nil {
		t.Fatalf("insert should succeed; the check is deferred to commit: %v", err)
	}

	if err := tx.Commit(ctx); err == nil {
		t.Fatal("SECURITY: a one-legged transaction committed — money was created from nothing")
	}
}

// A correction must be a new compensating entry, never an edit. History that
// can be rewritten is not history.
func TestEntriesAreImmutable(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	ctx := context.Background()
	user := newUser(t, pool)
	_ = svc.EnsureAccounts(ctx, user)

	if _, err := svc.TopUp(ctx, user, rupees(5_000), "immutable-1", ""); err != nil {
		t.Fatal(err)
	}

	// Try to inflate the balance by editing history directly.
	if _, err := pool.Exec(ctx,
		`UPDATE ledger_entries SET amount_paise = amount_paise * 1000`); err != nil {
		t.Fatalf("update returned an error rather than being ignored: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM ledger_entries`); err != nil {
		t.Fatalf("delete returned an error rather than being ignored: %v", err)
	}

	bal, _ := svc.Balance(ctx, user)
	if bal.WalletPaise != rupees(5_000) {
		t.Fatalf("history was rewritten: balance is now %d, want %d",
			bal.WalletPaise, rupees(5_000))
	}
}

func TestFullCycleReturnsToZero(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	ctx := context.Background()
	user := newUser(t, pool)
	_ = svc.EnsureAccounts(ctx, user)

	steps := []struct {
		name string
		fn   func() (string, error)
	}{
		{"topup", func() (string, error) { return svc.TopUp(ctx, user, rupees(100_000), "c1", "") }},
		{"invest", func() (string, error) {
			return svc.Invest(ctx, user, "NIFTY50", rupees(40_000), rupees(261), "c2", "")
		}},
		{"redeem", func() (string, error) {
			return svc.Redeem(ctx, user, "NIFTY50", rupees(40_000), rupees(261), "c3", "")
		}},
		{"withdraw", func() (string, error) { return svc.Withdraw(ctx, user, rupees(100_000), "c4", "") }},
	}
	for _, s := range steps {
		if _, err := s.fn(); err != nil {
			t.Fatalf("%s: %v", s.name, err)
		}
	}

	bal, _ := svc.Balance(ctx, user)
	if bal.WalletPaise != 0 {
		t.Errorf("wallet after full cycle: got %d, want 0", bal.WalletPaise)
	}
	if bal.Invested != 0 {
		t.Errorf("invested after full cycle: got %d, want 0", bal.Invested)
	}

	history, err := svc.History(ctx, user, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(history) < 6 {
		t.Errorf("expected at least 6 visible entries, got %d", len(history))
	}
	assertLedgerBalances(t, pool)
}

func TestNoDrift(t *testing.T) {
	pool := testPool(t)
	svc := New(pool)
	n, err := svc.Drift(context.Background())
	if err != nil {
		t.Fatalf("drift query: %v", err)
	}
	if n != 0 {
		t.Fatalf("%d account(s) have cached balances disagreeing with their entries", n)
	}
}

// assertLedgerBalances is the whole-system check: across every account in the
// database, all money must sum to exactly zero.
func assertLedgerBalances(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	var total int64
	if err := pool.QueryRow(context.Background(),
		`SELECT total_paise FROM ledger_total`).Scan(&total); err != nil {
		t.Fatalf("ledger_total: %v", err)
	}
	if total != 0 {
		t.Fatalf("LEDGER DOES NOT BALANCE: total is %d paise, must be 0", total)
	}
}
