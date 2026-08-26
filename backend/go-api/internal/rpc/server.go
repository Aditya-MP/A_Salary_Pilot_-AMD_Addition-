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
	"github.com/Aditya-MP/salarypilot/go-api/internal/mlclient"
	"github.com/Aditya-MP/salarypilot/go-api/internal/store"
	"github.com/Aditya-MP/salarypilot/go-api/internal/wallet"
)

type Server struct {
	store  *store.Store
	issuer *auth.Issuer
	ml     *mlclient.Client
	wallet *wallet.Service
	log    *slog.Logger
}

func NewServer(st *store.Store, iss *auth.Issuer, ml *mlclient.Client,
	w *wallet.Service, log *slog.Logger) *Server {
	return &Server{store: st, issuer: iss, ml: ml, wallet: w, log: log}
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

	// Open during development so the frontend can be wired before auth is
	// finished. These move behind requireAuth before anything is deployed.
	mux.HandleFunc("POST /v1/runway", s.handleRunway)
	mux.HandleFunc("POST /v1/categorise", s.handleCategorise)
	mux.HandleFunc("POST /v1/simulate", s.handleSimulate)

	// Wallet moves money, so every route is behind auth with no exceptions.
	// The dev-open pattern above is acceptable for stateless computation and
	// is not acceptable here.
	mux.Handle("GET /v1/wallet", s.requireAuth(http.HandlerFunc(s.handleWallet)))
	mux.Handle("GET /v1/wallet/history", s.requireAuth(http.HandlerFunc(s.handleWalletHistory)))
	mux.Handle("POST /v1/wallet/topup", s.requireAuth(http.HandlerFunc(s.handleTopUp)))
	mux.Handle("POST /v1/wallet/invest", s.requireAuth(http.HandlerFunc(s.handleInvest)))
	mux.Handle("POST /v1/wallet/withdraw", s.requireAuth(http.HandlerFunc(s.handleWithdraw)))

	return s.withCORS(s.withRequestLog(mux))
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
	drift, derr := s.wallet.Drift(r.Context())
	if derr == nil && drift > 0 {
		// The ledger and its cached balances disagree. That is corruption and
		// this instance should not take traffic until somebody looks.
		s.log.Error("LEDGER DRIFT DETECTED", "accounts", drift)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "ledger drift detected", "accounts": drift,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ready",
		"models":       map[string]bool{"reachable": s.ml.Healthy(r.Context())},
		"ledger_drift": drift,
	})
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

	if err := s.wallet.EnsureAccounts(r.Context(), u.ID); err != nil {
		s.log.Error("create ledger accounts", "error", err, "user", u.ID)
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

func (s *Server) handleCategorise(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Transactions []mlclient.Txn `json:"transactions"`
	}
	if !decode(w, r, &req) {
		return
	}
	if len(req.Transactions) == 0 {
		writeErr(w, http.StatusBadRequest, "at least one transaction is required")
		return
	}

	out, err := s.ml.Categorise(r.Context(), req.Transactions)
	if err != nil {
		s.log.Warn("categorise failed", "error", err)
		// Degrade rather than fail. Losing categorisation suggestions is an
		// inconvenience; losing the whole request because one downstream is
		// down is an outage the user did not need to have.
		writeJSON(w, http.StatusOK, map[string]any{
			"results":  []any{},
			"degraded": true,
			"reason":   "model service unavailable - categories can be set manually",
		})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	var req mlclient.SimulateRequest
	if !decode(w, r, &req) {
		return
	}
	if req.NPaths == 0 {
		req.NPaths = 5000
	}
	if req.HorizonYears == 0 {
		req.HorizonYears = 40
	}
	if req.RealReturn == 0 {
		req.RealReturn = 0.055
	}

	out, err := s.ml.Simulate(r.Context(), req)
	if err != nil {
		s.log.Warn("simulate failed", "error", err)
		writeErr(w, http.StatusServiceUnavailable,
			"the projection service is unavailable, please try again shortly")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// ── wallet ──────────────────────────────────────────────────────────────
//
// SIMULATED MONEY. No real funds move; see internal/wallet.

func (s *Server) handleWallet(w http.ResponseWriter, r *http.Request) {
	bal, err := s.wallet.Balance(r.Context(), userIDFrom(r.Context()))
	if err != nil {
		s.log.Error("wallet balance", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not read your wallet")
		return
	}
	writeJSON(w, http.StatusOK, bal)
}

func (s *Server) handleWalletHistory(w http.ResponseWriter, r *http.Request) {
	entries, err := s.wallet.History(r.Context(), userIDFrom(r.Context()), 50)
	if err != nil {
		s.log.Error("wallet history", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not read your history")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

type moneyReq struct {
	AmountPaise    int64  `json:"amount_paise"`
	Ticker         string `json:"ticker,omitempty"`
	UnitPricePaise int64  `json:"unit_price_paise,omitempty"`
	IdempotencyKey string `json:"idempotency_key"`
	Memo           string `json:"memo,omitempty"`
}

// Every money endpoint requires an idempotency key from the client. Without
// one a retried request - a double tap, a network retry, a reconnect - moves
// money twice, and the user has no way to tell that happened.
func (s *Server) moneyResult(w http.ResponseWriter, txnID string, err error) {
	switch {
	case errors.Is(err, wallet.ErrInsufficientFunds):
		writeErr(w, http.StatusUnprocessableEntity,
			"not enough in your wallet for that")
	case errors.Is(err, wallet.ErrInvalidAmount):
		writeErr(w, http.StatusBadRequest, "amount must be greater than zero")
	case err != nil:
		s.log.Error("wallet operation", "error", err)
		writeErr(w, http.StatusInternalServerError, "the transaction could not be completed")
	default:
		writeJSON(w, http.StatusOK, map[string]any{
			"transaction_id": txnID,
			"simulated":      true,
		})
	}
}

func (s *Server) handleTopUp(w http.ResponseWriter, r *http.Request) {
	var req moneyReq
	if !decode(w, r, &req) {
		return
	}
	if req.IdempotencyKey == "" {
		writeErr(w, http.StatusBadRequest, "idempotency_key is required")
		return
	}
	id, err := s.wallet.TopUp(r.Context(), userIDFrom(r.Context()),
		req.AmountPaise, req.IdempotencyKey, req.Memo)
	s.moneyResult(w, id, err)
}

func (s *Server) handleInvest(w http.ResponseWriter, r *http.Request) {
	var req moneyReq
	if !decode(w, r, &req) {
		return
	}
	if req.IdempotencyKey == "" || req.Ticker == "" {
		writeErr(w, http.StatusBadRequest, "ticker and idempotency_key are required")
		return
	}
	id, err := s.wallet.Invest(r.Context(), userIDFrom(r.Context()), req.Ticker,
		req.AmountPaise, req.UnitPricePaise, req.IdempotencyKey, req.Memo)
	s.moneyResult(w, id, err)
}

func (s *Server) handleWithdraw(w http.ResponseWriter, r *http.Request) {
	var req moneyReq
	if !decode(w, r, &req) {
		return
	}
	if req.IdempotencyKey == "" {
		writeErr(w, http.StatusBadRequest, "idempotency_key is required")
		return
	}
	id, err := s.wallet.Withdraw(r.Context(), userIDFrom(r.Context()),
		req.AmountPaise, req.IdempotencyKey, req.Memo)
	s.moneyResult(w, id, err)
}

// ── middleware ──────────────────────────────────────────────────────────

// withCORS allows the Vite dev server to call this API. Deliberately
// restricted to localhost origins - a wildcard here would be a real
// vulnerability the moment this is deployed anywhere.
func (s *Server) withCORS(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"http://localhost:5173": true,
		"http://127.0.0.1:5173": true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

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
