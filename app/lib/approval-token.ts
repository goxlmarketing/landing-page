import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed tokens for the one-click Approve link in the internal notification.
 *
 * The link lands in the team's inbox, so whoever reads that inbox can approve
 * a registration — that is the intended trust boundary. What the signature
 * rules out is anyone ELSE minting a link: the token is `<uuid>.<hmac>`, and
 * without APPROVAL_SECRET the MAC cannot be produced for any id.
 *
 * Tokens carry no expiry on purpose. Approval is idempotent (approving twice
 * changes nothing and sends nothing twice), so a replayed or very old link is
 * harmless. Revoking a token means rotating the secret, which invalidates
 * every outstanding link at once.
 *
 * Outside production a fixed development secret is used so the flow can be
 * exercised with no configuration at all. In production a missing or short
 * secret disables approval entirely — the internal email says so instead of
 * carrying a link — rather than falling back to something guessable.
 */

const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "dev-only-approval-secret-do-not-use-in-production";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string | null {
  const configured = process.env.APPROVAL_SECRET?.trim() ?? "";
  if (configured.length >= MIN_SECRET_LENGTH) return configured;
  if (process.env.NODE_ENV !== "production") return DEV_SECRET;
  return null;
}

/** False in production until APPROVAL_SECRET is set (32+ characters). */
export function approvalConfigured(): boolean {
  return secret() !== null;
}

function mac(id: string, key: string): Buffer {
  return createHmac("sha256", key).update(`ally-beta-approve:${id}`).digest();
}

/** Returns null when approval is not configured or the id is not a UUID. */
export function signApprovalToken(id: string): string | null {
  const key = secret();
  if (!key || !UUID_RE.test(id)) return null;
  return `${id}.${mac(id, key).toString("base64url")}`;
}

/** Returns the registration id the token was issued for, or null. */
export function verifyApprovalToken(token: string): string | null {
  const key = secret();
  if (!key) return null;

  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const id = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!UUID_RE.test(id) || !given) return null;

  const givenBuf = Buffer.from(given, "base64url");
  const expected = mac(id, key);
  if (givenBuf.length !== expected.length) return null;
  return timingSafeEqual(givenBuf, expected) ? id : null;
}
