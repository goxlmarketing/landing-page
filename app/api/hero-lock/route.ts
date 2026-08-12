import { writeFile, readFile } from "fs/promises";
import path from "path";

const filePath = () => path.join(process.cwd(), "public", "hero-lock.json");

function assertDevWriteAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCK_WRITE !== "1") {
    return Response.json(
      { ok: false, error: "Lock writes disabled in production" },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = assertDevWriteAllowed();
  if (blocked) return blocked;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    // Cap payload size roughly via serialized length
    const raw = JSON.stringify(body);
    if (raw.length > 100_000) {
      return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }
    await writeFile(filePath(), JSON.stringify(body, null, 2), "utf8");
    return Response.json({ ok: true, path: "/hero-lock.json" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await readFile(filePath(), "utf8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json({ ok: false, error: "No lock file" }, { status: 404 });
  }
}
