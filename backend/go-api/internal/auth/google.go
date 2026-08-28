package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// GoogleVerifier checks a Google Sign-In ID token's signature and claims.
//
// WHY THIS IS HAND-BUILT ON golang-jwt/v5 RATHER THAN google.golang.org/api
// -----------------------------------------------------------------------------
// Google publishes an official Go client (google.golang.org/api/idtoken) that
// does this in one call. It was deliberately not used: that module pulls in
// the entire Google API client library - generated code for hundreds of
// unrelated APIs - to get one function. golang-jwt/v5 is already a
// dependency (it issues and verifies this app's own tokens), and it already
// implements RS256 signature verification correctly and safely; nothing
// here re-implements cryptography. What this file adds is only the
// orchestration Google's endpoint needs: fetch the public keys, pick the
// right one by `kid`, check the claims that matter (audience, issuer, email
// verification) - the same category of code as the algorithm-pinning check
// in token.go, not a new trust boundary.
var (
	ErrGoogleEmailUnverified = errors.New("auth: google account email is not verified")
	ErrGoogleNotConfigured   = errors.New("auth: google sign-in is not configured")
)

const (
	googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"
	// Google's tokens use either form depending on version; both are
	// documented as valid and checked explicitly rather than assumed.
	googleIssuerHTTPS = "https://accounts.google.com"
	googleIssuerBare  = "accounts.google.com"
)

// GoogleClaims is what this app actually reads out of a verified token.
// Google's tokens carry more (locale, picture, hosted domain...); only the
// fields a real decision depends on are parsed.
type GoogleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	jwt.RegisteredClaims
	// Subject (from RegisteredClaims) is Google's `sub` - the stable,
	// permanent per-account identifier. Never the email: a Google account's
	// email can change, and joining on it would silently hand the account
	// to whoever controls that address next. `sub` cannot change.
}

type googleJWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
}

type GoogleVerifier struct {
	clientID string
	http     *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

// NewGoogleVerifier builds a verifier. An empty clientID is allowed - the
// feature is simply off, and Verify returns ErrGoogleNotConfigured rather
// than the caller needing to check a config flag before every call.
func NewGoogleVerifier(clientID string) *GoogleVerifier {
	return &GoogleVerifier{
		clientID: clientID,
		http:     &http.Client{Timeout: 8 * time.Second},
		keys:     map[string]*rsa.PublicKey{},
	}
}

func (v *GoogleVerifier) Configured() bool { return v.clientID != "" }

// Verify checks the token's RS256 signature against Google's current public
// keys, its audience (must be THIS app's client ID - otherwise a token
// minted for a completely different Google-Sign-In-using app would be
// accepted here), its issuer, and that Google itself has verified the
// email. Returns the claims only once every one of those has passed.
func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error) {
	if !v.Configured() {
		return nil, ErrGoogleNotConfigured
	}

	claims := &GoogleClaims{}
	parsed, err := jwt.ParseWithClaims(idToken, claims, func(t *jwt.Token) (any, error) {
		// Pinned to RS256, the same discipline as token.go's HS256 pin on
		// this app's own tokens - without it, a token signed with "none" or
		// re-signed under a different algorithm would sail through.
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("auth: google token has no kid")
		}
		return v.keyFor(ctx, kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(v.clientID))

	if err != nil || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Issuer != googleIssuerHTTPS && claims.Issuer != googleIssuerBare {
		return nil, ErrInvalidToken
	}
	if !claims.EmailVerified {
		// Google itself is saying it has not confirmed this address belongs
		// to the account holder - trusting it as a login identity anyway is
		// exactly the gap account-takeover via an unverified alias exploits.
		return nil, ErrGoogleEmailUnverified
	}
	return claims, nil
}

// keyFor returns the RSA key for a kid, refreshing Google's key set on a
// cache miss. A miss is the NORMAL way keys rotate (Google publishes new
// keys before retiring old ones), not itself suspicious - only a kid that
// is still missing after a fresh fetch is treated as invalid.
func (v *GoogleVerifier) keyFor(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	k, ok := v.keys[kid]
	stale := time.Since(v.fetchedAt) > time.Hour
	v.mu.RUnlock()
	if ok && !stale {
		return k, nil
	}

	if err := v.refresh(ctx); err != nil {
		// A fetch failure with a still-usable (if stale) cached key is
		// better than hard-failing every login because Google's JWKS
		// endpoint had one bad moment.
		if ok {
			return k, nil
		}
		return nil, fmt.Errorf("auth: fetch google keys: %w", err)
	}

	v.mu.RLock()
	defer v.mu.RUnlock()
	if k, ok := v.keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("auth: unknown google signing key %q", kid)
}

func (v *GoogleVerifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleJWKSURL, nil)
	if err != nil {
		return err
	}
	resp, err := v.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("google jwks returned %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}

	var body struct {
		Keys []googleJWK `json:"keys"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return fmt.Errorf("decode google jwks: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(body.Keys))
	for _, jwk := range body.Keys {
		if jwk.Kty != "RSA" {
			continue
		}
		pub, err := jwkToRSAPublicKey(jwk)
		if err != nil {
			continue // one malformed key should not break every other one
		}
		keys[jwk.Kid] = pub
	}

	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

// jwkToRSAPublicKey decodes the modulus (n) and exponent (e) - base64url,
// big-endian, per RFC 7518 - into a usable key. This is data marshalling,
// not cryptography: golang-jwt performs the actual signature verification
// once it has this struct.
func jwkToRSAPublicKey(jwk googleJWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("decode n: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("decode e: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() {
		return nil, errors.New("exponent out of range")
	}

	return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
}
