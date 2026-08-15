import nodemailer, { type Transporter } from "nodemailer";

import { escapeHtml, renderBetaConfirmationEmail } from "./email-template";

/**
 * Server-only transactional email for the Ally beta flow, sent over SMTP
 * (Hostinger mailbox for goxlally.ai).
 *
 * Every function here is best-effort and NEVER throws: the database is the
 * source of truth for a registration, so an email outage must not lose or
 * invalidate a beta lead. Failures are logged server-side only.
 *
 * The branded customer-facing template lives in `email-template.ts`. The
 * internal notification below is deliberately plain and stays here — it is an
 * operational email, not a product one.
 */

type ConfirmationRecipient = {
  name: string;
  email: string;
};

type InternalNotification = {
  name: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  registeredAt: Date;
  source: string;
};

type Outgoing = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const DEFAULT_HOST = "smtp.hostinger.com";
const DEFAULT_PORT = 465;

/**
 * The registration response waits on delivery, so a wedged SMTP server must
 * not be able to stall it.
 *
 * These are per-phase caps, so on their own they can stack (connect, then
 * greet, then transfer). SEND_DEADLINE_MS below is the hard ceiling on a whole
 * send; the route sends both emails concurrently, so that figure is also the
 * worst case for the request as a whole. Kept well under the serverless
 * function limit on Vercel's Hobby plan, which is 10s by default.
 */
const CONNECTION_TIMEOUT_MS = 4_000;
const GREETING_TIMEOUT_MS = 4_000;
const SOCKET_TIMEOUT_MS = 6_000;
const SEND_DEADLINE_MS = 7_000;

/**
 * Rejects if `promise` has not settled within `ms`.
 *
 * The underlying send may still complete — we simply stop waiting on it. For a
 * best-effort email that is the right trade: a founder should never see a
 * failed registration because our mail server was slow.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    const done = () => clearTimeout(timer);
    promise.then(
      (value) => { done(); resolve(value); },
      (error) => { done(); reject(error); },
    );
  });
}

declare global {
  // Reused across hot reloads in dev and warm invocations in production so we
  // aren't renegotiating TLS on every registration.
  var __allyBetaMailer: Transporter | undefined;
}

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim() || DEFAULT_HOST;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;

  const port = Number(process.env.SMTP_PORT) || DEFAULT_PORT;

  if (!globalThis.__allyBetaMailer) {
    globalThis.__allyBetaMailer = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
  }
  return globalThis.__allyBetaMailer;
}

/** Never throws — SMTP failures are logged and reported as `false`. */
async function send(payload: Outgoing, context: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[ally-beta] ${context} skipped: SMTP_USER / SMTP_PASSWORD are not configured`,
    );
    return false;
  }

  try {
    await withDeadline(transporter.sendMail(payload), SEND_DEADLINE_MS, context);
    return true;
  } catch (error) {
    // Hostinger rejects any From that isn't the authenticated mailbox, which
    // is the most common misconfiguration here — surface it explicitly.
    console.error(`[ally-beta] ${context} failed`, error);
    return false;
  }
}

/**
 * Confirmation to the beta user. Only called after the row is committed, and
 * only for genuinely new registrations.
 */
export async function sendBetaConfirmationEmail(user: ConfirmationRecipient): Promise<boolean> {
  const from = process.env.BETA_FROM_EMAIL;
  if (!from) {
    console.warn("[ally-beta] confirmation email skipped: BETA_FROM_EMAIL is not configured");
    return false;
  }

  const { subject, html, text } = renderBetaConfirmationEmail({ name: user.name });
  return send({ from, to: user.email, subject, html, text }, "confirmation email");
}

/** Internal heads-up for the GoXL team. Silently skipped when unconfigured. */
export async function sendInternalNotificationEmail(
  registration: InternalNotification,
): Promise<boolean> {
  const from = process.env.BETA_FROM_EMAIL;
  const to = process.env.BETA_NOTIFY_EMAIL;
  if (!to) return false;
  if (!from) {
    console.warn("[ally-beta] internal notification skipped: BETA_FROM_EMAIL is not configured");
    return false;
  }

  const rows: Array<[string, string]> = [
    ["Name", registration.name],
    ["Email", registration.email],
    ["Phone", registration.phone || "—"],
    ["LinkedIn", registration.linkedinUrl || "—"],
    ["Registered At", registration.registeredAt.toISOString()],
    ["Source", registration.source],
  ];

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b201e;">
    <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;">New Ally Early Access Registration</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:2px 16px 2px 0;color:#6b736f;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:2px 0;">${escapeHtml(value)}</td></tr>`,
        )
        .join("\n      ")}
    </table>
  </body>
</html>`;

  const text = ["New Ally Early Access Registration", "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");

  return send(
    {
      from,
      to,
      subject: `New Ally Early Access Registration — ${registration.name}`,
      html,
      text,
      replyTo: registration.email,
    },
    "internal notification email",
  );
}
