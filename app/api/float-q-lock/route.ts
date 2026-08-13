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

type PositionMap = Record<string, { top: number; left: number }>;

function isValidPositions(value: unknown): value is PositionMap {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((p) => {
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
    if (!body || typeof body !== "object" || !isValidPositions((body as { positions?: unknown }).positions)) {
      return Response.json({ ok: false, error: "Invalid positions payload" }, { status: 400 });
    }

    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(filePath(), "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }

    const isPhone = (body as { viewport?: unknown }).viewport === "phone";
    const now = new Date().toISOString();
    const incoming = (body as { positions: PositionMap }).positions;
    const safe = {
      positions: (isPhone && isValidPositions(existing.positions) ? existing.positions : incoming) as PositionMap,
      phonePositions: (isPhone ? incoming : isValidPositions(existing.phonePositions) ? existing.phonePositions : undefined) as
        | PositionMap
        | undefined,
      savedAt: isPhone && typeof existing.savedAt === "string" ? existing.savedAt : now,
      phoneSavedAt: isPhone ? now : existing.phoneSavedAt,
      baked: true,
    };
    if (!safe.phonePositions) delete safe.phonePositions;

    await writeFile(filePath(), JSON.stringify(safe, null, 2), "utf8");
    return Response.json({ ok: true, path: "/float-q-lock.json", viewport: isPhone ? "phone" : "desktop" });
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
