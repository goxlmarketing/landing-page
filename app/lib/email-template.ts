/**
 * Customer-facing beta confirmation email (HTML + plain text).
 *
 * The palette, type and brand language below are lifted verbatim from
 * `public/ally-landing.html` so the email reads as the same product as
 * https://join.goxlally.ai. Nothing here is invented.
 *
 * This module owns presentation only — it never sends. See `email.ts`.
 */

type BetaConfirmationInput = {
  /** Full name as registered; only the first name is used in the greeting. */
  name: string;
  /**
   * Origin used for image and link URLs. Defaults to `NEXT_PUBLIC_APP_URL`,
   * then the production site. Overridden by the dev preview route so images
   * resolve same-origin (the app's CSP is `img-src 'self'`).
   */
  baseUrl?: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const PRODUCTION_URL = "https://join.goxlally.ai";

/**
 * Extracted from the `:root` block of `public/ally-landing.html`. The landing
 * page states several of these as rgba over a known surface; email clients
 * (notably Outlook's Word engine) are unreliable with alpha, so each one is
 * pre-composited to the solid hex it resolves to on the surface behind it.
 */
const C = {
  page: "#040705", // --bg
  card: "#080d0b", // --bg-2 lifted a touch off the page
  panel: "#0b1310", // --panel over --bg-2
  border: "#172c26", // --border: rgba(120,220,190,.16) over --bg-2
  borderSoft: "#101d19", // same hairline, quieter (footer rules)
  chipBorder: "#1c4034", // between --border and --border-strong
  accent: "#2fe3ac", // --accent
  accentInk: "#04120c", // .cta text colour
  text: "#eef4f1", // --text
  textDim: "#a9bab3", // --text-dim
  textMute: "#647a72", // --text-mute
  white: "#ffffff",
} as const;

/**
 * Landing page uses 'Avenir Next' / 'Segoe UI Semibold' / 'Century Gothic' for
 * display and 'Segoe UI' for body. Kept intact, with web-safe tails so clients
 * without those faces still fall back sensibly.
 */
const FONT_DISPLAY =
  "'Avenir Next','Segoe UI','Century Gothic',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif";
const FONT_BODY =
  "'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif";
const FONT_MONO = "'SFMono-Regular',Consolas,Menlo,Monaco,'Courier New',monospace";

/**
 * Single source of truth for wording so the HTML and plain-text bodies can
 * never drift apart. Real Unicode punctuation is used throughout — both parts
 * are sent as UTF-8.
 */
const COPY = {
  subject: "You're on the Ally Founder's List",
  preheader:
    "We've received your details. Our team will review and verify them, then contact you with the next steps.",
  // Rendered uppercase by the eyebrow's text-transform.
  eyebrow: "Founder's List · Received",
  heading: "You're on the Ally Founder's List.",
  brandName: "GoXL Ally",
  brandTag: "The Founder's Compass",
  intro:
    "Thanks for joining the Ally Founder's List. We've received your details successfully.",
  what:
    "Ally is the founder's compass — built to help founders turn uncertainty into clarity, better decisions, and deliberate action.",
  statusTitle: "You're on the Founder's List",
  statusNote: "We'll review and verify your details before reaching out.",
  next:
    "Our team will review and verify your details, then contact you with the next steps.",
  ctaLabel: "Explore Ally",
  signOff: "See you inside,",
  signature: "Team GoXL Ally",
  builtBy: "Built by GoXL",
  lockup: "Ally × GoXL",
  legal:
    "You received this email because you registered for the GoXL Ally Founder's List at join.goxlally.ai.",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Honorifics registrants commonly type ahead of their name. Without this the
 * greeting reads "Hi Mr.," or "Hi CA,".
 */
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "sir", "madam",
  "dr", "prof", "er", "ca", "cs", "adv", "capt",
  "shri", "sri", "smt", "sh", "md",
]);

/** Title-cases a token, leaving internal hyphens and apostrophes intact. */
function titleCase(token: string): string {
  return token.replace(/[^\s'’-]+/gu, (part) =>
    part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase(),
  );
}

/**
 * The name used in the greeting, derived from whatever the registrant typed.
 *
 * Real submissions arrive as "Mr. Ayush Kumar", "ayush kumar" and "AYUSH KUMAR"
 * as often as they do "Ayush Kumar", and the raw first token would greet those
 * people as "Hi Mr.,", "Hi ayush," and "Hi AYUSH,".
 *
 * Casing is judged on the whole entry rather than the first token, so a shouted
 * "RAJ KUMAR" is softened to "Raj" while deliberate forms like "JJ Abrams" and
 * "McKenzie Fox" are left exactly as typed.
 */
function greetingNameOf(name: string): string {
  const cleaned = name.trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  // Skip leading honorifics, but never consume the only token we have.
  const bare = (token: string) => token.replace(/[.,]+$/, "");
  let index = 0;
  while (
    index < tokens.length - 1 &&
    HONORIFICS.has(bare(tokens[index]).toLocaleLowerCase())
  ) {
    index += 1;
  }

  const token = bare(tokens[index] ?? "");
  if (!token || HONORIFICS.has(token.toLocaleLowerCase())) return "there";

  const shouted = cleaned === cleaned.toLocaleUpperCase();
  const whispered = cleaned === cleaned.toLocaleLowerCase();
  return shouted || whispered ? titleCase(token) : token;
}

/** Absolute origin, trailing slash stripped. Email clients require absolute URLs. */
function resolveBaseUrl(override?: string): string {
  const raw = (override ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!raw) return PRODUCTION_URL;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return PRODUCTION_URL;
  }
}

/** Shared paragraph style; `size`/`color` vary, everything else is constant. */
function paragraph(html: string, opts: { color?: string; size?: number; gap?: number } = {}): string {
  const { color = C.textDim, size = 16, gap = 18 } = opts;
  return `<p style="margin:0 0 ${gap}px;font-family:${FONT_BODY};font-size:${size}px;line-height:${Math.round(
    size * 1.65,
  )}px;color:${color};">${html}</p>`;
}

function confirmationHtml(firstName: string, baseUrl: string): string {
  const name = escapeHtml(firstName);
  const allyMark = `${baseUrl}/assets/email/ally-mark-email.png`;
  const goxlLogo = `${baseUrl}/assets/email/goxl-logo-email.png`;
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${COPY.heading}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  :root{ color-scheme:dark; supported-color-schemes:dark; }
  body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table,td{ mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
  img{ -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
  a{ text-decoration:none; }
  /* Outlook.com / Windows Mail force-dark: re-assert the intended surfaces. */
  [data-ogsc] .ally-page{ background-color:${C.page} !important; }
  [data-ogsc] .ally-card{ background-color:${C.card} !important; }
  [data-ogsc] .ally-chip{ background-color:${C.panel} !important; }
  [data-ogsc] .ally-ink{ color:${C.text} !important; }
  [data-ogsc] .ally-dim{ color:${C.textDim} !important; }
  [data-ogsc] .ally-mute{ color:${C.textMute} !important; }
  [data-ogsc] .ally-accent{ color:${C.accent} !important; }
  @media only screen and (max-width:600px){
    .ally-gutter{ padding-left:16px !important; padding-right:16px !important; }
    .ally-pad{ padding-left:24px !important; padding-right:24px !important; }
    .ally-pad-y{ padding-top:32px !important; padding-bottom:32px !important; }
    .ally-h1{ font-size:26px !important; line-height:32px !important; }
  }
</style>
</head>
<body class="ally-page" style="margin:0;padding:0;width:100%;background-color:${C.page};">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">${COPY.preheader}</div>
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>

<table role="presentation" class="ally-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};width:100%;">
  <tr>
    <td class="ally-gutter" align="center" style="padding:40px 20px;">

      <!--[if mso | IE]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

        <!-- ── Masthead ─────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding:8px 0 34px;">
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td align="center" style="padding:0 0 18px;">
                <img src="${allyMark}" width="80" height="80" alt="${COPY.brandName}" style="display:block;width:80px;height:80px;">
              </td></tr>
              <tr><td align="center" class="ally-ink" style="font-family:${FONT_DISPLAY};font-size:24px;line-height:28px;font-weight:600;letter-spacing:-0.02em;color:${C.white};">${COPY.brandName}</td></tr>
              <tr><td align="center" class="ally-accent" style="padding-top:8px;font-family:${FONT_BODY};font-size:11px;line-height:16px;letter-spacing:0.16em;text-transform:uppercase;color:${C.accent};">${COPY.brandTag}</td></tr>
            </table>
          </td>
        </tr>

        <!-- ── Card ─────────────────────────────────────────── -->
        <tr>
          <td>
            <table role="presentation" class="ally-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:100%;background-color:${C.card};border:1px solid ${C.border};border-radius:16px;">
              <tr>
                <td class="ally-pad ally-pad-y" style="padding:40px;">

                  <!-- accent rule -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td bgcolor="${C.accent}" height="2" style="width:32px;height:2px;background-color:${C.accent};font-size:0;line-height:0;">&nbsp;</td>
                  </tr></table>

                  <p class="ally-accent" style="margin:20px 0 14px;font-family:${FONT_MONO};font-size:11px;line-height:16px;letter-spacing:0.22em;text-transform:uppercase;color:${C.accent};">${COPY.eyebrow}</p>

                  <h1 class="ally-h1 ally-ink" style="margin:0 0 26px;font-family:${FONT_DISPLAY};font-size:30px;line-height:38px;font-weight:600;letter-spacing:-0.02em;color:${C.white};">${COPY.heading}</h1>

                  ${paragraph(`Hi ${name},`, { color: C.text })}
                  ${paragraph(COPY.intro)}
                  ${paragraph(COPY.what, { gap: 28 })}

                  <!-- ── Status panel ── -->
                  <table role="presentation" class="ally-chip" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="width:100%;background-color:${C.panel};border:1px solid ${C.chipBorder};border-radius:12px;">
                    <tr>
                      <td valign="top" width="34" style="width:34px;padding:20px 0 20px 20px;font-family:${FONT_BODY};font-size:18px;line-height:22px;color:${C.accent};" class="ally-accent">&#10003;</td>
                      <td valign="top" style="padding:20px 20px 20px 0;">
                        <div class="ally-ink" style="font-family:${FONT_BODY};font-size:15px;line-height:22px;font-weight:600;color:${C.text};">${COPY.statusTitle}</div>
                        <div class="ally-mute" style="font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${C.textMute};padding-top:4px;">${COPY.statusNote}</div>
                      </td>
                    </tr>
                  </table>

                  <div style="padding-top:28px;">
                    ${paragraph(COPY.next, { gap: 30 })}
                  </div>

                  <!-- ── CTA ── -->
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${baseUrl}" style="height:48px;v-text-anchor:middle;width:172px;" arcsize="21%" stroke="f" fillcolor="${C.accent}">
                    <w:anchorlock/>
                    <center style="color:${C.accentInk};font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;">${COPY.ctaLabel}</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-- -->
                  <table role="presentation" class="ally-cta" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td bgcolor="${C.accent}" style="background-color:${C.accent};border-radius:10px;">
                      <a href="${baseUrl}" style="display:inline-block;padding:15px 26px;font-family:${FONT_BODY};font-size:15px;line-height:18px;font-weight:700;color:${C.accentInk};text-decoration:none;border-radius:10px;">${COPY.ctaLabel} &rarr;</a>
                    </td>
                  </tr></table>
                  <!--<![endif]-->

                  <!-- ── Sign-off ── -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                    <tr><td height="32" style="height:32px;font-size:0;line-height:0;">&nbsp;</td></tr>
                    <tr><td bgcolor="${C.border}" height="1" style="height:1px;background-color:${C.border};font-size:0;line-height:0;">&nbsp;</td></tr>
                    <tr><td style="padding-top:26px;">
                      <div class="ally-dim" style="font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${C.textDim};">${COPY.signOff}</div>
                      <div class="ally-ink" style="font-family:${FONT_BODY};font-size:15px;line-height:24px;font-weight:600;color:${C.text};">${COPY.signature}</div>
                    </td></tr>
                  </table>

                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Footer ───────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding:34px 20px 0;">
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td align="center" style="padding:0 0 14px;">
                <img src="${goxlLogo}" width="132" height="57" alt="GoXL Entrepreneurship" style="display:block;width:132px;height:57px;">
              </td></tr>
              <tr><td align="center" class="ally-mute" style="font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${C.textMute};">${COPY.builtBy}</td></tr>
              <tr><td align="center" class="ally-mute" style="padding-top:10px;font-family:${FONT_BODY};font-size:11px;line-height:16px;letter-spacing:0.16em;text-transform:uppercase;color:${C.textMute};">${COPY.lockup}</td></tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:340px;margin:0 auto;">
              <tr><td height="24" style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr><td bgcolor="${C.borderSoft}" height="1" style="height:1px;background-color:${C.borderSoft};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <div class="ally-mute" style="font-family:${FONT_BODY};font-size:12px;line-height:19px;color:${C.textMute};padding-top:22px;">${COPY.legal}</div>
            <div class="ally-mute" style="font-family:${FONT_BODY};font-size:12px;line-height:19px;color:${C.textMute};padding-top:8px;">&copy; ${year} GoXL. All rights reserved.</div>
          </td>
        </tr>

      </table>
      <!--[if mso | IE]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>
</body>
</html>`;
}

function confirmationText(firstName: string, baseUrl: string): string {
  return [
    `${COPY.brandName} — ${COPY.brandTag}`,
    "",
    COPY.heading,
    "",
    `Hi ${firstName},`,
    "",
    COPY.intro,
    "",
    COPY.what,
    "",
    `[✓] ${COPY.statusTitle} — ${COPY.statusNote}`,
    "",
    COPY.next,
    "",
    `${COPY.ctaLabel}: ${baseUrl}`,
    "",
    COPY.signOff,
    COPY.signature,
    "",
    "—",
    `${COPY.builtBy} · ${COPY.lockup}`,
    COPY.legal,
    `© ${new Date().getFullYear()} GoXL. All rights reserved.`,
  ].join("\n");
}

/**
 * Renders the complete beta confirmation email.
 *
 * ```ts
 * const { subject, html, text } = renderBetaConfirmationEmail({ name: "Ayush" });
 * ```
 */
export function renderBetaConfirmationEmail({
  name,
  baseUrl,
}: BetaConfirmationInput): RenderedEmail {
  const firstName = greetingNameOf(name);
  const base = resolveBaseUrl(baseUrl);
  return {
    subject: COPY.subject,
    html: confirmationHtml(firstName, base),
    text: confirmationText(firstName, base),
  };
}
