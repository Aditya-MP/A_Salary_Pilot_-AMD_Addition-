// Package config loads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Env          string
	Addr         string
	DatabaseURL  string
	RedisURL     string
	JWTSecret    string
	JWTIssuer    string
	MLServiceURL string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// Load reads configuration and fails loudly if anything required is missing.
//
// Deliberately fail-fast rather than falling back to defaults for secrets. A
// service that silently boots with a default JWT signing key is worse than one
// that refuses to start, because it looks healthy while being trivially
// forgeable.
func Load() (Config, error) {
	c := Config{
		Env:          env("APP_ENV", "development"),
		Addr:         env("ADDR", ":8080"),
		DatabaseURL:  env("DATABASE_URL", "postgres://salarypilot:dev_only_never_ship@localhost:5432/salarypilot?sslmode=disable"),
		RedisURL:     env("REDIS_URL", "localhost:6379"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		JWTIssuer:    env("JWT_ISSUER", "salarypilot"),
		MLServiceURL: env("ML_SERVICE_URL", "http://localhost:8000"),
		ReadTimeout:  duration("READ_TIMEOUT", 10*time.Second),
		WriteTimeout: duration("WRITE_TIMEOUT", 20*time.Second),
	}

	if c.JWTSecret == "" {
		if c.Env != "development" {
			return c, fmt.Errorf("config: JWT_SECRET is required outside development")
		}
		// A fixed, obviously-fake development key. Named so that if it ever
		// shows up in a production log, the problem is unmistakable.
		c.JWTSecret = "dev-only-insecure-signing-key-do-not-ship-32b"
	}

	if len(c.JWTSecret) < 32 {
		return c, fmt.Errorf("config: JWT_SECRET must be at least 32 bytes, got %d", len(c.JWTSecret))
	}

	return c, nil
}

func (c Config) IsProduction() bool { return c.Env == "production" }

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func duration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	if secs, err := strconv.Atoi(v); err == nil {
		return time.Duration(secs) * time.Second
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	return fallback
}
