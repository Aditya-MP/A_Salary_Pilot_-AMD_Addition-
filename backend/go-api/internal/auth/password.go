// Package auth handles credentials and tokens.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id, not bcrypt.
//
// bcrypt caps at 72 bytes and, more importantly, is cheap to attack on a GPU
// because it needs almost no memory. Argon2id is memory-hard by design: an
// attacker has to pay for RAM per guess, which is what actually blunts a
// large-scale offline crack. It won the Password Hashing Competition and is
// the current OWASP recommendation.
//
// These parameters follow the OWASP minimum (19 MiB, 2 iterations, 1 lane)
// and are stored *inside* each hash. That matters: when hardware improves and
// we raise the cost, existing hashes keep verifying with their original
// parameters, and we can transparently re-hash on next login instead of
// locking everybody out.
const (
	argonMemory  = 19 * 1024 // KiB
	argonTime    = 2
	argonThreads = 1
	argonKeyLen  = 32
	saltLen      = 16
)

var (
	ErrInvalidHash  = errors.New("auth: malformed password hash")
	ErrIncompatible = errors.New("auth: incompatible argon2 version")
)

// HashPassword returns a PHC-format argon2id string.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: read salt: %w", err)
	}

	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// VerifyPassword reports whether password matches encoded.
//
// The comparison uses subtle.ConstantTimeCompare. A plain `==` on the digests
// leaks timing information: it returns as soon as two bytes differ, so an
// attacker can measure how much of a guess was correct and recover the hash
// byte by byte. Constant time always compares every byte.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, ErrInvalidHash
	}
	if version != argon2.Version {
		return false, ErrIncompatible
	}

	var memory uint32
	var time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, ErrInvalidHash
	}

	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))

	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// NeedsRehash reports whether a stored hash was made with weaker parameters
// than we now require, so it can be upgraded silently on next successful
// login.
func NeedsRehash(encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return true
	}
	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return true
	}
	return memory < argonMemory || time < argonTime
}
