import { markBetaUserInvited, pendingGrants, type BetaUserRow } from "./db";
import { sendBetaApprovalEmail } from "./email";
import { platformLoginUrl } from "./platform-url";
import { ensureAuthUser } from "./supabase-admin";

/**
 * Granting access — the one place it happens.
 *
 * Three things ask for it and they must agree on every detail: registering
 * inside capacity, opening a batch, and the manual Approve link in the team's
 * notification email. When this was written out at each call site they drifted
 * almost immediately — the batch path forgot to stamp the row before emailing,
 * so a founder could be told they were in while the row still read NEW.
 *
 * Order matters and is the whole safety story:
 *
 *   1. create the auth user  — the actual grant. The platform only mails a
 *      sign-in code to an address Supabase already knows, so nothing before
 *      this point lets anyone in.
 *   2. mark the row INVITED  — records it.
 *   3. email the founder     — tells them.
 *
 * A failure at 1 changes nothing and sends nothing: the founder stays exactly
 * where they were and the next attempt starts clean. A failure at 3 leaves
 * them with access but no email, which is why the result says so and both the
 * admin page and the approval page offer to send it again.
 */

export type GrantOutcome =
  | { ok: true; alreadyHad: boolean; emailed: boolean; supabaseSkipped: boolean; loginUrl: string }
  | { ok: false; error: string };

/** Has this registration already been let in? */
export function isGranted(user: Pick<BetaUserRow, "status">): boolean {
  return user.status === "INVITED" || user.status === "ACTIVE";
}

export async function grantAccess(
  user: BetaUserRow,
  { baseUrl, resend = false }: { baseUrl?: string; resend?: boolean } = {},
): Promise<GrantOutcome> {
  const loginUrl = platformLoginUrl(user.email);

  // Already in: only send again if that is what was asked for. Re-approving
  // must not mail a second "you're in" to someone who got one last week.
  if (isGranted(user) && !resend) {
    return { ok: true, alreadyHad: true, emailed: false, supabaseSkipped: false, loginUrl };
  }

  let supabaseSkipped = false;
  if (!isGranted(user)) {
    const auth = await ensureAuthUser({ email: user.email, name: user.name });
    if (!auth.ok) return { ok: false, error: auth.error };
    supabaseSkipped = Boolean(auth.skipped);

    const updated = await markBetaUserInvited(user.id);
    if (!updated) return { ok: false, error: "The registration no longer exists." };
  }

  const emailed = await sendBetaApprovalEmail({ name: user.name, email: user.email, loginUrl, baseUrl });
  return { ok: true, alreadyHad: false, emailed, supabaseSkipped, loginUrl };
}

/**
 * How many founders one request may let in.
 *
 * Each grant is a Supabase call plus an email, so a batch of 300 cannot run
 * inside one serverless invocation — the function times out and the mailbox
 * rate-limits long before the queue is done. The admin page calls this
 * repeatedly and shows the progress; a scheduled job finishes anything left.
 */
export const GRANT_CHUNK = 15;

export type BatchResult = {
  granted: number;
  failed: Array<{ email: string; error: string }>;
  emailFailures: number;
  remaining: number;
};

/**
 * Grants the next chunk of the queue.
 *
 * One at a time, in order, and a failure does not stop the ones behind it: a
 * single address Supabase rejects (already taken by a tester, malformed after
 * a manual edit) must not hold up the rest of a batch. Failures are returned
 * so the operator sees them rather than finding out from the founder.
 */
export async function grantNextBatch(
  { limit = GRANT_CHUNK, baseUrl }: { limit?: number; baseUrl?: string } = {},
): Promise<BatchResult> {
  const queue = await pendingGrants(limit);
  const failed: BatchResult["failed"] = [];
  let granted = 0;
  let emailFailures = 0;

  for (const user of queue) {
    const result = await grantAccess(user, { baseUrl });
    if (!result.ok) {
      failed.push({ email: user.email, error: result.error });
      continue;
    }
    granted += 1;
    if (!result.emailed) emailFailures += 1;
  }

  // Asked after the work, so the number reported is what is genuinely left --
  // including anything that just failed and will be retried on the next call.
  const remaining = (await pendingGrants(limit + 1)).length;
  return { granted, failed, emailFailures, remaining };
}
