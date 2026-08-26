-- Time-series half of the schema.
--
-- This split is the whole argument for Postgres + Timescale over a document
-- store: the profile in 001 is relational and benefits from constraints and
-- joins, while everything below is an append-only stream that needs
-- partitioning and incremental rollups. One engine, both shapes.

CREATE TABLE transactions (
    ts            TIMESTAMPTZ NOT NULL,
    user_id       UUID NOT NULL,
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    narration     TEXT NOT NULL,
    amount_paise  BIGINT NOT NULL,
    direction     TEXT NOT NULL CHECK (direction IN ('debit','credit')),
    channel       TEXT,

    -- Filled by M1. NULL means not yet categorised.
    category      TEXT,
    confidence    REAL,

    -- Set when the user corrects M1. This column is the whole feedback loop:
    -- it is the label source that lets the model improve from real use rather
    -- than staying frozen at whatever the synthetic corpus taught it.
    user_category TEXT,

    merchant_key  TEXT,
    -- Set by M2 once this transaction is matched into a recurring series.
    recurring_id  UUID
);
SELECT create_hypertable('transactions', 'ts');
CREATE INDEX transactions_user_ts_idx ON transactions (user_id, ts DESC);
CREATE INDEX transactions_merchant_idx ON transactions (user_id, merchant_key, ts DESC);
-- Partial index over the correction queue: small, and hit on every retrain.
CREATE INDEX transactions_corrected_idx ON transactions (user_id, ts DESC)
    WHERE user_category IS NOT NULL;

CREATE TABLE prices (
    ts          TIMESTAMPTZ NOT NULL,
    ticker      TEXT NOT NULL,
    price_paise BIGINT NOT NULL
);
SELECT create_hypertable('prices', 'ts');
CREATE INDEX prices_ticker_ts_idx ON prices (ticker, ts DESC);

-- OHLC candles at any bucket, maintained incrementally rather than
-- recomputed. The frontend's chart reads straight off this.
CREATE MATERIALIZED VIEW prices_1h
WITH (timescaledb.continuous) AS
SELECT ticker,
       time_bucket('1 hour', ts) AS bucket,
       first(price_paise, ts)    AS open,
       max(price_paise)          AS high,
       min(price_paise)          AS low,
       last(price_paise, ts)     AS close
FROM prices
GROUP BY ticker, bucket
WITH NO DATA;

-- Freedom Score over time. Two jobs: it makes progress visible to the user,
-- and it is the ground truth for calibrating M6. When the simulator says
-- "78% chance", this table is how we later check whether it was right.
CREATE TABLE score_history (
    ts              TIMESTAMPTZ NOT NULL,
    user_id         UUID NOT NULL,
    total           SMALLINT NOT NULL,
    runway_months   REAL NOT NULL,
    net_worth_paise BIGINT NOT NULL,
    pillars         JSONB NOT NULL
);
SELECT create_hypertable('score_history', 'ts');
CREATE INDEX score_history_user_idx ON score_history (user_id, ts DESC);
