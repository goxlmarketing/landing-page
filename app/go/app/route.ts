import { platformAppUrl } from "../../lib/platform-url";

/**
 * `/go/app` → the founder's dashboard on the platform.
 *
 * Shown as "Go to my dashboard" when the platform's `ally_hint` cookie says a
 * founder is signed in. The platform verifies the real session on arrival and
 * sends anyone without one to sign-in, so a stale or forged hint costs nothing
 * but a redirect. Fixed destination from PLATFORM_URL -- not an open redirect.
 */
export function GET() {
  return new Response(null, {
    status: 302,
    headers: { Location: platformAppUrl(), "Cache-Control": "no-store" },
  });
}
