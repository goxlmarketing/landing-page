import { platformLoginUrl } from "../../lib/platform-url";

/**
 * `/go/login` → the platform's sign-in page.
 *
 * The static pages (login.html, the nav) link here rather than hard-coding the
 * platform origin, so the destination is decided in one place and follows
 * PLATFORM_URL — the local Vite dev server while testing, production otherwise.
 * The target is fixed server-side; nothing from the request influences it, so
 * this is not an open redirect.
 */
export function GET() {
  return new Response(null, {
    status: 302,
    headers: { Location: platformLoginUrl(), "Cache-Control": "no-store" },
  });
}
