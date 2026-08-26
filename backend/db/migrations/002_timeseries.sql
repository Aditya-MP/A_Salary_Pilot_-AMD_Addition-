-- Time-series tables, on plain PostgreSQL.
--
-- WHY NOT TIMESCALEDB
-- -------------------
-- The original plan used TimescaleDB hypertables. That needs the extension,
-- which needs Docker, which needs WSL2, which needs virtualisation enabled in
-- firmware - and it is not. Rather than block on a BIOS reboot, this uses
-- PostgreSQL's own declarative partitioning, which ships in core.
--
-- What is actually lost: automatic chunk management and a few convenience
-- functions (time_bucket, first/last). What is kept: the thing that matters,
-- which is that queries touching one month only read one month's data.
-- Partition pruning does the same job as chunk exclusion.
--
-- Arguably this is the better thing to have built. "I used a vendor function"
-- explains less than "I range-partitioned by month and wrote the maintenance".

CREATE TABLE transactions (
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    ts            TIMESTAMPTZ NOT NULL,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    narration     TEXT NOT NULL,
    amount_paise  BIGINT NOT NULL CHECK (amount_paise >= 0),
    direction     TEXT NOT NULL CHECK (direction IN ('debit','credit')),
    channel       TEXT,

    -- Filled by M1. NULL means not yet categorised.
    category      TEXT,
    confidence    REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    -- Set when the user corrects M1. The whole feedback loop lives here: the
    -- training corpus is synthetic, so a single real correction is worth more
    -- than a thousand generated rows.
    user_category TEXT,
    model_version TEXT,

    merchant_key  TEXT,
    recurring_id  UUID,

    -- The partition key must be part of every unique constraint, which is the
    -- one real ergonomic cost of declarative partitioning.
    PRIMARY KEY (user_id, ts, id)
) PARTITION BY RANGE (ts);

CREATE INDEX transactions_user_ts_idx ON transactions (user_id, ts DESC);
CREATE INDEX transactions_merchant_idx ON transactions (user_id, merchant_key, ts DESC);
-- Partial index over the correction queue: small, and read on every retrain.
CREATE INDEX transactions_corrected_idx ON transactions (user_id, ts DESC)
    WHERE user_category IS NOT NULL;

CREATE TABLE prices (
    ts          TIMESTAMPTZ NOT NULL,
    ticker      TEXT NOT NULL,
    price_paise BIGINT NOT NULL CHECK (price_paise > 0),
    PRIMARY KEY (ticker, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX prices_ticker_ts_idx ON prices (ticker, ts DESC);

-- Freedom Score over time. Two jobs: it makes progress visible to the user,
-- and it is the ground truth for calibrating M6. When the simulator says
-- "78% chance", this is how we later check whether it was right.
CREATE TABLE score_history (
    ts              TIMESTAMPTZ NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total           SMALLINT NOT NULL CHECK (total BETWEEN 0 AND 100),
    runway_months   REAL NOT NULL,
    net_worth_paise BIGINT NOT NULL,
    pillars         JSONB NOT NULL,
    PRIMARY KEY (user_id, ts)
) PARTITION BY RANGE (ts);

-- ── Partition maintenance ───────────────────────────────────────────────
-- Timescale creates chunks automatically. Without it that is our job, so it
-- is a function rather than a pile of hand-written DDL nobody will remember
-- to run.

CREATE OR REPLACE FUNCTION ensure_month_partition(
    parent TEXT,
    month  DATE
) RETURNS void AS $$
DECLARE
    start_ts  DATE := date_trunc('month', month)::date;
    end_ts    DATE := (date_trunc('month', month) + INTERVAL '1 month')::date;
    part_name TEXT := format('%s_%s', parent, to_char(start_ts, 'YYYY_MM'));
BEGIN
    IF to_regclass(part_name) IS NULL THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            part_name, parent, start_ts, end_ts
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Pre-create a window around today. A write with no matching partition fails
-- outright, so these are created ahead of time rather than on demand - an
-- insert is the wrong moment to discover the partition is missing.
DO $$
DECLARE
    m DATE;
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['transactions', 'prices', 'score_history'] LOOP
        FOR m IN
            SELECT generate_series(
                date_trunc('month', now() - INTERVAL '24 months'),
                date_trunc('month', now() + INTERVAL '12 months'),
                INTERVAL '1 month'
            )::date
        LOOP
            PERFORM ensure_month_partition(t, m);
        END LOOP;
    END LOOP;
END $$;

-- Hourly OHLC. Timescale would maintain this incrementally as a continuous
-- aggregate; here it is a plain materialised view refreshed on a schedule.
-- Honest trade-off: cheaper to build, more expensive to refresh.
CREATE MATERIALIZED VIEW prices_1h AS
SELECT ticker,
       date_trunc('hour', ts) AS bucket,
       (array_agg(price_paise ORDER BY ts))[1]                      AS open,
       max(price_paise)                                             AS high,
       min(price_paise)                                             AS low,
       (array_agg(price_paise ORDER BY ts DESC))[1]                 AS close,
       count(*)                                                     AS ticks
FROM prices
GROUP BY ticker, date_trunc('hour', ts)
WITH NO DATA;

CREATE UNIQUE INDEX prices_1h_key ON prices_1h (ticker, bucket);
