/**
 * Where approved founders go to sign in — the Ally platform, a separate app on
 * a separate origin. Every link from this site to it is built here so the
 * destination lives in exactly one place.
 *
 * PLATFORM_URL overrides the default; unset, it is the production platform in
 * production and the platform's local Vite dev server otherwise, so the flow
 * can be clicked through end to end on one machine.
 */

const PRODUCTION_PLATFORM_URL = "https://goxlally.ai";
const DEV_PLATFORM_URL = "http://localhost:5173";

export function resolvePlatformUrl(): string {
  const fallback = process.env.NODE_ENV === "production" ? PRODUCTION_PLATFORM_URL : DEV_PLATFORM_URL;
  const raw = process.env.PLATFORM_URL?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return fallback;
  }
}

/**
 * The platform's sign-in page, optionally with the founder's email pre-filled.
 *
 * The email rides in the URL FRAGMENT, not the query string: a fragment is
 * never sent to the server, so it appears in no access log, CDN log or
 * Referer header along the way. The platform reads it once on load and
 * immediately strips it from the address bar.
 */
export function platformLoginUrl(email?: string): string {
  const base = `${resolvePlatformUrl()}/guided/login`;
  return email ? `${base}#email=${encodeURIComponent(email)}` : base;
}
