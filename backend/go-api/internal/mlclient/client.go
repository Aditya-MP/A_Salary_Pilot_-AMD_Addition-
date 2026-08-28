// Package mlclient talks to the Python model service.
package mlclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrUnavailable means the model service could not be reached or was too slow.
//
// Callers are expected to degrade rather than fail: the engines in
// internal/engine are pure Go and keep working when the models are down, so a
// Python outage should cost the user their categorisation suggestions and
// nothing else.
var ErrUnavailable = errors.New("mlclient: model service unavailable")

type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		http: &http.Client{
			// Bounded. Without a timeout a wedged Python service turns into
			// Go goroutines piling up until the API falls over too - one
			// service's outage becoming two.
			Timeout: 8 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        20,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *Client) Healthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/readyz", nil)
	if err != nil {
		return false
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("mlclient: request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("mlclient: %s returned %d: %s", path, resp.StatusCode, msg)
	}

	dec := json.NewDecoder(io.LimitReader(resp.Body, 4<<20))
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("mlclient: decode %s: %w", path, err)
	}
	return nil
}

func (c *Client) post(ctx context.Context, path string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("mlclient: encode: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("mlclient: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("mlclient: %s returned %d: %s", path, resp.StatusCode, msg)
	}

	// Bounded read: a compromised or buggy upstream should not be able to
	// exhaust this process's memory.
	dec := json.NewDecoder(io.LimitReader(resp.Body, 4<<20))
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("mlclient: decode %s: %w", path, err)
	}
	return nil
}

// ── categorise ──────────────────────────────────────────────────────────

type Txn struct {
	Narration string  `json:"narration"`
	Amount    float64 `json:"amount"`
	Channel   string  `json:"channel"`
	Direction string  `json:"direction"`
	Day       string  `json:"day,omitempty"` // YYYY-MM-DD
}

type Prediction struct {
	Category     string  `json:"category"`
	Confidence   float64 `json:"confidence"`
	Alternatives []struct {
		Category    string  `json:"category"`
		Probability float64 `json:"probability"`
	} `json:"alternatives"`
	ModelVersion string `json:"model_version"`
}

type CategoriseResponse struct {
	Results      []Prediction `json:"results"`
	ModelVersion string       `json:"model_version"`
	LatencyMS    float64      `json:"latency_ms"`
	Caveat       string       `json:"caveat"`
}

func (c *Client) Categorise(ctx context.Context, txns []Txn) (*CategoriseResponse, error) {
	var out CategoriseResponse
	err := c.post(ctx, "/v1/categorise",
		map[string]any{"transactions": txns}, &out)
	return &out, err
}

// ── simulate ────────────────────────────────────────────────────────────

type SimulateRequest struct {
	NetWorth          float64 `json:"net_worth"`
	Liquid            float64 `json:"liquid"`
	MonthlyIncome     float64 `json:"monthly_income"`
	EssentialBurn     float64 `json:"essential_burn"`
	DiscretionaryBurn float64 `json:"discretionary_burn"`
	MonthlyInvest     float64 `json:"monthly_invest"`
	Age               int     `json:"age"`
	HorizonYears      int     `json:"horizon_years"`
	RealReturn        float64 `json:"real_return"`
	NPaths            int     `json:"n_paths"`
}

// SimulateResponse mirrors M6. Percentiles are pointers because a nil value
// carries real meaning: more than that share of paths never reach financial
// independence. Encoding "never" as 0, or as some sentinel year, would be a
// lie the frontend would then render as a number.
type SimulateResponse struct {
	FreedomAge struct {
		P10 *float64 `json:"p10"`
		P25 *float64 `json:"p25"`
		P50 *float64 `json:"p50"`
		P75 *float64 `json:"p75"`
		P90 *float64 `json:"p90"`
	} `json:"freedom_age"`
	ProbabilityReachingFI      float64            `json:"probability_reaching_fi"`
	ProbabilityByAge           map[string]float64 `json:"probability_by_age"`
	ProbabilityNeverRunningOut float64            `json:"probability_never_running_out"`
	Assumptions                map[string]any     `json:"assumptions"`
	NPaths                     int                `json:"n_paths"`
	ModelVersion               string             `json:"model_version"`
	LatencyMS                  float64            `json:"latency_ms"`
}

func (c *Client) Simulate(ctx context.Context, req SimulateRequest) (*SimulateResponse, error) {
	var out SimulateResponse
	err := c.post(ctx, "/v1/simulate", req, &out)
	return &out, err
}

// ── M5 · allocate ───────────────────────────────────────────────────────

type AllocateRequest struct {
	RiskProfile string `json:"risk_profile"`
}

// AllocateResponse deliberately carries the model's own caveat and evidence
// through to the caller. M5 reduces volatility and drawdown but earned LESS
// than equal weight in evaluation; a client that receives only the weights
// could present this as a way to make more money, which it is not.
type AllocateResponse struct {
	ModelVersion string             `json:"model_version"`
	RiskProfile  string             `json:"risk_profile"`
	GrowthTilt   float64            `json:"growth_tilt"`
	Weights      map[string]float64 `json:"weights"`
	ExpectedVol  float64            `json:"expected_annual_volatility"`
	EqualVol     float64            `json:"equal_weight_volatility"`
	MaxWeight    float64            `json:"max_single_asset_weight"`
	Evidence     map[string]any     `json:"evidence"`
	Caveat       string             `json:"caveat"`
	// Present only when real market conditions have inverted the usual
	// risk ordering. A pointer, not a bare string: without one, Go's JSON
	// encoder would round-trip Python's `null` as an empty string, which
	// the frontend cannot tell apart from "there is no note" - it would
	// render a blank warning banner instead of nothing at all.
	OrderingNote *string `json:"ordering_note"`
	LatencyMS    float64 `json:"latency_ms"`
}

func (c *Client) Allocate(ctx context.Context, req AllocateRequest) (*AllocateResponse, error) {
	var out AllocateResponse
	if err := c.post(ctx, "/v1/allocate", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ── M8 · screen ─────────────────────────────────────────────────────────

// ScreenResponse deliberately loose (map[string]any): its shape changes
// between "not enabled" (reason only) and "enabled" (full evaluation +
// picks), and forcing one Go struct to cover both would mean either two
// types or a pile of omitempty fields. The frontend already treats this
// endpoint's shape as data to branch on, not a fixed contract - see the
// Screener page.
type ScreenResponse = map[string]any

func (c *Client) Screen(ctx context.Context) (ScreenResponse, error) {
	var out ScreenResponse
	if err := c.get(ctx, "/v1/screen", &out); err != nil {
		return nil, err
	}
	return out, nil
}
