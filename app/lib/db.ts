import postgres, { type Sql } from "postgres";

import {
  devFindBetaUserById,
  devInsertBetaUser,
  devMarkBetaUserInvited,
  devStoreEnabled,
} from "./dev-store";

/**
 * Server-only Postgres access for the Ally beta registration flow.
 *
 * Talks to a SEPARATE managed Postgres database via `DATABASE_URL`. This module
 * must never be imported from client code — `DATABASE_URL` is read here and is
 * deliberately not exposed through any `NEXT_PUBLIC_*` variable.
 *
 * With no DATABASE_URL outside production, every function below falls through
 * to the file-backed store in dev-store.ts so the flow can be exercised with no
 * database at all. In production a missing DATABASE_URL is still a hard error.
 */

declare global {
  // Reused across hot reloads in dev and across warm invocations in production
  // so we don't open a new connection pool on every request.
  var __allyBetaSql: Sql | undefined;
}

function createClient(connectionString: string): Sql {
  return postgres(connectionString, {
    // Serverless: many short-lived instances, so keep each one to a single
    // connection and let the provider's pooler do the multiplexing.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Transaction-mode poolers (Supabase/Supavisor, PgBouncer) do not support
    // prepared statements. Disabling them keeps this portable across providers.
    prepare: false,
    // Never let driver notices reach the response; keep them in server logs.
    onnotice: () => {},
  });
}

function useDevStore(): boolean {
  return !process.env.DATABASE_URL && devStoreEnabled();
}

function getSql(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!globalThis.__allyBetaSql) {
    globalThis.__allyBetaSql = createClient(connectionString);
  }
  return globalThis.__allyBetaSql;
}

export type BetaUserInput = {
  name: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  source: string;
};

export type BetaUserInsert =
  | { created: true; id: string; createdAt: Date }
  | { created: false };

export type BetaUserStatus = "NEW" | "CONTACTED" | "INVITED" | "ACTIVE" | "REJECTED";

/** The subset of a row the approval flow needs. */
export type BetaUserRow = {
  id: string;
  name: string;
  email: string;
  status: BetaUserStatus;
  createdAt: Date;
  /** Last change to the row -- for an INVITED row, when it was approved. */
  updatedAt: Date;
};

type RawRow = { id: string; name: string; email: string; status: string; created_at: Date; updated_at: Date };

function toRow(raw: RawRow): BetaUserRow {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    status: raw.status as BetaUserStatus,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Inserts a beta registration.
 *
 * Uniqueness is enforced by the database, not by a read-then-write check, so
 * concurrent submissions of the same address cannot both win. `ON CONFLICT DO
 * NOTHING` combined with `RETURNING` yields zero rows on conflict, which is how
 * we distinguish a genuinely new signup from a repeat.
 */
export async function insertBetaUser(input: BetaUserInput): Promise<BetaUserInsert> {
  if (useDevStore()) return devInsertBetaUser(input);
  const sql = getSql();

  const rows = await sql<{ id: string; created_at: Date }[]>`
    INSERT INTO beta_users (name, email, phone, linkedin_url, source)
    VALUES (
      ${input.name},
      ${input.email},
      ${input.phone},
      ${input.linkedinUrl},
      ${input.source}
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id, created_at
  `;

  const row = rows[0];
  if (!row) return { created: false };
  return { created: true, id: row.id, createdAt: row.created_at };
}

export async function findBetaUserById(id: string): Promise<BetaUserRow | null> {
  if (useDevStore()) {
    const row = await devFindBetaUserById(id);
    return row
      ? toRow({ ...row, created_at: new Date(row.created_at), updated_at: new Date(row.updated_at) })
      : null;
  }
  const sql = getSql();
  const rows = await sql<RawRow[]>`
    SELECT id, name, email, status, created_at, updated_at
    FROM beta_users
    WHERE id = ${id}
  `;
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Marks a registration approved. Idempotent: re-running on an INVITED row
 * changes nothing but `updated_at` (the trigger touches it), which is why the
 * caller decides whether to send anything based on the status it read first.
 */
export async function markBetaUserInvited(id: string): Promise<BetaUserRow | null> {
  if (useDevStore()) {
    const row = await devMarkBetaUserInvited(id);
    return row
      ? toRow({ ...row, created_at: new Date(row.created_at), updated_at: new Date(row.updated_at) })
      : null;
  }
  const sql = getSql();
  const rows = await sql<RawRow[]>`
    UPDATE beta_users
    SET status = 'INVITED'
    WHERE id = ${id}
    RETURNING id, name, email, status, created_at, updated_at
  `;
  return rows[0] ? toRow(rows[0]) : null;
}
