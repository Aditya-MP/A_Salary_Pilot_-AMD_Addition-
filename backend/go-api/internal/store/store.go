// Package store is the database layer.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound  = errors.New("store: not found")
	ErrDuplicate = errors.New("store: already exists")
)

type Store struct {
	pool *pgxpool.Pool
}

// New opens a connection pool. It does NOT block on the database being
// reachable - the service starts, reports itself unready, and recovers on its
// own when the database appears. A service that refuses to boot because a
// dependency is briefly down turns a small outage into a manual restart.
func New(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("store: parse dsn: %w", err)
	}

	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 15 * time.Minute
	// Bounded, so a wedged database surfaces as an error rather than as
	// requests piling up until the process runs out of memory.
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: create pool: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// Pool exposes the connection pool for packages that own their own SQL, like
// the ledger. Deliberately not a general escape hatch - the alternative was
// funnelling every wallet query through this package, which would make it a
// grab bag rather than a store.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Ping backs the readiness probe.
func (s *Store) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return s.pool.Ping(ctx)
}

type User struct {
	ID    string
	Email string
	// PasswordHash is empty for a Google-only account, never NULL in Go -
	// the query COALESCEs it, so every caller can keep treating this as a
	// plain string (auth.VerifyPassword fails safely, rather than panics,
	// on an empty/malformed hash) instead of a nullable type rippling
	// through every place PasswordHash is read.
	PasswordHash string
	// GoogleSub is Google's stable per-account identifier, or nil for an
	// account that has never signed in with Google.
	GoogleSub   *string
	DisplayName string
	CreatedAt   time.Time
}

const userColumns = `id, email, COALESCE(password_hash, ''), google_sub, display_name, created_at`

func scanUser(row pgx.Row, u *User) error {
	return row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.GoogleSub, &u.DisplayName, &u.CreatedAt)
}

func (s *Store) CreateUser(ctx context.Context, email, hash, name string) (User, error) {
	q := `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING ` + userColumns

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, email, hash, name), &u)

	if err != nil {
		// 23505 = unique_violation. Mapped to a domain error so the HTTP layer
		// never has to know Postgres error codes.
		if isUniqueViolation(err) {
			return User{}, ErrDuplicate
		}
		return User{}, fmt.Errorf("store: create user: %w", err)
	}
	return u, nil
}

// CreateUserGoogle creates a brand-new account for a first-time Google
// Sign-In - no password at all, not a generated placeholder one, because a
// generated password nobody knows and nobody can use is not a credential,
// it is a NOT NULL constraint satisfied by fiction.
func (s *Store) CreateUserGoogle(ctx context.Context, email, googleSub, name string) (User, error) {
	q := `
		INSERT INTO users (email, google_sub, display_name)
		VALUES ($1, $2, $3)
		RETURNING ` + userColumns

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, email, googleSub, name), &u)
	if err != nil {
		if isUniqueViolation(err) {
			return User{}, ErrDuplicate
		}
		return User{}, fmt.Errorf("store: create google user: %w", err)
	}
	return u, nil
}

// LinkGoogleSub attaches a Google identity to an EXISTING account (found by
// email) that signed up with a password originally. Google having verified
// the email (checked by the caller before this runs) is what makes this
// safe - the alternative, two separate accounts sharing one inbox with no
// connection between their wallets or profile, would be a worse outcome for
// a real user than an automatic link.
func (s *Store) LinkGoogleSub(ctx context.Context, userID, googleSub string) (User, error) {
	q := `
		UPDATE users SET google_sub = $2
		WHERE id = $1
		RETURNING ` + userColumns

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, userID, googleSub), &u)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("store: link google sub: %w", err)
	}
	return u, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE email = $1 AND deleted_at IS NULL`

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, email), &u)

	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("store: user by email: %w", err)
	}
	return u, nil
}

func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE id = $1 AND deleted_at IS NULL`

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, id), &u)

	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("store: user by id: %w", err)
	}
	return u, nil
}

func (s *Store) UserByGoogleSub(ctx context.Context, sub string) (User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE google_sub = $1 AND deleted_at IS NULL`

	var u User
	err := scanUser(s.pool.QueryRow(ctx, q, sub), &u)

	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("store: user by google sub: %w", err)
	}
	return u, nil
}

func (s *Store) CreateSession(ctx context.Context, userID, refreshHash string, expires time.Time) error {
	const q = `INSERT INTO sessions (user_id, refresh_hash, expires_at) VALUES ($1, $2, $3)`
	if _, err := s.pool.Exec(ctx, q, userID, refreshHash, expires); err != nil {
		return fmt.Errorf("store: create session: %w", err)
	}
	return nil
}

// RotateSession swaps a refresh token for a new one inside a transaction.
//
// Rotation matters: each refresh token is single-use. If a stolen token is
// replayed after the legitimate client has already rotated, the lookup fails
// and the theft is detectable rather than silent.
func (s *Store) RotateSession(ctx context.Context, oldHash, newHash string, expires time.Time) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("store: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var userID string
	const sel = `
		SELECT user_id FROM sessions
		WHERE refresh_hash = $1 AND revoked_at IS NULL AND expires_at > now()
		FOR UPDATE`
	if err := tx.QueryRow(ctx, sel, oldHash).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("store: select session: %w", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE sessions SET revoked_at = now() WHERE refresh_hash = $1`, oldHash); err != nil {
		return "", fmt.Errorf("store: revoke: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, newHash, expires); err != nil {
		return "", fmt.Errorf("store: insert session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("store: commit: %w", err)
	}
	return userID, nil
}

func (s *Store) RevokeAllSessions(ctx context.Context, userID string) error {
	const q = `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`
	if _, err := s.pool.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("store: revoke all: %w", err)
	}
	return nil
}

func isUniqueViolation(err error) bool {
	type sqlState interface{ SQLState() string }
	var pgErr sqlState
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}
