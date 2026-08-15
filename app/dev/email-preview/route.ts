import { renderBetaConfirmationEmail } from "../../lib/email-template";

/**
 * Development-only preview for the beta confirmation email.
 *
 *   /dev/email-preview              → side-by-side desktop + mobile + plain text
 *   /dev/email-preview?view=html    → the raw email document (what Resend sends)
 *   /dev/email-preview?view=text    → the plain-text part
 *   /dev/email-preview?name=Ayush   → swap the greeting name
 *
 * Returns 404 in production so the route leaves no trace on the live site.
 */

const NAME_MAX = 80;
const NO_STORE = { "Cache-Control": "no-store" };
const HTML_HEADERS = { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "Ayush").trim().slice(0, NAME_MAX) || "Ayush";
  const view = url.searchParams.get("view");

  // Point images at this dev server rather than the production origin: the
  // app's CSP is `img-src 'self'`, so cross-origin assets would be blocked in
  // the preview even though they load fine in a real inbox.
  const { subject, html, text } = renderBetaConfirmationEmail({ name, baseUrl: url.origin });

  if (view === "html") {
    return new Response(html, { headers: HTML_HEADERS });
  }
  if (view === "text") {
    return new Response(text, {
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const frameSrc = `/dev/email-preview?view=html&name=${encodeURIComponent(name)}`;
  return new Response(shell({ subject, text, frameSrc, name }), { headers: HTML_HEADERS });
}

function shell({
  subject,
  text,
  frameSrc,
  name,
}: {
  subject: string;
  text: string;
  frameSrc: string;
  name: string;
}): string {
  const frame = (label: string, width: number, height: number) => `
      <div class="pane">
        <div class="pane__head"><span>${label}</span><span class="dim">${width}px</span></div>
        <iframe src="${escapeHtml(frameSrc)}" title="${label} preview"
                style="width:${width}px;height:${height}px;"></iframe>
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email preview — Ally beta confirmation</title>
<style>
  *{ box-sizing:border-box; }
  body{
    margin:0; padding:28px;
    background:#101413; color:#e8efec;
    font:14px/1.5 'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
  }
  h1{ margin:0 0 4px; font-size:17px; font-weight:600; letter-spacing:-0.01em; }
  .meta{ margin:0 0 6px; color:#8b9a94; font-size:13px; }
  .meta code{ color:#2fe3ac; font-family:Consolas,Menlo,monospace; }
  form{ margin:18px 0 26px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  input{
    background:#0b0f0e; border:1px solid #24352f; border-radius:8px;
    padding:8px 12px; color:inherit; font:inherit; width:200px;
  }
  button{
    background:#2fe3ac; border:0; border-radius:8px; padding:9px 16px;
    color:#04120c; font:600 13px/1 inherit; cursor:pointer;
  }
  a.link{ color:#2fe3ac; font-size:13px; }
  .panes{ display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap; }
  .pane__head{
    display:flex; justify-content:space-between; padding:0 2px 8px;
    font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#8b9a94;
  }
  .dim{ color:#5c6b65; }
  iframe{ border:1px solid #24352f; border-radius:10px; background:#040705; display:block; }
  pre{
    margin:0; padding:20px; max-width:640px;
    background:#0b0f0e; border:1px solid #24352f; border-radius:10px;
    color:#c6d3ce; font:13px/1.65 Consolas,Menlo,monospace; white-space:pre-wrap;
  }
  h2{ margin:34px 0 12px; font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:#8b9a94; font-weight:600; }
</style>
</head>
<body>
  <h1>Ally beta confirmation — email preview</h1>
  <p class="meta">Subject: <code>${escapeHtml(subject)}</code></p>
  <p class="meta">Development only. This route 404s when <code>NODE_ENV=production</code>.</p>
  <p class="meta">The name below is a sample. In a real send it comes from the registrant's
     own <code>name</code> field on the early-access form.</p>

  <form method="get" action="/dev/email-preview">
    <label for="name" class="meta">Name</label>
    <input id="name" name="name" value="${escapeHtml(name)}" maxlength="${NAME_MAX}">
    <button type="submit">Render</button>
    <a class="link" href="${escapeHtml(frameSrc)}" target="_blank" rel="noopener">Open raw HTML &rarr;</a>
  </form>

  <div class="panes">
    ${frame("Desktop", 640, 1000)}
    ${frame("Mobile", 375, 1000)}
  </div>

  <h2>Plain-text part</h2>
  <pre>${escapeHtml(text)}</pre>
</body>
</html>`;
}
