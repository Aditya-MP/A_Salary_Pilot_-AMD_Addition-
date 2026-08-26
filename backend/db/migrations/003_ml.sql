-- Model lineage.
--
-- Every inference is written down with the exact model version that produced
-- it. This is the difference between "we have models" and "we operate
-- models": without it you cannot answer whether accuracy degraded last month,
-- and drift is invisible until a user complains.

CREATE TABLE model_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model        TEXT NOT NULL,             -- 'm1_categoriser'
    version      TEXT NOT NULL,             -- semver or git sha
    trained_at   TIMESTAMPTZ NOT NULL,
    -- Baseline, test and unseen-vendor metrics together. Storing the baseline
    -- alongside the result is deliberate: a score without the bar it cleared
    -- is not evidence of anything.
    metrics      JSONB NOT NULL,
    artifact_uri TEXT NOT NULL,             -- MLflow registry URI
    active       BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (model, version)
);
-- Exactly one active version per model, enforced by the database rather than
-- by hoping the deploy script is correct.
CREATE UNIQUE INDEX model_versions_one_active
    ON model_versions (model) WHERE active;

CREATE TABLE predictions (
    ts               TIMESTAMPTZ NOT NULL,
    user_id          UUID NOT NULL,
    model_version_id UUID NOT NULL REFERENCES model_versions(id),
    subject_id       UUID,                  -- the transaction, holding, lesson...
    output           JSONB NOT NULL,
    confidence       REAL,
    -- Filled in later if reality disagrees. Joined against `output` to
    -- measure drift and to rebuild the calibration curve on real data.
    outcome          JSONB
);
SELECT create_hypertable('predictions', 'ts');
CREATE INDEX predictions_user_idx ON predictions (user_id, ts DESC);
CREATE INDEX predictions_model_idx ON predictions (model_version_id, ts DESC);

-- M2 output: a detected recurring series. Powers Leak Hunter, which currently
-- reads a hardcoded array in the frontend.
CREATE TABLE recurring_series (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_key   TEXT NOT NULL,
    label          TEXT NOT NULL,
    period_days    REAL NOT NULL,           -- ~30.4 monthly, ~365 annual
    amount_paise   BIGINT NOT NULL,
    amount_cv      REAL NOT NULL,           -- coefficient of variation
    confidence     REAL NOT NULL,
    last_seen      DATE NOT NULL,
    next_expected  DATE,
    cancelled_at   TIMESTAMPTZ,
    UNIQUE (user_id, merchant_key)
);
CREATE INDEX recurring_user_idx ON recurring_series (user_id) WHERE cancelled_at IS NULL;
