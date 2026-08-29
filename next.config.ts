import os from "node:os";
import type { NextConfig } from "next";

/**
 * This machine's LAN addresses, so `next dev` will serve its own dev resources
 * to a phone on the same network.
 *
 * Replaces a hardcoded personal IP that only ever worked on one machine. An
 * empty list was the wrong correction — it locks the dev server to localhost,
 * which is what broke opening the site on a phone.
 */
const lanOrigins = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  /**
   * Production only.
   *
   * This rewrites every subresource request to https. The dev server is plain
   * http, so on a phone opening http://<lan-ip>:3000 the browser asked for
   * https://<lan-ip>:3000/assets/... — nothing is listening there, and every
   * image failed while the text rendered fine. It goes unnoticed on localhost,
   * which browsers treat as a secure context and exempt from the upgrade.
   */
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Phone / LAN: allow Next.js dev JS/CSS/HMR when opened via network IP
  // Set ALLOWED_DEV_ORIGIN to your machine's LAN IP to open the dev server from
  // a phone. Was a hardcoded personal address committed to the repo, which only
  // ever worked for one machine on one network.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN
    ? [process.env.ALLOWED_DEV_ORIGIN]
    : lanOrigins,
  // Hide the floating Next.js “N” badge in development
  devIndicators: false,
  /**
   * `beforeFiles`, not the default bucket.
   *
   * Plain `rewrites()` entries are evaluated AFTER filesystem routes, so
   * `app/page.tsx` matched `/` first and this rewrite never ran — the old
   * `middleware.ts` was silently doing all the work. `beforeFiles` runs ahead
   * of the App Router, which is what actually serves the static landing page
   * here and lets the deprecated middleware convention go away.
   */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/ally-landing-v2.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      {
        source: "/ally-landing.original.html",
        destination: "/",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/ally-platform.html",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      // Everything under /assets carries a .vN in its filename, so a given URL
      // always names the same bytes and can be cached indefinitely. Changing an
      // image means bumping that suffix, which changes the URL — never edit a
      // file in place and leave the name alone, or clients will hold the stale
      // copy for a year.
      //
      // /assets/email/* is deliberately excluded: those URLs are baked into
      // confirmation emails already sitting in people's inboxes, so they can't
      // be renamed. They get a day instead.
      {
        source: "/assets/:path((?!email/).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/assets/email/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
