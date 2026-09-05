import { isSameOriginRequest } from "../../api/_dev-write-security";
import { GRANT_CHUNK, grantNextBatch } from "../../lib/access";
import { requireAdmin } from "../../lib/admin-auth";
import { accessCounts, getCapacity, pendingGrants, queuePreview, setCapacity } from "../../lib/db";
import { escapeHtml } from "../../lib/email-template";

/**
 * The one page the team uses to run batched access.
 *
 * It shows how far the queue has been opened, who is next in line, and offers
 * a single action: open N more places. Everything else about the flow is
 * automatic, and the page is deliberately not a founder admin — it cannot edit
 * or read anything beyond what is needed to decide "open more or not".
 *
 * Behind Basic auth, and absent entirely when no credentials are configured
 * (see admin-auth.ts). Never indexed, never cached.
 *
 * Granting is chunked: each POST lets in up to GRANT_CHUNK founders and
 * reports what is left, because a batch of 300 is 300 Supabase calls and 300
 * emails, which no single serverless invocation will survive. The page
 * re-submits itself while work remains, so opening a large batch is one click
 * followed by a progress line rather than one request that times out.
 */

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

const MAX_BODY_BYTES = 2_048;
const QUEUE_PREVIEW = 25;

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Access — Ally waitlist</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px;background:#101413;color:#e8efec;
       font:14px/1.55 'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif}
  main{max-width:760px;margin:0 auto}
  .eyebrow{margin:0 0 6px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2fe3ac}
  h1{margin:0 0 20px;font-size:22px;font-weight:600;letter-spacing:-.01em}
  h2{margin:28px 0 10px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8b9a94}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:0 0 8px}
  .stat{border:1px solid #24352f;border-radius:10px;padding:12px 14px;background:#0b0f0e}
  .stat b{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em}
  .stat span{font-size:11.5px;color:#8b9a94}
  form{margin:18px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  input[type=number]{width:110px;padding:9px 11px;border:1px solid #24352f;border-radius:8px;
                     background:#0b0f0e;color:#e8efec;font:inherit}
  button{background:#2fe3ac;border:0;border-radius:8px;padding:10px 18px;color:#04120c;
         font:700 14px/1 inherit;cursor:pointer}
  button.quiet{background:#1c2a26;color:#c6d3ce}
  table{border-collapse:collapse;width:100%;margin:8px 0 0;font-size:13px}
  th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #1b2723}
  th{color:#8b9a94;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
  .badge{display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600;
         background:#1c2a26;color:#c6d3ce}
  .badge.in{background:#123326;color:#2fe3ac}
  .dim{color:#8b9a94;font-size:12.5px}
  .ok{color:#2fe3ac} .bad{color:#ff7b72} .warn{color:#f2c94c}
  p{margin:0 0 10px}
  code{font-family:Consolas,Menlo,monospace;font-size:12.5px;color:#c6d3ce}
</style>
</head>
<body><main>
  <p class="eyebrow">GoXL Ally · Waitlist</p>
  <h1>Access</h1>
  ${body}
</main></body>
</html>`,
    { status, headers: HTML },
  );
}

async function overview(notice = ""): Promise<Response> {
  const [capacity, counts, queue, pending] = await Promise.all([
    getCapacity(),
    accessCounts(),
    queuePreview(QUEUE_PREVIEW),
    pendingGrants(1),
  ]);

  const rows = queue
    .map((q) => {
      const inside = q.position <= capacity;
      const granted = q.status === "INVITED" || q.status === "ACTIVE";
      return `<tr>
        <td class="dim">${q.position}</td>
        <td>${escapeHtml(q.name)}</td>
        <td class="dim">${escapeHtml(q.email)}</td>
        <td><span class="badge${granted ? " in" : ""}">${granted ? "IN" : inside ? "GRANTING" : "WAITING"}</span></td>
        <td class="dim">${q.createdAt.toISOString().slice(0, 10)}</td>
      </tr>`;
    })
    .join("");

  // Anything inside capacity that has not been let in yet: a batch that was
  // interrupted, or grants that failed and are waiting for another attempt.
  const unfinished = pending.length > 0;

  return page(`
  ${notice}
  <div class="stats">
    <div class="stat"><b>${capacity}</b><span>places opened</span></div>
    <div class="stat"><b>${counts.granted}</b><span>have access</span></div>
    <div class="stat"><b>${counts.waiting}</b><span>waiting</span></div>
    <div class="stat"><b>${counts.total}</b><span>registered</span></div>
  </div>

  ${unfinished
    ? `<p class="warn">Some founders inside the opened places have not been let in yet — finish the batch below.</p>
       <form method="post"><input type="hidden" name="action" value="process"><button type="submit">Finish the batch</button></form>`
    : ""}

  <h2>Open more places</h2>
  <p class="dim">Everyone in line up to the new total is let in, oldest registration first. Each one gets their Ally account and an email with a sign-in link.</p>
  <form method="post">
    <input type="hidden" name="action" value="open">
    <label for="more" class="dim">Open</label>
    <input id="more" name="more" type="number" min="1" max="5000" value="300" required>
    <span class="dim">more places (total becomes ${capacity} + N)</span>
    <button type="submit">Open</button>
  </form>

  <h2>Next in line</h2>
  ${queue.length === 0
    ? `<p class="dim">Nobody has registered yet.</p>`
    : `<table>
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>State</th><th>Registered</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${counts.total > QUEUE_PREVIEW ? `<p class="dim">Showing the first ${QUEUE_PREVIEW} of ${counts.total}.</p>` : ""}`}
  `);
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    return await overview();
  } catch (error) {
    console.error("[ally-beta] admin overview failed", error);
    return page(`<p class="bad">Could not read the queue. Check the server log.</p>`, 500);
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!isSameOriginRequest(request)) return page(`<p class="bad">This action must be taken from this page.</p>`, 403);

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return page(`<p class="bad">Unexpected request format.</p>`, 415);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return page(`<p class="bad">Request too large.</p>`, 413);
  }

  const params = new URLSearchParams(raw);
  const action = params.get("action");
  // Dev only: the emails must link back to this server so the captured copies
  // in /dev/outbox are followable.
  const devOrigin = process.env.NODE_ENV === "production" ? undefined : new URL(request.url).origin;

  try {
    if (action === "open") {
      const more = Number(params.get("more"));
      if (!Number.isInteger(more) || more < 1 || more > 5000) {
        return overview(`<p class="bad">Enter a whole number of places between 1 and 5000.</p>`);
      }
      const capacity = await getCapacity();
      await setCapacity(capacity + more);
      // Fall through into the same granting pass, so one click both opens the
      // places and starts letting people in.
    } else if (action !== "process") {
      return overview(`<p class="bad">Unknown action.</p>`);
    }

    const result = await grantNextBatch({ baseUrl: devOrigin });

    const parts: string[] = [];
    if (result.granted > 0) parts.push(`<p class="ok">Let in ${result.granted} founder${result.granted === 1 ? "" : "s"}.</p>`);
    if (result.emailFailures > 0) {
      parts.push(`<p class="warn">${result.emailFailures} of them could not be emailed — they have access, but do not know. Check the server log.</p>`);
    }
    if (result.failed.length > 0) {
      parts.push(`<p class="bad">${result.failed.length} could not be let in:</p><ul class="dim">${
        result.failed.map((f) => `<li>${escapeHtml(f.email)} — ${escapeHtml(f.error)}</li>`).join("")
      }</ul><p class="dim">They keep their place; try again once the cause is fixed.</p>`);
    }
    if (result.remaining > 0) {
      // Auto-continue: the operator clicked once, so the page finishes the job
      // rather than asking them to keep clicking. noscript keeps the button.
      parts.push(`<p class="dim" id="more-left">${result.remaining} still to go — continuing…</p>
        <form method="post" id="continue"><input type="hidden" name="action" value="process">
          <noscript><button type="submit">Continue</button></noscript>
        </form>
        <script>setTimeout(function(){document.getElementById('continue').submit();}, 400);</script>`);
    } else if (result.granted > 0) {
      parts.push(`<p class="ok">Batch complete.</p>`);
    } else if (parts.length === 0) {
      parts.push(`<p class="dim">Nobody was waiting inside the opened places.</p>`);
    }

    return overview(parts.join("\n"));
  } catch (error) {
    console.error("[ally-beta] batch action failed", error);
    return page(`<p class="bad">Something went wrong. Check the server log; nothing partial is lost — re-running continues where it stopped.</p>`, 500);
  }
}
