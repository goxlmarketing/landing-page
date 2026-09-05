/**
 * Server-only bridge to the Ally platform's Supabase Auth.
 *
 * "Approving" a registration means one thing technically: an `auth.users` row
 * must exist for that email in the platform's Supabase project, because the
 * platform has public sign-ups switched OFF and only mails a sign-in code to
 * an address it already knows. This module creates that row through GoTrue's
 * admin API — plain `fetch`, no SDK, because one endpoint is all we call.
 *
 * ⚠️  SUPABASE_SERVICE_ROLE_KEY bypasses row-level security on the platform's
 * production database. It is read here and nowhere else, must only ever live
 * in this app's server-side environment, and is never logged — not even on
 * failure. The narrower long-term shape is a single invite endpoint on the
 * platform's own backend (which already holds Supabase credentials) so that
 * this site never has to; swapping to that means changing this one file.
 *
 * Outside production, missing configuration is treated as "skip": the rest of
 * the approval flow proceeds so it can be tested end to end, and a warning is
 * logged. In production the same condition is a hard failure — an approval
 * email must never go out for an address that cannot actually sign in.
 */

export type EnsureAuthUserResult =
  | { ok: true; created: boolean; skipped?: true }
  | { ok: false; error: string };

const REQUEST_TIMEOUT_MS = 6_000;

function config(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

export function supabaseAdminConfigured(): boolean {
  return config() !== null;
}

/**
 * Creates the auth user for `email` if it does not already exist.
 *
 * `email_confirm: true` marks the address verified up front, so the platform's
 * OTP step is the founder's first and only proof of ownership. The name from
 * the registration form is stored as `user_metadata.full_name`, which is
 * exactly the claim the platform's provisioning reads to name the founder row
 * — so a founder is greeted by the name they gave us, not by their email.
 */
export async function ensureAuthUser(input: {
  email: string;
  name: string;
  /** Extra user_metadata: the registration id and campaign tags, so the
      platform's records can be joined back to the landing site's. */
  metadata?: Record<string, string>;
}): Promise<EnsureAuthUserResult> {
  const cfg = config();
  if (!cfg) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[ally-beta] [dev] Supabase admin not configured — skipping auth user creation for ${input.email}`,
      );
      return { ok: true, created: false, skipped: true };
    }
    return { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured" };
  }

  let response: Response;
  try {
    response = await fetch(`${cfg.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        email_confirm: true,
        user_metadata: { full_name: input.name, ...(input.metadata ?? {}) },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "request failed";
    return { ok: false, error: `Supabase admin request failed: ${reason}` };
  }

  if (response.ok) return { ok: true, created: true };

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.error_code ?? body.code ?? "").toLowerCase();
  const message = String(body.msg ?? body.message ?? body.error_description ?? body.error ?? "").toLowerCase();

  // Already registered (an early tester, or a second approval of the same
  // person) is success: the row we need exists.
  if (code === "email_exists" || (response.status === 422 && message.includes("already"))) {
    return { ok: true, created: false };
  }

  return {
    ok: false,
    error: `Supabase admin responded ${response.status}${message ? `: ${message}` : ""}`,
  };
}
