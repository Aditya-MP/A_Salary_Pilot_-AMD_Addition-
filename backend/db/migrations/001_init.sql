-- Core relational schema, normalised out of the frontend's single
-- FinancialProfile object.
--
-- MONEY IS STORED IN PAISE AS BIGINT, NEVER AS A FLOAT.
-- Binary floating point cannot represent 0.1 exactly. A rounding drift in a
-- finance app is the one class of bug users never forgive, and it compounds
-- silently for months before anyone notices.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,                    -- argon2id, never bcrypt
    display_name  TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_hash  TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE profiles (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    age           INT  NOT NULL CHECK (age BETWEEN 16 AND 100),
    dependents    INT  NOT NULL DEFAULT 0,
    risk          TEXT NOT NULL CHECK (risk IN ('conservative','balanced','aggressive')),
    cash_paise    BIGINT NOT NULL DEFAULT 0,
    term_cover    BIGINT NOT NULL DEFAULT 0,
    health_cover  BIGINT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE incomes (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ctc_paise     BIGINT NOT NULL,
    in_hand_paise BIGINT NOT NULL,
    basic_paise   BIGINT NOT NULL,
    hra_paise     BIGINT NOT NULL,
    rent_paise    BIGINT NOT NULL,
    epf_employee  BIGINT NOT NULL DEFAULT 0,
    epf_employer  BIGINT NOT NULL DEFAULT 0,
    bonus_paise   BIGINT NOT NULL DEFAULT 0,
    pay_day       INT    NOT NULL DEFAULT 1 CHECK (pay_day BETWEEN 1 AND 28),
    metro         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE expenses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    kind          TEXT NOT NULL,
    monthly_paise BIGINT NOT NULL,
    -- The survival line: what you would still pay with zero income. The
    -- entire runway calculation keys off this one boolean.
    essential     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX expenses_user_idx ON expenses (user_id);

CREATE TABLE debts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,
    kind           TEXT NOT NULL CHECK (kind IN ('card','personal','auto','home','education')),
    balance_paise  BIGINT NOT NULL,
    annual_rate    NUMERIC(6,4) NOT NULL,
    emi_paise      BIGINT NOT NULL,
    tax_deductible BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX debts_user_idx ON debts (user_id);

CREATE TABLE goals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    target_paise  BIGINT NOT NULL,
    saved_paise   BIGINT NOT NULL DEFAULT 0,
    due_on        DATE NOT NULL,
    priority      TEXT NOT NULL CHECK (priority IN ('safety','commitment','aspiration')),
    monthly_paise BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX goals_user_idx ON goals (user_id);

-- Lot-level, not position-level. Correct LTCG/STCG treatment and tax-loss
-- harvesting both require knowing when each individual purchase happened;
-- a single averaged position cannot answer either question.
CREATE TABLE holdings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker         TEXT NOT NULL,
    label          TEXT NOT NULL,
    asset_class    TEXT NOT NULL,
    liquidity_days INT NOT NULL DEFAULT 3,
    locked_until   DATE,
    tax_section    TEXT
);
CREATE INDEX holdings_user_idx ON holdings (user_id);

CREATE TABLE lots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id  UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    units       NUMERIC(20,8) NOT NULL,
    cost_paise  BIGINT NOT NULL,
    acquired_on DATE NOT NULL
);
CREATE INDEX lots_holding_idx ON lots (holding_id, acquired_on);

CREATE TABLE deductions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section     TEXT NOT NULL,
    fy          TEXT NOT NULL,                      -- 'FY26-27'
    limit_paise BIGINT NOT NULL,
    used_paise  BIGINT NOT NULL DEFAULT 0,
    UNIQUE (user_id, section, fy)
);
