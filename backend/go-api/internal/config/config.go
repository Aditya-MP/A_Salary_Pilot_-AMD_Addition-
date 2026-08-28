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
	// GeminiAPIKey is intentionally NOT logged anywhere, including in the
	// "starting" log line other config values appear in - see main.go.
	GeminiAPIKey string
	GeminiModel  string
	// FrontendOrigin is the deployed frontend's real origin (e.g.
	// https://salarypilot.vercel.app) - added to the CORS allowlist in
	// production, where the loopback-origin exception in withCORS does not
	// apply. Empty is fine locally; production should set this or the
	// deployed frontend simply cannot call the API at all.
	FrontendOrigin string
	// GoogleClientID is NOT a secret - Google's OAuth Web Client ID is
	// designed to be embedded in frontend JS (the whole Google Identity
	// Services flow depends on the browser having it). It is read here
	// purely as the expected `aud` claim to check incoming ID tokens
	// against, matching the SAME value the frontend was given.
	GoogleClientID string
	ReadTimeout    time.Duration
	WriteTimeout   time.Duration
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
		Addr:         addr(),
		DatabaseURL:  env("DATABASE_URL", "postgres://salarypilot:dev_only_never_ship@localhost:5432/salarypilot?sslmode=disable"),
		RedisURL:     env("REDIS_URL", "localhost:6379"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		JWTIssuer:    env("JWT_ISSUER", "salarypilot"),
		MLServiceURL: env("ML_SERVICE_URL", "http://localhost:8000"),
		GeminiAPIKey: os.Getenv("GEMINI_API_KEY"),
		// A pinned, stable (non-preview) model, not "-latest" - a moving
		// alias can change behaviour under a hosted deployment with no
		// code change to explain why. Override via env if the key's
		// available models change.
		GeminiModel:    env("GEMINI_MODEL", "gemini-2.5-flash"),
		FrontendOrigin: os.Getenv("FRONTEND_ORIGIN"),
		GoogleClientID: os.Getenv("GOOGLE_CLIENT_ID"),
		ReadTimeout:    duration("READ_TIMEOUT", 10*time.Second),
		WriteTimeout:   duration("WRITE_TIMEOUT", 20*time.Second),
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

// addr resolves the listen address. ADDR (this project's own convention,
// e.g. ":8087") wins if set. Otherwise falls back to PORT - the convention
// Render, Railway, Heroku and most PaaS platforms inject, as a bare number
// with no colon (e.g. "10000") - converted into the ":10000" form
// http.Server actually wants. Without this fallback, the app boots fine
// but never binds the port the platform is health-checking, and every
// deploy looks like a silent, unexplained failure.
func addr() string {
	if v := os.Getenv("ADDR"); v != "" {
		return v
	}
	if v := os.Getenv("PORT"); v != "" {
		return ":" + v
	}
	return ":8080"
}

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
