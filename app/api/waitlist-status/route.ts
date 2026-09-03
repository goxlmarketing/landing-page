import { isSameOriginRequest } from "../_dev-write-security";
import { findBetaUserById } from "../../lib/db";
import { platformLoginUrl } from "../../lib/platform-url";

/**
 * Has this registration been approved yet?
 *
 * The landing page keeps the registration's id (a random UUID -- never the
 * email) in the visitor's browser and asks here, so a registrant who comes
 * back after approval, or whose tab sat open through it, is sent on to the
 * platform, while someone still waiting is told so and a new visitor is
 * never redirected at all.
 *
 * The id is the only credential. It is 122 random bits, issued to the person
 * who typed the email, so answering with their sign-in link (which carries
 * that email in its fragment) tells them nothing they did not give us.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 256;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

function clientKey(request: Request): string {
  const chain = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const nearest = chain.length ? chain[chain.length - 1]?.trim() : undefined;
  return (nearest || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 96);
}

function rateLimited(request: Request): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Request not allowed" }, 403);
  if (rateLimited(request)) return json({ ok: false, error: "Too many requests" }, 429);

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) return json({ ok: false, error: "JSON request required" }, 415);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: "Request too large" }, 413);

  let id = "";
  try {
    id = String((JSON.parse(raw) as { id?: unknown })?.id ?? "");
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  if (!UUID_RE.test(id)) return json({ ok: false, error: "Invalid id" }, 400);

  try {
    const user = await findBetaUserById(id);
    if (!user) return json({ ok: false, gone: true }, 404);
    const approved = user.status === "INVITED" || user.status === "ACTIVE";
    return json({
      ok: true,
      status: user.status,
      ...(approved ? { loginUrl: platformLoginUrl(user.email) } : {}),
    });
  } catch (error) {
    console.error("[ally-beta] waitlist status lookup failed", error);
    return json({ ok: false, error: "Something went wrong" }, 500);
  }
}
