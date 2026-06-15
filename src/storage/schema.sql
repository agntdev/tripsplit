-- TripSplit — PostgreSQL persistence schema (production).
-- See docs/design.md §1.5. The harness default is the in-memory repository
-- in repository.ts; this schema is the canonical shape a Postgres adapter
-- implements.

CREATE TABLE IF NOT EXISTS trips (
  id                  BIGSERIAL PRIMARY KEY,
  telegram_group_id   BIGINT NOT NULL UNIQUE,
  organizer_user_id   BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id                BIGSERIAL PRIMARY KEY,
  trip_id           BIGINT NOT NULL REFERENCES trips(id),
  telegram_user_id  BIGINT NOT NULL,
  display_name      TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at        TIMESTAMPTZ,
  UNIQUE (trip_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id              BIGSERIAL PRIMARY KEY,
  trip_id         BIGINT NOT NULL REFERENCES trips(id),
  payer_user_id   BIGINT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shares (
  id                    BIGSERIAL PRIMARY KEY,
  expense_id            BIGINT NOT NULL REFERENCES expenses(id),
  participant_user_id   BIGINT NOT NULL,
  share_cents           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  id                  BIGSERIAL PRIMARY KEY,
  trip_id             BIGINT NOT NULL REFERENCES trips(id),
  payer_user_id       BIGINT NOT NULL,
  payee_user_id       BIGINT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  payer_confirmed_at  TIMESTAMPTZ,
  payee_confirmed_at  TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  trip_id         BIGINT NOT NULL REFERENCES trips(id),
  actor_user_id   BIGINT NOT NULL,
  action          TEXT NOT NULL,
  payload_json    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_trip ON participants (trip_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants (trip_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses (trip_id);
CREATE INDEX IF NOT EXISTS idx_shares_expense ON shares (expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements (trip_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements (trip_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_trip ON audit_logs (trip_id);