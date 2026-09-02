import { isSameOriginRequest } from "../../api/_dev-write-security";
import { devClearOutbox, devListOutbox, type OutboxEntry } from "../../lib/dev-store";
import { escapeHtml } from "../../lib/email-template";

/**
 * Development-only inbox for every email the app would have sent.
 *
 *   /dev/outbox                      → newest first, each rendered in a frame
 *                                      with its links pulled out so the flow
 *                                      can be followed by clicking
 *   /dev/outbox?view=html&id=<id>    → one email's HTML (what the frame loads)
 *   POST /dev/outbox                 → empty the outbox
 *
 * Emails land here only when SMTP is not configured (see email.ts `send`).
 * Returns 404 in production so the route leaves no trace on the live site.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const HTML_HEADERS = { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } as const;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return notFound();

  const url = new URL(request.url);
  const entries = await devListOutbox();

  const id = url.searchParams.get("id");
  if (url.searchParams.get("view") === "html" && id) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return notFound();
    return new Response(entry.html, { headers: HTML_HEADERS });
  }

  return new Response(shell(entries), { headers: HTML_HEADERS });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return notFound();
  if (!isSameOriginRequest(request)) {
    return new Response("Not allowed", { status: 403, headers: NO_STORE });
  }
  await devClearOutbox();
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: "/dev/outbox" } });
}

/** Every absolute http(s) link in the email, in order of appearance, deduplicated. */
function linksOf(html: string): string[] {
  const out = new Set<string>();
  const re = /href="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(href)) out.add(href);
  }
  return [...out];
}

function card(entry: OutboxEntry): string {
  const links = linksOf(entry.html);
  return `<article class="mail">
    <header>
      <div class="subject">${escapeHtml(entry.subject)}</div>
      <div class="meta">
        <span>to <b>${escapeHtml(entry.to)}</b></span>
        <span>${escapeHtml(entry.context)}</span>
        <span>${escapeHtml(entry.sentAt.replace("T", " ").slice(0, 19))}</span>
      </div>
    </header>
    ${
      links.length
        ? `<ul class="links">${links
            .map((href) => `<li><a href="${escapeHtml(href)}" target="_top">${escapeHtml(href)}</a></li>`)
            .join("")}</ul>`
        : ""
    }
    <iframe src="/dev/outbox?view=html&amp;id=${escapeHtml(entry.id)}" title="${escapeHtml(entry.subject)}"></iframe>
  </article>`;
}

function shell(entries: OutboxEntry[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Dev outbox — Ally</title>
<style>
  *{ box-sizing:border-box; }
  body{ margin:0; padding:28px; background:#101413; color:#e8efec;
        font:14px/1.5 'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; }
  h1{ margin:0 0 4px; font-size:17px; font-weight:600; }
  .note{ margin:0 0 22px; color:#8b9a94; font-size:13px; }
  .note code{ color:#2fe3ac; font-family:Consolas,Menlo,monospace; }
  .bar{ display:flex; gap:12px; align-items:center; margin:0 0 22px; }
  .bar form{ margin:0; }
  button{ background:#1c2a26; border:0; border-radius:8px; padding:8px 14px;
          color:#c6d3ce; font:600 13px/1 inherit; cursor:pointer; }
  .mail{ max-width:720px; margin:0 0 26px; border:1px solid #24352f; border-radius:12px; overflow:hidden; background:#0b0f0e; }
  .mail header{ padding:14px 16px; border-bottom:1px solid #24352f; }
  .subject{ font-weight:600; font-size:15px; }
  .meta{ display:flex; gap:14px; flex-wrap:wrap; margin-top:4px; color:#8b9a94; font-size:12px; }
  .meta b{ color:#c6d3ce; font-weight:600; }
  .links{ list-style:none; margin:0; padding:10px 16px; border-bottom:1px solid #24352f; background:#0e1512; }
  .links li{ margin:3px 0; font-size:12.5px; word-break:break-all; }
  .links a{ color:#2fe3ac; }
  iframe{ display:block; width:100%; height:520px; border:0; background:#040705; }
  .empty{ color:#8b9a94; }
</style>
</head>
<body>
  <h1>Dev outbox</h1>
  <p class="note">Every email the app would have sent, newest first. Captured because SMTP is not configured;
     this page 404s when <code>NODE_ENV=production</code>. Links are listed above each email so the flow can be followed by clicking.</p>
  <div class="bar">
    <a href="/dev/outbox"><button type="button">Refresh</button></a>
    <form method="post" action="/dev/outbox"><button type="submit">Clear outbox</button></form>
    <a href="/#early-access"><button type="button">Back to the form</button></a>
  </div>
  ${entries.length ? entries.map(card).join("\n") : `<p class="empty">Nothing yet. Submit the early-access form and come back.</p>`}
</body>
</html>`;
}
