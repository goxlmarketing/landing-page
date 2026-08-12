import { writeFile, readFile } from "fs/promises";
import path from "path";

const filePath = () => path.join(process.cwd(), "public", "float-q-lock.json");

function assertDevWriteAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCK_WRITE !== "1") {
    return Response.json(
      { ok: false, error: "Lock writes disabled in production" },
      { status: 403 },
    );
  }
  return null;
}

function isValidPositions(body: unknown): body is { positions: Record<string, { top: number; left: number }> } {
  if (!body || typeof body !== "object") return false;
  const positions = (body as { positions?: unknown }).positions;
  if (!positions || typeof positions !== "object") return false;
  return Object.values(positions).every((p) => {
    if (!p || typeof p !== "object") return false;
    const { top, left } = p as { top?: unknown; left?: unknown };
    return typeof top === "number" && typeof left === "number" && Number.isFinite(top) && Number.isFinite(left);
  });
}

export async function POST(request: Request) {
  const blocked = assertDevWriteAllowed();
  if (blocked) return blocked;

  try {
    const body = await request.json();
    if (!isValidPositions(body)) {
      return Response.json({ ok: false, error: "Invalid positions payload" }, { status: 400 });
    }
    const safe = {
      positions: body.positions,
      savedAt: new Date().toISOString(),
      baked: true,
    };
    await writeFile(filePath(), JSON.stringify(safe, null, 2), "utf8");
    return Response.json({ ok: true, path: "/float-q-lock.json" });
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
