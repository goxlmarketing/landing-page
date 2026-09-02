import { isSameOriginRequest } from "../api/_dev-write-security";
import { approvalConfigured, verifyApprovalToken } from "../lib/approval-token";
import { findBetaUserById, markBetaUserInvited, type BetaUserRow } from "../lib/db";
import { sendBetaApprovalEmail } from "../lib/email";
import { escapeHtml } from "../lib/email-template";
import { platformLoginUrl } from "../lib/platform-url";
import { ensureAuthUser } from "../lib/supabase-admin";

/**
 * One-click approval for a waitlist registration.
 *
 * The Approve link in the internal notification lands here (GET) carrying a
 * signed token. GET only SHOWS the registration and a confirm button: mail
 * clients and link scanners prefetch URLs, and a GET that approved would let a
 * corporate security scanner approve people. The POST behind the button does
 * the work, in this order:
 *
 *   1. create the founder's auth user in the platform's Supabase — this is the
 *      actual grant of access, since the platform only mails sign-in codes to
 *      addresses it already knows
 *   2. mark the registration INVITED
 *   3. email the founder their sign-in link
 *
 * A failure at step 1 changes nothing and sends nothing. Re-approving an
 * INVITED registration is a no-op; "Resend invite" repeats step 3 only.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const HTML_HEADERS = {
  ...NO_STORE,
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;
const MAX_BODY_BYTES = 2_048;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Same reasoning as the early-access route: trust only the LAST forwarded hop. */
function clientKey(request: Request): string {
  const chain = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const nearest = chain.length ? chain[chain.length - 1]?.trim() : undefined;
  return (nearest || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 96);
}

function rateLimited(request: Request): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

/** In development, links in the emails must point back at this server. */
function devOriginFor(request: Request): string | undefined {
  return process.env.NODE_ENV === "production" ? undefined : new URL(request.url).origin;
}

function formatDate(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} — Ally waitlist</title>
<style>
  *{ box-sizing:border-box; }
  body{ margin:0; padding:32px 20px; background:#101413; color:#e8efec;
        font:15px/1.55 'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; }
  main{ max-width:560px; margin:0 auto; }
  .eyebrow{ margin:0 0 6px; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:#2fe3ac; }
  h1{ margin:0 0 18px; font-size:22px; font-weight:600; letter-spacing:-0.01em; }
  table{ border-collapse:collapse; margin:0 0 20px; font-size:14px; }
  td{ padding:4px 16px 4px 0; vertical-align:top; }
  td:first-child{ color:#8b9a94; white-space:nowrap; }
  .badge{ display:inline-block; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:600;
          background:#1c2a26; color:#c6d3ce; }
  .badge.invited{ background:#123326; color:#2fe3ac; }
  form{ margin:22px 0 0; }
  button{ background:#2fe3ac; border:0; border-radius:8px; padding:11px 18px;
          color:#04120c; font:600 14px/1 inherit; cursor:pointer; }
  button.quiet{ background:#1c2a26; color:#c6d3ce; }
  p{ margin:0 0 12px; }
  .ok{ color:#2fe3ac; } .bad{ color:#ff7b72; } .warn{ color:#f2c94c; } .dim{ color:#8b9a94; font-size:13px; }
  code{ font-family:Consolas,Menlo,monospace; font-size:12.5px; color:#c6d3ce; word-break:break-all; }
  a{ color:#2fe3ac; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">GoXL Ally · Waitlist</p>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</main>
</body>
</html>`;
  return new Response(html, { status, headers: HTML_HEADERS });
}

function detailsTable(user: BetaUserRow): string {
  const approved = user.status === "INVITED" || user.status === "ACTIVE";
  return `<table>
    <tr><td>Name</td><td>${escapeHtml(user.name)}</td></tr>
    <tr><td>Email</td><td>${escapeHtml(user.email)}</td></tr>
    <tr><td>Registered</td><td>${escapeHtml(formatDate(user.createdAt))}</td></tr>
    <tr><td>Status</td><td><span class="badge${approved ? " invited" : ""}">${escapeHtml(user.status)}</span>${
      approved ? ` <span class="dim">since ${escapeHtml(formatDate(user.updatedAt))}</span>` : ""
    }</td></tr>
  </table>`;
}

function confirmForm(token: string, action: "approve" | "resend", label: string): string {
  return `<form method="post" action="/approve">
    <input type="hidden" name="t" value="${escapeHtml(token)}">
    <input type="hidden" name="action" value="${action}">
    <button type="submit"${action === "resend" ? ' class="quiet"' : ""}>${escapeHtml(label)}</button>
  </form>`;
}

/** Token → registration, or the error page to return instead. */
async function loadRegistration(token: string): Promise<BetaUserRow | Response> {
  if (!approvalConfigured()) {
    return page(
      "Approval is not configured",
      `<p class="bad">APPROVAL_SECRET is not set on this server, so approval links cannot be verified.</p>
       <p class="dim">Set it (32+ characters) and register again to get a fresh link.</p>`,
      500,
    );
  }
  const id = verifyApprovalToken(token);
  if (!id) {
    return page("This link is not valid", `<p>The approval link is malformed or was not issued by this server.</p>`, 400);
  }
  let user: BetaUserRow | null;
  try {
    user = await findBetaUserById(id);
  } catch (error) {
    console.error("[ally-beta] approval lookup failed", error);
    return page("Something went wrong", `<p class="bad">The registration could not be loaded. Check the server log.</p>`, 500);
  }
  if (!user) return page("Registration not found", `<p>No registration matches this link any more.</p>`, 404);
  return user;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const loaded = await loadRegistration(token);
  if (loaded instanceof Response) return loaded;

  const approved = loaded.status === "INVITED" || loaded.status === "ACTIVE";
  const body = approved
    ? `${detailsTable(loaded)}
       <p class="ok">Already approved. Nothing more to do.</p>
       <p class="dim">If they never received the email, you can send it again.</p>
       ${confirmForm(token, "resend", "Resend invite email")}`
    : `${detailsTable(loaded)}
       <p>Approving creates their Ally account and emails them a link to set it up.</p>
       ${confirmForm(token, "approve", "Approve & send invite")}`;
  return page(approved ? "Already approved" : "Approve this registration?", body);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return page("Not allowed", `<p>This action must be taken from the confirmation page.</p>`, 403);
  }
  if (rateLimited(request)) {
    return page("Slow down", `<p>Too many attempts. Please wait a few minutes.</p>`, 429);
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return page("Not allowed", `<p>Unexpected request format.</p>`, 415);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return page("Not allowed", `<p>Request too large.</p>`, 413);
  }

  const params = new URLSearchParams(raw);
  const token = params.get("t") ?? "";
  const action = params.get("action") === "resend" ? "resend" : "approve";

  const loaded = await loadRegistration(token);
  if (loaded instanceof Response) return loaded;
  const user = loaded;

  const devOrigin = devOriginFor(request);
  const loginUrl = platformLoginUrl(user.email);
  const approved = user.status === "INVITED" || user.status === "ACTIVE";

  if (action === "resend") {
    if (!approved) {
      return page("Not approved yet", `${detailsTable(user)}<p>Approve the registration first.</p>`, 400);
    }
    const sent = await sendBetaApprovalEmail({ name: user.name, email: user.email, loginUrl, baseUrl: devOrigin });
    return page(
      sent ? "Invite re-sent" : "Could not send",
      `${detailsTable(user)}${
        sent
          ? `<p class="ok">Invite email sent again to ${escapeHtml(user.email)}.</p>`
          : `<p class="bad">The invite email could not be sent. Check the server log.</p>`
      }${devOrigin ? `<p><a href="/dev/outbox">Open the local email outbox →</a></p>` : ""}`,
      sent ? 200 : 500,
    );
  }

  if (approved) {
    return page("Already approved", `${detailsTable(user)}<p class="ok">Nothing was changed.</p>`);
  }

  // 1. Grant access. Fails closed: no row change and no email if this fails.
  const auth = await ensureAuthUser({ email: user.email, name: user.name });
  if (!auth.ok) {
    console.error(`[ally-beta] approval of ${user.id} failed at Supabase: ${auth.error}`);
    return page(
      "Approval failed",
      `${detailsTable(user)}
       <p class="bad">Could not create the founder's account: ${escapeHtml(auth.error)}</p>
       <p>Nothing was changed. Fix the configuration, then open the approval link again.</p>`,
      500,
    );
  }

  // 2. Record it.
  let updated: BetaUserRow | null;
  try {
    updated = await markBetaUserInvited(user.id);
  } catch (error) {
    console.error("[ally-beta] approval update failed", error);
    return page(
      "Approval failed",
      `${detailsTable(user)}<p class="bad">The registration could not be updated. Check the server log.</p>`,
      500,
    );
  }
  if (!updated) return page("Registration not found", `<p>No registration matches this link any more.</p>`, 404);

  // 3. Tell the founder.
  const sent = await sendBetaApprovalEmail({ name: user.name, email: user.email, loginUrl, baseUrl: devOrigin });

  const notes: string[] = [];
  if (auth.skipped) {
    notes.push(
      `<p class="warn">Dev: Supabase admin is not configured, so no auth user was created. In production this step is required and approval would have stopped here.</p>`,
    );
  }
  notes.push(
    sent
      ? `<p class="ok">Invite email sent to ${escapeHtml(user.email)}.</p>`
      : `<p class="bad">Approved, but the invite email could not be sent — check the server log, then use “Resend invite email” from this link.</p>`,
  );
  if (devOrigin) notes.push(`<p><a href="/dev/outbox">Open the local email outbox →</a></p>`);

  return page(
    "Approved",
    `${detailsTable(updated)}${notes.join("\n")}
     <p class="dim">Sign-in link in the email: <code>${escapeHtml(loginUrl)}</code></p>`,
  );
}
