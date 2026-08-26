import type { Metadata } from "next";

/**
 * The homepage is a static HTML rewrite handled in `next.config.ts`, so nothing
 * this layout renders is ever seen on `/`. The only page that reaches it is
 * `not-found.tsx`, which carries its own inline styles.
 *
 * Dropped `globals.css` and the Poppins webfont: neither was reachable. The
 * stylesheet was 1,669 lines describing a React port of the landing page that
 * no route renders, and the font was downloaded on every request while the
 * actual page used its own stack.
 */

export const metadata: Metadata = {
  title: "GoXL Ally — The Founder’s Compass",
  description:
    "Ally helps founders turn context into clarity, better decisions, and daily action. Register for early access.",
  openGraph: {
    title: "GoXL Ally — The Founder’s Compass",
    description: "Clarity, decisions and daily action for founders.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* margin:0 replaces the only rule from globals.css this tree relied on. */}
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
