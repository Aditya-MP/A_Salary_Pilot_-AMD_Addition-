package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// LoadDotEnv reads KEY=VALUE lines from a .env file into the process
// environment, searching upward from the working directory.
//
// WHY THIS EXISTS
// ---------------
// Without it, DATABASE_URL had to be exported by hand into every shell that
// started the server, and forgetting was not a loud failure: config.Load
// falls back to a localhost DSN, so the process booted happily and only
// reported "database unreachable" from a readiness probe, several layers
// away from the actual cause. A config file that is present but unread is
// worse than no config file at all.
//
// TWO RULES
//
//   - REAL ENVIRONMENT VARIABLES WIN. A value already exported is never
//     overwritten, so `DATABASE_URL=... go run ./cmd/server` still points at
//     the database you named on the command line. This is the conventional
//     precedence, and inverting it makes one-off overrides impossible.
//
//   - MISSING IS FINE. In production there is no .env; configuration comes
//     from the orchestrator. This returns quietly rather than failing.
//
// Deliberately not a dependency. Loading a handful of KEY=VALUE lines does
// not warrant one, and the parsing rules below are the whole format.
func LoadDotEnv() (string, error) {
	path, err := findUp(".env", 4)
	if err != nil || path == "" {
		return "", nil // absent is normal
	}

	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")

		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)

		// Strip one matching pair of surrounding quotes. A DSN containing
		// a '#' would otherwise need them, and keeping the quotes would
		// make the password wrong in a way that reads as "bad credentials".
		if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
			val = val[1 : len(val)-1]
		}

		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue // an explicit export always wins
		}
		if err := os.Setenv(key, val); err != nil {
			return "", err
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}
	return path, nil
}

// findUp walks up from the working directory looking for name. The server is
// started from backend/go-api while the file lives in backend/, and a runner
// that only looks in the current directory would miss it.
func findUp(name string, levels int) (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for i := 0; i <= levels; i++ {
		candidate := filepath.Join(dir, name)
		if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break // reached the filesystem root
		}
		dir = parent
	}
	return "", nil
}
