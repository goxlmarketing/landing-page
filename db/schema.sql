-- GoXL Ally — beta registration schema
--
-- Target: a SEPARATE managed PostgreSQL database (Supabase / Neon / any managed
-- Postgres). This schema is intentionally standalone and must NOT be applied to
-- the existing Ally production database.
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- Safe to re-run: every statement is idempotent.
--
-- Requires PostgreSQL 13+, where gen_random_uuid() is part of core. No
-- extensions are needed, so this applies cleanly on providers that restrict
-- CREATE EXTENSION.

CREATE TABLE IF NOT EXISTS beta_users (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  email        text        NOT NULL UNIQUE,
  phone        text,
  linkedin_url text,
  status       text        NOT NULL DEFAULT 'NEW',
  source       text        NOT NULL DEFAULT 'ally_landing_beta',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- The application lowercases every address before insert; this guarantees the
  -- UNIQUE constraint can never be bypassed by casing, even from manual SQL.
  CONSTRAINT beta_users_email_is_lowercase CHECK (email = lower(email)),
  CONSTRAINT beta_users_email_not_blank    CHECK (length(btrim(email)) > 0),
  CONSTRAINT beta_users_name_not_blank     CHECK (length(btrim(name)) > 0),
  CONSTRAINT beta_users_status_allowed     CHECK (status IN ('NEW', 'CONTACTED', 'INVITED', 'ACTIVE', 'REJECTED'))
);

-- Lock the table down to server-side access only.
--
-- On Supabase, every table in the `public` schema is automatically published
-- through the PostgREST API and readable by the `anon` role — i.e. by anyone
-- holding the project's publishable key. Beta signups contain names, emails and
-- phone numbers, so that must not happen.
--
-- Enabling RLS with NO policies denies the `anon` and `authenticated` roles
-- outright, while the table owner (the role in DATABASE_URL, which is how this
-- app connects) still reads and writes normally. On non-Supabase providers this
-- is simply a harmless extra safeguard.
ALTER TABLE beta_users ENABLE ROW LEVEL SECURITY;

-- Keep updated_at truthful without relying on the application to remember.
CREATE OR REPLACE FUNCTION beta_users_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS beta_users_set_updated_at ON beta_users;
CREATE TRIGGER beta_users_set_updated_at
  BEFORE UPDATE ON beta_users
  FOR EACH ROW
  EXECUTE FUNCTION beta_users_touch_updated_at();
