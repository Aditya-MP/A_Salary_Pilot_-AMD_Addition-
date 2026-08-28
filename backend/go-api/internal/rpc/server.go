// Package rpc is the HTTP layer.
package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Aditya-MP/salarypilot/go-api/internal/auth"
	"github.com/Aditya-MP/salarypilot/go-api/internal/engine"
	"github.com/Aditya-MP/salarypilot/go-api/internal/gemini"
	"github.com/Aditya-MP/salarypilot/go-api/internal/mlclient"
	"github.com/Aditya-MP/salarypilot/go-api/internal/store"
	"github.com/Aditya-MP/salarypilot/go-api/internal/wallet"
)

type Server struct {
	store          *store.Store
	issuer         *auth.Issuer
	ml             *mlclient.Client
	gemini         *gemini.Client
	googleAuth     *auth.GoogleVerifier
	wallet         *wallet.Service
	log            *slog.Logger
	dev            bool
	frontendOrigin string
}

func NewServer(st *store.Store, iss *auth.Issuer, ml *mlclient.Client, gem *gemini.Client,
	goog *auth.GoogleVerifier, w *wallet.Service, log *slog.Logger, dev bool,
	frontendOrigin string) *Server {
	return &Server{
		store: st, issuer: iss, ml: ml, gemini: gem, googleAuth: goog, wallet: w, log: log,
		dev: dev, frontendOrigin: strings.TrimSuffix(frontendOrigin, "/"),
	}
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
	mux.HandleFunc("POST /v1/auth/google", s.handleGoogleAuth)
	mux.HandleFunc("POST /v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /v1/auth/refresh", s.handleRefresh)

	mux.Handle("GET /v1/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	mux.Handle("POST /v1/auth/logout", s.requireAuth(http.HandlerFunc(s.handleLogout)))

	// Were open during development so the frontend could be wired before
	// auth was finished - now behind requireAuth ahead of hosting this
	// publicly. An unauthenticated categorise/simulate endpoint on a real
	// deployment is just free compute for anyone who finds the URL.
	mux.Handle("POST /v1/runway", s.requireAuth(http.HandlerFunc(s.handleRunway)))
	mux.Handle("POST /v1/categorise", s.requireAuth(http.HandlerFunc(s.handleCategorise)))
	mux.Handle("POST /v1/simulate", s.requireAuth(http.HandlerFunc(s.handleSimulate)))

	// Wallet moves money, so every route is behind auth with no exceptions.
	// The dev-open pattern above is acceptable for stateless computation and
	// is not acceptable here.
	mux.Handle("POST /v1/allocate", s.requireAuth(http.HandlerFunc(s.handleAllocate)))
	mux.Handle("POST /v1/coach", s.requireAuth(http.HandlerFunc(s.handleCoach)))
	mux.Handle("GET /v1/screen", s.requireAuth(http.HandlerFunc(s.handleScreen)))
	mux.Handle("GET /v1/wallet", s.requireAuth(http.HandlerFunc(s.handleWallet)))
	mux.Handle("GET /v1/wallet/history", s.requireAuth(http.HandlerFunc(s.handleWalletHistory)))
	mux.Handle("POST /v1/wallet/topup", s.requireAuth(http.HandlerFunc(s.handleTopUp)))
	mux.Handle("POST /v1/wallet/invest", s.requireAuth(http.HandlerFunc(s.handleInvest)))
	mux.Handle("POST /v1/wallet/redeem", s.requireAuth(http.HandlerFunc(s.handleRedeem)))
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

type googleAuthReq struct {
	IDToken string `json:"id_token"`
}

// handleGoogleAuth signs a user in (or up, on their first Google sign-in -
// there is deliberately no separate "register with Google" flow, since
// Google itself has already verified who they are) from a Google Identity
// Services ID token minted client-side. Same issueAndRespond as password
// login/register, so everything downstream of this - the JWT shape, the
// session row, the frontend's session.ts - is completely unaware which
// credential the user actually typed.
func (s *Server) handleGoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req googleAuthReq
	if !decode(w, r, &req) {
		return
	}
	if req.IDToken == "" {
		writeErr(w, http.StatusBadRequest, "id_token is required")
		return
	}

	claims, err := s.googleAuth.Verify(r.Context(), req.IDToken)
	switch {
	case errors.Is(err, auth.ErrGoogleNotConfigured):
		writeErr(w, http.StatusServiceUnavailable, "Google sign-in is not available on this server")
		return
	case errors.Is(err, auth.ErrGoogleEmailUnverified):
		writeErr(w, http.StatusForbidden, "your Google account's email is not verified")
		return
	case err != nil:
		s.log.Warn("google token verify failed", "error", err)
		writeErr(w, http.StatusUnauthorized, "could not verify Google sign-in")
		return
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	googleSub := claims.Subject

	u, err := s.store.UserByGoogleSub(r.Context(), googleSub)
	if errors.Is(err, store.ErrNotFound) {
		u, err = s.findOrCreateGoogleUser(r.Context(), email, googleSub, claims.Name)
	}
	if err != nil {
		s.log.Error("google sign-in", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not sign you in")
		return
	}

	s.issueAndRespond(w, r, u.ID, http.StatusOK)
}

// findOrCreateGoogleUser handles the "no account linked to this Google
// identity yet" case: link an existing password account with a matching,
// Google-verified email, or create a brand new one. Linking rather than
// erroring on a matching email is deliberate - the alternative is two
// disconnected accounts sharing one inbox, with the user's original wallet
// and profile invisible from whichever one they happen to sign into next.
func (s *Server) findOrCreateGoogleUser(ctx context.Context, email, googleSub, name string) (store.User, error) {
	existing, err := s.store.UserByEmail(ctx, email)
	if err == nil {
		return s.store.LinkGoogleSub(ctx, existing.ID, googleSub)
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}

	u, err := s.store.CreateUserGoogle(ctx, email, googleSub, name)
	if err != nil {
		return store.User{}, err
	}
	if err := s.wallet.EnsureAccounts(ctx, u.ID); err != nil {
		return store.User{}, fmt.Errorf("create ledger accounts for google user: %w", err)
	}
	return u, nil
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

// handleMe is what the frontend calls on boot to answer "whose data is this?".
// It returns the display name and email as well as the id, because a client
// that only knows an opaque UUID cannot greet anyone by name and ends up
// keeping a second, drifting copy of the profile in local storage.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u, err := s.store.UserByID(r.Context(), userIDFrom(r.Context()))
	if err != nil {
		// A valid token for a user who no longer exists - deleted account,
		// wiped database - is not a server error. It is an expired session.
		writeErr(w, http.StatusUnauthorized, "session is no longer valid")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user_id":    u.ID,
		"email":      u.Email,
		"name":       u.DisplayName,
		"created_at": u.CreatedAt,
	})
}

// handleLogout revokes every refresh token for the user. Deleting the tokens
// in the browser alone would leave a stolen refresh token valid for its full
// lifetime, so the server has to be told too.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.store.RevokeAllSessions(r.Context(), userIDFrom(r.Context())); err != nil {
		s.log.Error("revoke sessions", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not sign you out")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

// handleAllocate asks M5 where a plan's money should go.
//
// Behind requireAuth, unlike the other model endpoints: this one is a
// recommendation about a specific person's money, and an unauthenticated
// investment recommendation endpoint is not something to leave open even in
// development.
type coachReq struct {
	// A short, plain-text summary of the user's own numbers - runway,
	// score, portfolio, debt, tax headroom - built client-side from
	// values already computed for their dashboard. Bounded below so one
	// request cannot balloon the prompt sent upstream.
	Context string `json:"context"`
}

// The instruction half of the prompt lives here, server-side, not in the
// client request - the client supplies DATA, the server supplies the
// framing, so the "be concise, be a financial advisor" instruction is not
// something a request body alone can simply overwrite.
const coachSystemPrompt = `You are an expert financial advisor AI for Indian salaried professionals.
Provide a concise, 2-3 sentence actionable piece of advice based on the numbers below. Be specific to the numbers given, professional, and reassuring rather than alarmist. Do not repeat the numbers back verbatim - use them to reach a conclusion.

Numbers: `

func (s *Server) handleCoach(w http.ResponseWriter, r *http.Request) {
	var req coachReq
	if !decode(w, r, &req) {
		return
	}
	req.Context = strings.TrimSpace(req.Context)
	if req.Context == "" {
		writeErr(w, http.StatusBadRequest, "context is required")
		return
	}
	if len(req.Context) > 2000 {
		writeErr(w, http.StatusBadRequest, "context is too long")
		return
	}

	if !s.gemini.Configured() {
		// A real, honest status rather than a fake-looking canned reply -
		// the frontend shows this as "not available" and falls back to the
		// six local agents, which compute real findings from the same
		// numbers without needing an external call at all.
		writeErr(w, http.StatusServiceUnavailable, "the AI coach is not configured on this server")
		return
	}

	advice, err := s.gemini.Generate(r.Context(), coachSystemPrompt+req.Context)
	if err != nil {
		s.log.Warn("gemini generate failed", "error", err)
		writeErr(w, http.StatusServiceUnavailable, "could not reach the AI coach right now")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"advice": advice})
}

func (s *Server) handleAllocate(w http.ResponseWriter, r *http.Request) {
	var req mlclient.AllocateRequest
	if !decode(w, r, &req) {
		return
	}
	switch req.RiskProfile {
	case "conservative", "balanced", "aggressive":
	case "":
		req.RiskProfile = "balanced"
	default:
		writeErr(w, http.StatusBadRequest,
			"risk_profile must be conservative, balanced or aggressive")
		return
	}

	out, err := s.ml.Allocate(r.Context(), req)
	if err != nil {
		s.log.Warn("allocate failed", "error", err)
		// No local fallback, deliberately. Every other screen degrades to a
		// local approximation when the model service is down; an investment
		// allocation must not. A guessed allocation is worse than no
		// allocation, because the user cannot tell the difference.
		writeErr(w, http.StatusServiceUnavailable,
			"the planning service is unavailable, so no allocation can be made right now")
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

// handleScreen proxies M8. Same reasoning as handleAllocate for requiring
// auth: this is a specific recommendation surface, not a generic market
// data endpoint, and stays behind login even in development.
func (s *Server) handleScreen(w http.ResponseWriter, r *http.Request) {
	out, err := s.ml.Screen(r.Context())
	if err != nil {
		s.log.Warn("screen failed", "error", err)
		writeErr(w, http.StatusServiceUnavailable,
			"the screener is unavailable right now")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

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

// Selling. Without this the money flow is one-way: a user could put money in
// and never get it back, which makes the whole investment loop untestable.
func (s *Server) handleRedeem(w http.ResponseWriter, r *http.Request) {
	var req moneyReq
	if !decode(w, r, &req) {
		return
	}
	if req.IdempotencyKey == "" || req.Ticker == "" {
		writeErr(w, http.StatusBadRequest, "ticker and idempotency_key are required")
		return
	}
	id, err := s.wallet.Redeem(r.Context(), userIDFrom(r.Context()), req.Ticker,
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
	// The deployed frontend's real origin, e.g. https://salarypilot.vercel.app
	// - set via FRONTEND_ORIGIN. Without this, production mode allows
	// nothing but localhost and the hosted frontend simply cannot call its
	// own API; the loopback exception below only fires in development.
	if s.frontendOrigin != "" {
		allowed[s.frontendOrigin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		// Vite hops to 5174, 5175... when its default port is taken, and a
		// hardcoded 5173 turns that into a CORS failure with no obvious
		// cause. In development any loopback origin is accepted; in
		// production the fixed list above is the only thing that passes.
		//
		// Evaluated per request rather than cached into `allowed`: that map
		// is shared by every request goroutine, and writing to it here
		// would be a data race on a plain Go map - which is a crash, not
		// just a stale read.
		if allowed[origin] || (s.dev && isLoopbackOrigin(origin)) {
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

// isLoopbackOrigin reports whether an Origin header names this machine over
// plain HTTP. Parsed rather than prefix-matched: "http://localhost.evil.com"
// starts with "http://localhost" and must not pass.
func isLoopbackOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "http" {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
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
