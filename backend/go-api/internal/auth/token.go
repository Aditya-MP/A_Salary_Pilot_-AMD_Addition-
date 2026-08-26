package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Two-token scheme.
//
// The access token is a short-lived JWT the API verifies with no database
// round trip. The refresh token is a long-lived opaque random string, stored
// only as a SHA-256 digest, that can be revoked.
//
// The split is the point. A stateless JWT cannot be revoked before it expires,
// so a stolen one is valid until it lapses. Keeping access tokens to fifteen
// minutes bounds that window, while the refresh token stays revocable because
// it is checked against a row we control.
//
// The refresh digest is a bare SHA-256 rather than argon2 on purpose: it is
// 256 bits of cryptographic randomness, not a human-chosen password, so there
// is no dictionary to attack and nothing for a slow hash to buy.
const (
	AccessTTL  = 15 * time.Minute
	RefreshTTL = 30 * 24 * time.Hour
)

var ErrInvalidToken = errors.New("auth: invalid token")

type Claims struct {
	UserID string `json:"uid"`
	jwt.RegisteredClaims
}

type Tokens struct {
	Access       string    `json:"access_token"`
	Refresh      string    `json:"refresh_token"`
	AccessExpiry time.Time `json:"access_expires_at"`
}

type Issuer struct {
	secret []byte
	issuer string
}

func NewIssuer(secret, issuer string) (*Issuer, error) {
	// HMAC security is bounded by key length. Anything under 32 bytes is a
	// weak key regardless of how strong SHA-256 is.
	if len(secret) < 32 {
		return nil, fmt.Errorf("auth: jwt secret must be >= 32 bytes, got %d", len(secret))
	}
	return &Issuer{secret: []byte(secret), issuer: issuer}, nil
}

func (i *Issuer) Issue(userID string) (Tokens, error) {
	now := time.Now()
	exp := now.Add(AccessTTL)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    i.issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			NotBefore: jwt.NewNumericDate(now),
		},
	})

	access, err := tok.SignedString(i.secret)
	if err != nil {
		return Tokens{}, fmt.Errorf("auth: sign: %w", err)
	}

	refresh, err := NewRefreshToken()
	if err != nil {
		return Tokens{}, err
	}

	return Tokens{Access: access, Refresh: refresh, AccessExpiry: exp}, nil
}

// Verify parses and validates an access token.
func (i *Issuer) Verify(token string) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		// Pinning the algorithm is not optional. Without this check an
		// attacker can present a token with alg "none", or swap HMAC for RS256
		// and sign with the public key. Both are classic JWT bypasses.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return i.secret, nil
	}, jwt.WithIssuer(i.issuer), jwt.WithValidMethods([]string{"HS256"}))

	if err != nil || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// NewRefreshToken returns 256 bits of base64url randomness.
func NewRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: read random: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashRefreshToken returns the digest stored in sessions.refresh_hash.
func HashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
