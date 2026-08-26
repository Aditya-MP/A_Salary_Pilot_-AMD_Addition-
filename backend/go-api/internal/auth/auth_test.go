package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-at-least-thirty-two-bytes-long!"

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	ok, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil || !ok {
		t.Fatalf("correct password rejected: ok=%v err=%v", ok, err)
	}

	ok, err = VerifyPassword("Correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ok {
		t.Fatal("wrong password accepted")
	}
}

// Every hash must carry its own random salt. If two identical passwords
// produce identical digests, one rainbow table breaks every account at once.
func TestPasswordsAreSalted(t *testing.T) {
	a, _ := HashPassword("same password")
	b, _ := HashPassword("same password")

	if a == b {
		t.Fatal("identical passwords produced identical hashes - salt is missing")
	}

	for _, h := range []string{a, b} {
		if ok, _ := VerifyPassword("same password", h); !ok {
			t.Fatal("salted hash failed to verify")
		}
	}
}

func TestPasswordHashEncodesItsParameters(t *testing.T) {
	hash, _ := HashPassword("x")
	// PHC format: $argon2id$v=19$m=19456,t=2,p=1$salt$digest
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("unexpected hash format: %s", hash)
	}
	if got := strings.Count(hash, "$"); got != 5 {
		t.Fatalf("expected 5 separators, got %d in %s", got, hash)
	}
}

func TestMalformedHashRejected(t *testing.T) {
	for _, bad := range []string{
		"",
		"not-a-hash",
		"$argon2id$v=19$m=19456,t=2,p=1$onlyfourparts",
		"$bcrypt$v=19$m=19456,t=2,p=1$c2FsdA$ZGlnZXN0",
	} {
		if _, err := VerifyPassword("x", bad); err == nil {
			t.Errorf("malformed hash accepted: %q", bad)
		}
	}
}

func TestNeedsRehash(t *testing.T) {
	current, _ := HashPassword("x")
	if NeedsRehash(current) {
		t.Error("a freshly created hash should not need rehashing")
	}
	// A hash made when the cost was lower must be flagged for upgrade.
	weak := "$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHRzYWx0$ZGlnZXN0ZGlnZXN0"
	if !NeedsRehash(weak) {
		t.Error("weak-parameter hash should need rehashing")
	}
}

// ── tokens ──────────────────────────────────────────────────────────────

func TestTokenRoundTrip(t *testing.T) {
	iss, err := NewIssuer(testSecret, "salarypilot")
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}

	tokens, err := iss.Issue("user-123")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	claims, err := iss.Verify(tokens.Access)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Fatalf("uid: got %q, want %q", claims.UserID, "user-123")
	}
	if tokens.Refresh == "" {
		t.Fatal("no refresh token issued")
	}
}

func TestShortSecretRejected(t *testing.T) {
	if _, err := NewIssuer("too-short", "salarypilot"); err == nil {
		t.Fatal("issuer accepted a secret under 32 bytes")
	}
}

// The classic JWT bypass: present a token signed with "alg": "none" and hope
// the library trusts the header. It must not.
func TestAlgNoneAttackRejected(t *testing.T) {
	iss, _ := NewIssuer(testSecret, "salarypilot")

	forged := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		UserID: "attacker",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "salarypilot",
			Subject:   "attacker",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	raw, err := forged.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("could not build the forged token: %v", err)
	}

	if _, err := iss.Verify(raw); err == nil {
		t.Fatal("SECURITY: a token signed with alg=none was accepted")
	}
}

func TestWrongSecretRejected(t *testing.T) {
	good, _ := NewIssuer(testSecret, "salarypilot")
	evil, _ := NewIssuer("a-completely-different-secret-32-bytes!!", "salarypilot")

	tokens, _ := evil.Issue("attacker")
	if _, err := good.Verify(tokens.Access); err == nil {
		t.Fatal("SECURITY: token signed with the wrong key was accepted")
	}
}

func TestWrongIssuerRejected(t *testing.T) {
	mine, _ := NewIssuer(testSecret, "salarypilot")
	theirs, _ := NewIssuer(testSecret, "some-other-service")

	tokens, _ := theirs.Issue("user-123")
	if _, err := mine.Verify(tokens.Access); err == nil {
		t.Fatal("token from another issuer was accepted")
	}
}

func TestExpiredTokenRejected(t *testing.T) {
	iss, _ := NewIssuer(testSecret, "salarypilot")

	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID: "user-123",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "salarypilot",
			Subject:   "user-123",
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	})
	raw, _ := expired.SignedString([]byte(testSecret))

	if _, err := iss.Verify(raw); err == nil {
		t.Fatal("expired token was accepted")
	}
}

func TestRefreshTokensAreUnique(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for i := 0; i < 1000; i++ {
		tok, err := NewRefreshToken()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if seen[tok] {
			t.Fatal("duplicate refresh token generated")
		}
		seen[tok] = true
	}
}

func TestRefreshHashIsStable(t *testing.T) {
	tok, _ := NewRefreshToken()
	if HashRefreshToken(tok) != HashRefreshToken(tok) {
		t.Fatal("refresh hash is not deterministic")
	}
	other, _ := NewRefreshToken()
	if HashRefreshToken(tok) == HashRefreshToken(other) {
		t.Fatal("different tokens hashed to the same digest")
	}
}
