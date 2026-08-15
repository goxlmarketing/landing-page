const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
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

export function assertDevWriteAllowed(request: Request, maxBytes: number) {
  if (process.env.NODE_ENV === "production") {
    return apiJson({ ok: false, error: "Lock writes disabled in production" }, 403);
  }
  if (!isSameOriginRequest(request)) {
    return apiJson({ ok: false, error: "Request not allowed" }, 403);
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return apiJson({ ok: false, error: "JSON request required" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return apiJson({ ok: false, error: "Payload too large" }, 413);
  }
  return null;
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false as const, response: apiJson({ ok: false, error: "Payload too large" }, 413) };
  }
  try {
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const, response: apiJson({ ok: false, error: "Invalid JSON" }, 400) };
  }
}
