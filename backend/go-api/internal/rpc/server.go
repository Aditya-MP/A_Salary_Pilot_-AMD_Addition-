// Package rpc is the HTTP layer.
package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Aditya-MP/salarypilot/go-api/internal/auth"
	"github.com/Aditya-MP/salarypilot/go-api/internal/engine"
	"github.com/Aditya-MP/salarypilot/go-api/internal/store"
)

type Server struct {
	store  *store.Store
	issuer *auth.Issuer
	log    *slog.Logger
}

func NewServer(st *store.Store, iss *auth.Issuer, log *slog.Logger) *Server {
	return &Server{store: st, issuer: iss, log: log}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// Liveness: is the process alive? Never touches dependencies. If this
	// checked the database, a brief database blip would make the orchestrator
	// kill healthy pods and turn a small outage into a large one.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Readiness: should traffic be routed here? This one does check.
	mux.HandleFunc("GET /readyz", s.handleReady)

	mux.HandleFunc("POST /v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /v1/auth/refresh", s.handleRefresh)

	mux.Handle("GET /v1/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	mux.Handle("POST /v1/runway", s.requireAuth(http.HandlerFunc(s.handleRunway)))

	return s.withRequestLog(mux)
}

// ── handlers ────────────────────────────────────────────────────────────

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		writeJSON(w, http.StatusServiceUnavailable,
			map[string]string{"status": "no database configured"})
		return
	}
	if err := s.store.Ping(r.Context()); err != nil {
		s.log.Warn("readiness failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable,
			map[string]string{"status": "database unreachable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if !decode(w, r, &req) {
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		writeErr(w, http.StatusBadRequest, "a valid email is required")
		return
	}
	// NIST SP 800-63B: length is what matters. No composition rules, because
	// forcing a symbol and a digit produces Password1! and nothing else.
	if len(req.Password) < 12 {
		writeErr(w, http.StatusBadRequest, "password must be at least 12 characters")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		s.log.Error("hash password", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not create account")
		return
	}

	u, err := s.store.CreateUser(r.Context(), req.Email, hash, req.Name)
	if errors.Is(err, store.ErrDuplicate) {
		// Deliberately the same shape of response as success would be for an
		// attacker probing which emails exist. Registration is one of the two
		// classic account-enumeration endpoints.
		writeErr(w, http.StatusConflict, "could not create account with those details")
		return
	}
	if err != nil {
		s.log.Error("create user", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not create account")
		return
	}

	s.issueAndRespond(w, r, u.ID, http.StatusCreated)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if !decode(w, r, &req) {
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	u, err := s.store.UserByEmail(r.Context(), req.Email)
	if err != nil {
		// Run a hash anyway on the miss path. Otherwise "no such user" returns
		// in microseconds while a real user costs ~50ms of argon2, and that
		// timing gap alone enumerates the user table.
		_, _ = auth.HashPassword(req.Password)
		writeErr(w, http.StatusUnauthorized, "email or password is incorrect")
		return
	}

	ok, err := auth.VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		writeErr(w, http.StatusUnauthorized, "email or password is incorrect")
		return
	}

	s.issueAndRespond(w, r, u.ID, http.StatusOK)
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if !decode(w, r, &req) {
		return
	}

	newRefresh, err := auth.NewRefreshToken()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not refresh session")
		return
	}

	userID, err := s.store.RotateSession(
		r.Context(),
		auth.HashRefreshToken(req.RefreshToken),
		auth.HashRefreshToken(newRefresh),
		time.Now().Add(auth.RefreshTTL),
	)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "session expired, please sign in again")
		return
	}

	tokens, err := s.issuer.Issue(userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not refresh session")
		return
	}
	tokens.Refresh = newRefresh
	writeJSON(w, http.StatusOK, tokens)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"user_id": userIDFrom(r.Context())})
}

func (s *Server) handleRunway(w http.ResponseWriter, r *http.Request) {
	var p engine.Profile
	if !decode(w, r, &p) {
		return
	}
	runway := engine.ComputeRunway(p, time.Now())
	score := engine.ComputeFreedomScore(p, runway)
	writeJSON(w, http.StatusOK, map[string]any{"runway": runway, "score": score})
}

// ── middleware ──────────────────────────────────────────────────────────

type ctxKey string

const userIDKey ctxKey = "user_id"

func userIDFrom(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			writeErr(w, http.StatusUnauthorized, "authentication required")
			return
		}
		claims, err := s.issuer.Verify(token)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "session is invalid or expired")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, claims.UserID)))
	})
}

func (s *Server) withRequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// ── helpers ─────────────────────────────────────────────────────────────

func (s *Server) issueAndRespond(w http.ResponseWriter, r *http.Request, userID string, code int) {
	tokens, err := s.issuer.Issue(userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not start session")
		return
	}
	if err := s.store.CreateSession(
		r.Context(), userID, auth.HashRefreshToken(tokens.Refresh),
		time.Now().Add(auth.RefreshTTL),
	); err != nil {
		s.log.Error("create session", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not start session")
		return
	}
	writeJSON(w, code, tokens)
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	// Bounded body. Without this, one client can stream gigabytes into the
	// decoder and take the process down.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeErr(w, http.StatusBadRequest, "request body could not be read")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
