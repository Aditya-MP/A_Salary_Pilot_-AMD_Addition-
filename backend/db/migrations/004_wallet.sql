-- Wallet, as a double-entry ledger.
--
-- ⚠  SIMULATED MONEY. No real funds move through this system.
--    Handling real money in India requires an RBI Prepaid Payment Instrument
--    licence and a registered entity for payment-gateway onboarding. This is
--    a faithful model of how such a system works, with test balances.
--
-- WHY DOUBLE-ENTRY AND NOT A BALANCE COLUMN
-- -----------------------------------------
-- A `balance` column is one number with no history. When it is wrong - and it
-- will be, through a lost update, a partial failure, or a bug - there is no
-- way to discover when it went wrong or by how much. You cannot audit a
-- number.
--
-- In double-entry, money is never created or destroyed, only moved between
-- accounts. Every transaction writes entries that sum to exactly zero, and a
-- balance is *derived* from entries rather than stored as an opinion. If the
-- ledger and the cached balance ever disagree, the ledger is right and the
-- disagreement itself is detectable. That property is the entire reason
-- finance has worked this way since the fifteenth century.
--
-- The invariants below are enforced by the DATABASE, not by application code.
-- Go can have bugs; a CHECK constraint cannot be forgotten under deadline.

CREATE TYPE account_kind AS ENUM (
    'wallet',    -- the user's spendable balance
    'holding',   -- value invested in one instrument
    'external',  -- the outside world: their bank. Balances here go negative
                 -- by design - that is money that came in from outside.
    'fee'        -- what the platform charges
);

CREATE TABLE ledger_accounts (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind    account_kind NOT NULL,
    -- Only meaningful for holding accounts; NULL elsewhere.
    ticker  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ticker_only_for_holdings CHECK (
        (kind = 'holding' AND ticker IS NOT NULL) OR
        (kind <> 'holding' AND ticker IS NULL)
    )
);

-- One wallet, one external, one fee account per user; one holding account per
-- instrument. NULLS NOT DISTINCT is what makes the single-wallet rule actually
-- hold, since ticker is NULL for those rows.
CREATE UNIQUE INDEX ledger_accounts_unique
    ON ledger_accounts (user_id, kind, ticker) NULLS NOT DISTINCT;

CREATE TABLE ledger_transactions (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind     TEXT NOT NULL CHECK (kind IN ('topup','invest','redeem','withdraw','fee')),

    -- Idempotency. A retried request - the user tapped twice, the network
    -- retried, the client reconnected - must not move money twice. The client
    -- supplies a key and the unique constraint makes duplicate submission a
    -- no-op instead of a second debit.
    idempotency_key TEXT NOT NULL,

    memo       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE ledger_entries (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    txn_id     UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,

    -- Signed paise. Positive is a debit (value into this account), negative a
    -- credit. Never a float: binary floating point cannot represent 0.1, and
    -- a ledger that does not balance to the paisa is not a ledger.
    amount_paise BIGINT NOT NULL CHECK (amount_paise <> 0),

    -- Units, for holding accounts. NUMERIC because 0.038 BTC must be exact.
    units      NUMERIC(24,10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, id);
CREATE INDEX ledger_entries_txn_idx ON ledger_entries (txn_id);

-- Entries are append-only. A correction is a new compensating transaction,
-- never an edit - which is what makes the history trustworthy.
CREATE RULE ledger_entries_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_entries_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

-- ── The invariant: every transaction must balance to zero ───────────────
-- A CONSTRAINT TRIGGER deferred to commit, because the check can only be made
-- once all of a transaction's entries are written. Enforcing it per-row would
-- fail on the very first insert of every legitimate pair.

CREATE OR REPLACE FUNCTION assert_ledger_balances() RETURNS trigger AS $$
DECLARE
    total BIGINT;
BEGIN
    SELECT COALESCE(sum(amount_paise), 0) INTO total
    FROM ledger_entries WHERE txn_id = NEW.txn_id;

    IF total <> 0 THEN
        RAISE EXCEPTION
            'ledger does not balance: transaction % sums to % paise, must be 0',
            NEW.txn_id, total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_must_balance
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_ledger_balances();

-- ── Cached balances ─────────────────────────────────────────────────────
-- Derived, never authoritative. Summing every entry on each read is correct
-- but gets slower forever; this is the standard cache, maintained by trigger
-- so it cannot drift through application code forgetting to update it.

CREATE TABLE ledger_balances (
    account_id   UUID PRIMARY KEY REFERENCES ledger_accounts(id) ON DELETE CASCADE,
    balance_paise BIGINT NOT NULL DEFAULT 0,
    units        NUMERIC(24,10) NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION apply_ledger_entry() RETURNS trigger AS $$
DECLARE
    k account_kind;
BEGIN
    INSERT INTO ledger_balances (account_id, balance_paise, units)
    VALUES (NEW.account_id, NEW.amount_paise, COALESCE(NEW.units, 0))
    ON CONFLICT (account_id) DO UPDATE
        SET balance_paise = ledger_balances.balance_paise + EXCLUDED.balance_paise,
            units         = ledger_balances.units + EXCLUDED.units,
            updated_at    = now();

    -- A wallet or holding account must never go negative. External accounts
    -- must, since that is where outside money originates.
    SELECT kind INTO k FROM ledger_accounts WHERE id = NEW.account_id;

    IF k IN ('wallet', 'holding') THEN
        PERFORM 1 FROM ledger_balances
        WHERE account_id = NEW.account_id AND balance_paise < 0;
        IF FOUND THEN
            RAISE EXCEPTION
                'insufficient funds: account % would go negative', NEW.account_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_apply_balance
    AFTER INSERT ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION apply_ledger_entry();

-- ── Reconciliation ──────────────────────────────────────────────────────
-- Run this in CI and on a schedule. If it ever returns a row, the cache has
-- drifted from the ledger and the ledger wins. A system that cannot detect
-- its own corruption is one that corrupts silently.

CREATE OR REPLACE VIEW ledger_drift AS
SELECT b.account_id,
       b.balance_paise AS cached,
       COALESCE(sum(e.amount_paise), 0) AS actual,
       b.balance_paise - COALESCE(sum(e.amount_paise), 0) AS drift
FROM ledger_balances b
LEFT JOIN ledger_entries e ON e.account_id = b.account_id
GROUP BY b.account_id, b.balance_paise
HAVING b.balance_paise <> COALESCE(sum(e.amount_paise), 0);

-- Whole-system check: across every account, all money must sum to zero.
CREATE OR REPLACE VIEW ledger_total AS
SELECT COALESCE(sum(amount_paise), 0) AS total_paise FROM ledger_entries;
