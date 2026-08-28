# SalaryPilot Go API — multi-stage build.
#
# BUILD CONTEXT MUST BE `backend/`, NOT `backend/go-api/`.
# ------------------------------------------------------------
# Docker forbids COPY-ing anything outside the build context (no `../`),
# and the migrations this image also needs live in a sibling directory
# (backend/db/migrations), not inside go-api/ itself. So:
#
#   docker build -f go-api/Dockerfile -t salarypilot-api backend/
#
# On Render: set "Root Directory" to `backend`, "Dockerfile Path" to
# `go-api/Dockerfile`. Getting this wrong produces a build error pointing
# at the COPY lines below, not a mysterious runtime failure — which is the
# whole reason this is written out rather than left to be rediscovered.
#
# Two stages: a full Go toolchain to compile, then a minimal image to run.
# The build stage is ~1GB; the runtime image is a static binary plus
# certificates, closer to 20MB.
#
# Version pinned to exactly what go.mod declares (1.26.7) — verified this
# tag actually exists on Docker Hub before writing it here, rather than
# guessed.

FROM golang:1.26.7-alpine AS build
WORKDIR /src

# Dependencies first, so `docker build` caches this layer and only re-runs
# `go mod download` when go.mod/go.sum actually change, not on every
# source edit.
COPY go-api/go.mod go-api/go.sum ./
RUN go mod download

COPY go-api/ .

# CGO_ENABLED=0: a static binary with no libc dependency, which is what
# lets the runtime stage below be alpine (for a shell and certs, not
# because the binary needs one) rather than needing glibc.
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /migrate ./cmd/migrate

FROM alpine:3.20
# Neon's connection requires TLS; without ca-certificates the Go TLS stack
# has nothing to verify the server certificate against, and every database
# connection fails with an obscure "x509: certificate signed by unknown
# authority" error that has nothing to do with the actual credentials.
RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=build /server /app/server
COPY --from=build /migrate /app/migrate
COPY db/migrations /app/db/migrations

# cmd/migrate's default -dir ("../db/migrations") assumes it's run from
# backend/go-api/ locally, which is not this image's layout - override it
# explicitly when running migrations here:
#   docker run --rm -e DATABASE_URL=... salarypilot-api /app/migrate -dir /app/db/migrations

# config.Load() reads PORT automatically (Render/Railway/Heroku's
# convention) when ADDR is not set, converting the bare number into the
# ":PORT" form http.Server wants - no platform-specific start command
# needed.
EXPOSE 8080

ENTRYPOINT ["/app/server"]
