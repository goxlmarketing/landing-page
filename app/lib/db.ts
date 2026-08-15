import postgres, { type Sql } from "postgres";

/**
 * Server-only Postgres access for the Ally beta registration flow.
 *
 * Talks to a SEPARATE managed Postgres database via `DATABASE_URL`. This module
 * must never be imported from client code — `DATABASE_URL` is read here and is
 * deliberately not exposed through any `NEXT_PUBLIC_*` variable.
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

/**
 * Inserts a beta registration.
 *
 * Uniqueness is enforced by the database, not by a read-then-write check, so
 * concurrent submissions of the same address cannot both win. `ON CONFLICT DO
 * NOTHING` combined with `RETURNING` yields zero rows on conflict, which is how
 * we distinguish a genuinely new signup from a repeat.
 */
export async function insertBetaUser(input: BetaUserInput): Promise<BetaUserInsert> {
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
