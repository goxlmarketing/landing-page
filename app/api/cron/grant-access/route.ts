import { grantNextBatch } from "../../../lib/access";
import { pendingGrants } from "../../../lib/db";

/**
 * Safety net for the batch queue.
 *
 * The admin page drives granting itself and finishes what it starts, so this
 * exists for the case where it did not: the operator closed the tab, or a
 * grant failed for a reason that has since been fixed. It walks the same queue
 * and grants whatever is still inside the opened places.
 *
 * Vercel's Hobby plan runs cron once a day, which is why this is a net and not
 * the mechanism. On Pro it can be minutes apart and the admin page's own loop
 * becomes the redundant half.
 *
 * Authorised by CRON_SECRET, which Vercel sends as `Authorization: Bearer …`
 * on scheduled invocations. Without it configured the route refuses everyone,
 * including Vercel: a URL that grants product access must not be open because
 * an environment variable was forgotten.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) return json({ ok: false }, 404);

  try {
    const waiting = await pendingGrants(1);
    if (waiting.length === 0) return json({ ok: true, granted: 0, remaining: 0 });

    const result = await grantNextBatch();
    if (result.failed.length > 0) {
      console.error("[ally-beta] cron: some grants failed", result.failed);
    }
    return json({
      ok: true,
      granted: result.granted,
      remaining: result.remaining,
      failed: result.failed.length,
      emailFailures: result.emailFailures,
    });
  } catch (error) {
    console.error("[ally-beta] cron grant pass failed", error);
    return json({ ok: false, error: "grant pass failed" }, 500);
  }
}
