// Package gemini talks to Google's Generative Language API, server-side.
//
// WHY THIS EXISTS AS A SEPARATE PACKAGE, SERVER-SIDE
// -----------------------------------------------------
// A previous version called Gemini directly from the browser, with the API
// key read from a Vite env var (VITE_GEMINI_API_KEY). Vite inlines any
// VITE_-prefixed variable into the built JS bundle at compile time - so that
// key was shipped to every visitor's browser in plain text, extractable from
// the network tab or the bundle itself with no effort at all. Harmless on a
// laptop nobody else can reach; a real, billable, easily-abused leak the
// moment this project is actually hosted, which is exactly the plan.
//
// Every other secret this backend holds (the database URL, the JWT signing
// key) lives here, server-side, for the same reason. This is that.
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var ErrUnavailable = errors.New("gemini: service unavailable")

// ErrNotConfigured means no API key was set. Distinguished from
// ErrUnavailable so a caller can tell "this feature isn't turned on" apart
// from "it's turned on and something is wrong."
var ErrNotConfigured = errors.New("gemini: no API key configured")

const baseURL = "https://generativelanguage.googleapis.com/v1beta/models"

type Client struct {
	apiKey string
	model  string
	http   *http.Client
}

func New(apiKey, model string) *Client {
	return &Client{
		apiKey: apiKey,
		model:  model,
		http: &http.Client{
			// Generation genuinely takes a few seconds; bounded so a slow
			// or wedged upstream call cannot pile up goroutines the way an
			// unbounded one would.
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) Configured() bool { return c.apiKey != "" }

type generateRequest struct {
	Contents         []content        `json:"contents"`
	GenerationConfig generationConfig `json:"generationConfig"`
}

type content struct {
	Parts []part `json:"parts"`
}

type part struct {
	Text string `json:"text"`
}

type generationConfig struct {
	Temperature     float64        `json:"temperature"`
	MaxOutputTokens int            `json:"maxOutputTokens"`
	ThinkingConfig  thinkingConfig `json:"thinkingConfig"`
}

type thinkingConfig struct {
	ThinkingBudget int `json:"thinkingBudget"`
}

type generateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []part `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
}

// Generate sends one prompt and returns the model's text reply.
//
// Deliberately single-turn, no chat history kept server-side: the coach's
// prompt is rebuilt fresh from the user's current numbers on every call (see
// rpc/coach.go), so there is nothing stateful for a "conversation" to mean
// here yet, and no per-user history to accidentally leak between requests.
func (c *Client) Generate(ctx context.Context, prompt string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}

	body, err := json.Marshal(generateRequest{
		Contents: []content{{Parts: []part{{Text: prompt}}}},
		GenerationConfig: generationConfig{
			// Low temperature: this is meant to read as a careful,
			// consistent second opinion on someone's real finances, not a
			// creative-writing exercise. A wildly varying answer to the
			// same numbers would undermine the "show your reasoning"
			// framing the rest of this app is built around.
			Temperature:     0.3,
			MaxOutputTokens: 300,
			// gemini-2.5-flash spends part of maxOutputTokens on invisible
			// "thinking" tokens before it writes anything visible - verified
			// directly: a 300-token budget with thinking left ON produced
			// 286 tokens of hidden reasoning and a response truncated
			// mid-word (finishReason MAX_TOKENS). This is a short,
			// low-stakes advisory sentence, not a task that benefits from
			// extended reasoning, so thinking is disabled outright rather
			// than just raising the budget and hoping it's enough.
			ThinkingConfig: thinkingConfig{ThinkingBudget: 0},
		},
	})
	if err != nil {
		return "", fmt.Errorf("gemini: encode request: %w", err)
	}

	url := fmt.Sprintf("%s/%s:generateContent", baseURL, c.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("gemini: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// The key travels as a header, not a query parameter, so it never
	// lands in a proxy access log or a browser history entry - it is a
	// server-to-server call, but the habit is worth keeping regardless.
	req.Header.Set("x-goog-api-key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	// Bounded read: an upstream that misbehaves should not be able to
	// exhaust this process's memory.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("gemini: read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		// The key must never appear in an error string that could end up
		// in a log line - this response body is Google's, not ours, and
		// does not contain the key, but nothing here echoes the request
		// body back either, on principle.
		return "", fmt.Errorf("%w: status %d: %s", ErrUnavailable, resp.StatusCode, truncate(string(raw), 300))
	}

	var out generateResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("gemini: decode response: %w", err)
	}

	if out.PromptFeedback != nil && out.PromptFeedback.BlockReason != "" {
		return "", fmt.Errorf("%w: blocked (%s)", ErrUnavailable, out.PromptFeedback.BlockReason)
	}
	if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("%w: empty response", ErrUnavailable)
	}

	var text strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		text.WriteString(p.Text)
	}
	return strings.TrimSpace(text.String()), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
