import type { Metadata } from "next";

/**
 * Branded 404.
 *
 * The homepage is a static HTML rewrite, so this route is the only place a
 * visitor sees anything React renders. It deliberately carries its own inline
 * styles rather than relying on `globals.css`, which the landing page never
 * loads — keeping the two independent means a cleanup of the unused stylesheet
 * can't silently turn this page white.
 */

export const metadata: Metadata = {
  title: "Page not found — GoXL Ally",
  robots: { index: false, follow: true },
};

const BG = "#040705";
const ACCENT = "#2fe3ac";
const TEXT = "#eef4f1";
const MUTED = "#7a8b84";
const FONT_DISPLAY =
  "'Avenir Next','Segoe UI Semibold','Century Gothic',ui-sans-serif,system-ui,sans-serif";
const FONT_BODY = "'Segoe UI',ui-sans-serif,system-ui,-apple-system,sans-serif";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "48px 24px",
        background: BG,
        color: TEXT,
        fontFamily: FONT_BODY,
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "'SFMono-Regular',Consolas,Menlo,monospace",
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: ACCENT,
        }}
      >
        404
      </p>

      <h1
        style={{
          margin: 0,
          fontFamily: FONT_DISPLAY,
          fontSize: "clamp(30px, 6vw, 52px)",
          lineHeight: 1.08,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        This page took a wrong turn.
      </h1>

      <p style={{ margin: 0, maxWidth: "44ch", fontSize: 16, lineHeight: 1.6, color: MUTED }}>
        The link may be old, or the page may have moved. Everything about Ally
        still starts from the home page.
      </p>

      <a
        href="/"
        style={{
          marginTop: 10,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: ACCENT,
          color: "#04120c",
          padding: "14px 26px",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        Back to GoXL Ally
      </a>

      <nav
        aria-label="Legal"
        style={{ marginTop: 18, display: "flex", gap: 14, fontSize: 13, color: MUTED }}
      >
        <a href="/about.html" style={{ color: "inherit" }}>Our Story</a>
        <span aria-hidden="true">|</span>
        <a href="/privacy.html" style={{ color: "inherit" }}>Privacy</a>
        <span aria-hidden="true">|</span>
        <a href="/terms.html" style={{ color: "inherit" }}>Terms</a>
      </nav>
    </div>
  );
}
