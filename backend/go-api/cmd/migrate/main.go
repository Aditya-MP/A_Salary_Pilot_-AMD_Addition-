// Command migrate applies SQL migrations in order.
//
//	go run ./cmd/migrate            apply everything pending
//	go run ./cmd/migrate -status    show what is applied
//
// The Docker compose entrypoint used to run these automatically on first
// boot. Without Docker that job needs an owner, and a 150-line runner is
// preferable to a dependency for something this simple.
//
// Three properties that matter:
//
//   - EACH MIGRATION RUNS IN A TRANSACTION. A failure half way leaves nothing
//     behind, so a broken migration is a broken deploy rather than a database
//     in a state no migration can describe.
//
//   - CHECKSUMS ARE VERIFIED. Editing a migration that already ran is the
//     classic way to make two environments silently diverge; this refuses.
//
//   - IT IS IDEMPOTENT. Running it twice is a no-op, so it can go in a
//     deploy script without a guard around it.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const schemaTable = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version     TEXT PRIMARY KEY,
	checksum    TEXT NOT NULL,
	applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	duration_ms INT NOT NULL
)`

type migration struct {
	version  string
	path     string
	sql      string
	checksum string
}

func main() {
	status := flag.Bool("status", false, "show applied migrations and exit")
	dir := flag.String("dir", "../db/migrations", "migrations directory")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr,
			"DATABASE_URL is not set.\n\n"+
				"Get a free Postgres URL at https://neon.tech, then:\n"+
				`  export DATABASE_URL="postgres://user:pass@host.neon.tech/db?sslmode=require"`)
		os.Exit(1)
	}

	if err := run(dsn, *dir, *status); err != nil {
		fmt.Fprintf(os.Stderr, "\nmigrate: %v\n", err)
		os.Exit(1)
	}
}

func run(dsn, dir string, statusOnly bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	var version string
	if err := conn.QueryRow(ctx, "SELECT version()").Scan(&version); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	fmt.Printf("connected: %s\n\n", truncate(version, 60))

	if _, err := conn.Exec(ctx, schemaTable); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	files, err := load(dir)
	if err != nil {
		return err
	}

	applied := map[string]string{}
	rows, err := conn.Query(ctx, "SELECT version, checksum FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("read applied: %w", err)
	}
	for rows.Next() {
		var v, c string
		if err := rows.Scan(&v, &c); err != nil {
			return err
		}
		applied[v] = c
	}
	rows.Close()

	if statusOnly {
		fmt.Printf("  %-28s %s\n", "MIGRATION", "STATUS")
		fmt.Printf("  %s\n", strings.Repeat("-", 48))
		for _, m := range files {
			switch got, ok := applied[m.version]; {
			case !ok:
				fmt.Printf("  %-28s pending\n", m.version)
			case got != m.checksum:
				fmt.Printf("  %-28s CHECKSUM MISMATCH\n", m.version)
			default:
				fmt.Printf("  %-28s applied\n", m.version)
			}
		}
		return nil
	}

	pending := 0
	for _, m := range files {
		if got, ok := applied[m.version]; ok {
			// An already-applied migration whose file has changed means two
			// environments will disagree about the schema and nothing will
			// say so. Refuse rather than guess.
			if got != m.checksum {
				return fmt.Errorf(
					"%s was already applied but its contents changed\n"+
						"      applied checksum %s\n"+
						"      file checksum    %s\n"+
						"    Write a new migration instead of editing this one",
					m.version, got[:12], m.checksum[:12])
			}
			continue
		}
		pending++

		start := time.Now()
		fmt.Printf("  applying %-24s", m.version)

		// One transaction per migration: DDL is transactional in PostgreSQL,
		// which many databases cannot say.
		tx, err := conn.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin %s: %w", m.version, err)
		}

		if _, err := tx.Exec(ctx, m.sql); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Println("FAILED")
			return fmt.Errorf("%s: %w", m.version, err)
		}

		ms := int(time.Since(start).Milliseconds())
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version, checksum, duration_ms) VALUES ($1,$2,$3)`,
			m.version, m.checksum, ms,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record %s: %w", m.version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", m.version, err)
		}
		fmt.Printf("ok  %dms\n", ms)
	}

	if pending == 0 {
		fmt.Println("  nothing to apply — schema is up to date")
	} else {
		fmt.Printf("\n  %d migration(s) applied\n", pending)
	}

	// The ledger's own health check. If money has appeared or vanished, this
	// is where it shows up, and it costs nothing to look every deploy.
	var total int64
	if err := conn.QueryRow(ctx, `SELECT total_paise FROM ledger_total`).Scan(&total); err == nil {
		if total != 0 {
			return fmt.Errorf("LEDGER DOES NOT BALANCE: total is %d paise, must be 0", total)
		}
		fmt.Println("  ledger balances to zero ✓")
	}
	return nil
}

func load(dir string) ([]migration, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return nil, fmt.Errorf("glob: %w", err)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("no .sql files found in %s", dir)
	}
	sort.Strings(paths)

	out := make([]migration, 0, len(paths))
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", p, err)
		}
		sum := sha256.Sum256(b)
		out = append(out, migration{
			version:  strings.TrimSuffix(filepath.Base(p), ".sql"),
			path:     p,
			sql:      string(b),
			checksum: hex.EncodeToString(sum[:]),
		})
	}
	return out, nil
}

func truncate(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
