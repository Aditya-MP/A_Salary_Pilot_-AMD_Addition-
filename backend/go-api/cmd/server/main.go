// Command server is the SalaryPilot core API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Aditya-MP/salarypilot/go-api/internal/auth"
	"github.com/Aditya-MP/salarypilot/go-api/internal/config"
	"github.com/Aditya-MP/salarypilot/go-api/internal/rpc"
	"github.com/Aditya-MP/salarypilot/go-api/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	if err := run(log); err != nil {
		log.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log.Info("starting", "env", cfg.Env, "addr", cfg.Addr)

	if !cfg.IsProduction() {
		log.Warn("running in development mode - do not expose this publicly")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// The pool is created but not dialled. If Postgres is down at boot the
	// service still starts and reports itself unready, then recovers on its
	// own once the database appears.
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	if err := st.Ping(ctx); err != nil {
		log.Warn("database unreachable at boot; serving /healthz and waiting", "error", err)
	} else {
		log.Info("database connected")
	}

	issuer, err := auth.NewIssuer(cfg.JWTSecret, cfg.JWTIssuer)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           rpc.NewServer(st, issuer, log).Routes(),
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       60 * time.Second,
		// Without this a client can open a connection, dribble headers, and
		// hold a goroutine open indefinitely. That is Slowloris, and the
		// default in net/http is no limit at all.
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("shutdown signal received")
	}

	// Drain in-flight requests rather than cutting them off mid-response.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Info("stopped cleanly")
	return nil
}
