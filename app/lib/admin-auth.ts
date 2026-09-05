import { timingSafeEqual } from "crypto";

/**
 * HTTP Basic auth for the access admin page.
 *
 * Basic rather than a login form because there is exactly one operator secret,
 * no session to manage, and the browser handles the prompt — a hand-rolled
 * form here would be more code guarding the same one string.
 *
 * With no credentials configured the page does not exist: it 404s rather than
 * asking for a password nobody has set. That is the important half of this
 * file. A page that opens batches must never be reachable because an
 * environment variable was forgotten.
 */

const REALM = 'Basic realm="Ally access admin", charset="UTF-8"';

function configured(): { user: string; password: string } | null {
  const user = process.env.ADMIN_USER?.trim();
  const password = process.env.ADMIN_PASSWORD;
  // A short password on a page that grants product access is not worth
  // defending; treated as unset so the page stays closed.
  if (!user || !password || password.length < 12) return null;
  return { user, password };
}

export function adminConfigured(): boolean {
  return configured() !== null;
}

/** Constant-time compare that does not leak length through an early return. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) {
    // Still do the work, against a copy of itself, so a wrong length costs the
    // same as a wrong value.
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/**
 * Returns null when the request may proceed, or the Response to send back.
 *
 *   404  no credentials configured — the page is not here
 *   401  missing or wrong credentials, with the browser prompt
 */
export function requireAdmin(request: Request): Response | null {
  const creds = configured();
  if (!creds) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && encoded) {
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      decoded = "";
    }
    const split = decoded.indexOf(":");
    if (split > 0) {
      const user = decoded.slice(0, split);
      const password = decoded.slice(split + 1);
      // Both compared, always, so a valid username with a wrong password takes
      // the same time as a wrong username.
      const userOk = sameSecret(user, creds.user);
      const passOk = sameSecret(password, creds.password);
      if (userOk && passOk) return null;
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": REALM, "Cache-Control": "no-store" },
  });
}
