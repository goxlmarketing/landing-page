import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const filePath = () => path.join(process.cwd(), "data", "early-access.json");
const MAX_BODY_BYTES = 2_048;
const MAX_LEADS = 10_000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const MAX_RATE_BUCKETS = 5_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type Lead = { name?: string; email: string; phone: string; at: string };
type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();
let writeQueue: Promise<unknown> = Promise.resolve();

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function requestHost(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("host") || new URL(request.url).host).toLowerCase();
}

function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === requestHost(request);
  } catch {
    return false;
  }
}

function clientKey(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (realIp || forwarded || "unknown").slice(0, 96);
}

function consumeRateLimit(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    for (const [storedKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(storedKey);
    }
    if (!rateBuckets.has(key) && rateBuckets.size >= MAX_RATE_BUCKETS) {
      const oldestKey = rateBuckets.keys().next().value as string | undefined;
      if (oldestKey) rateBuckets.delete(oldestKey);
    }
  }

  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= RATE_LIMIT) return null;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
}

function isLead(value: unknown): value is Lead {
  if (!value || typeof value !== "object") return false;
  const lead = value as Partial<Lead>;
  return (
    (lead.name === undefined || typeof lead.name === "string") &&
    typeof lead.email === "string" &&
    typeof lead.phone === "string" &&
    typeof lead.at === "string"
  );
}

async function loadLeads(): Promise<Lead[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLead).slice(0, MAX_LEADS) : [];
  } catch {
    return [];
  }
}

async function storeLead(lead: Lead) {
  const operation = writeQueue.then(async () => {
    const dir = path.dirname(filePath());
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700).catch(() => undefined);

    const leads = await loadLeads();
    if (leads.some((existing) => existing.email === lead.email)) return "duplicate" as const;
    if (leads.length >= MAX_LEADS) return "full" as const;

    leads.push(lead);
    await writeFile(filePath(), JSON.stringify(leads, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(filePath(), 0o600).catch(() => undefined);
    return "saved" as const;
  });

  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Request not allowed" }, 403);
  }

  const retryAfter = consumeRateLimit(request);
  if (retryAfter !== null) {
    return json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return json({ ok: false, error: "JSON request required" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request too large" }, 413);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Request too large" }, 413);
    }

    let body: { name?: unknown; email?: unknown; phone?: unknown };
    try {
      body = JSON.parse(raw) as { name?: unknown; email?: unknown; phone?: unknown };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const name = String(body?.name || "").trim().replace(/\s+/g, " ").slice(0, 81);
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 120);
    const phone = String(body?.phone || "").trim().slice(0, 24);

    if (name.length < 2 || name.length > 80) {
      return json({ ok: false, error: "Enter your name" }, 400);
    }
    if (!EMAIL_RE.test(email)) {
      return json({ ok: false, error: "Enter a valid email" }, 400);
    }
    const digits = digitsOnly(phone);
    if (digits.length < 10 || digits.length > 15) {
      return json({ ok: false, error: "Enter a valid phone number" }, 400);
    }

    const result = await storeLead({ name, email, phone, at: new Date().toISOString() });
    if (result === "full") {
      return json({ ok: false, error: "Registrations are temporarily unavailable" }, 503);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Early-access registration failed", error);
    return json({ ok: false, error: "Could not submit. Try again." }, 500);
  }
}
