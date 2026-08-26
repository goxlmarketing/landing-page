import { writeFile, readFile } from "fs/promises";
import path from "path";
import { apiJson, assertDevWriteAllowed, readJsonBody } from "../_dev-write-security";

const filePath = () => path.join(process.cwd(), "public", "float-q-lock.json");
const MAX_PAYLOAD_BYTES = 20_000;
const ALLOWED_POSITION_IDS = new Set(["tl", "bl", "tr", "br"]);
const ALLOWED_VIEWPORTS = new Set(["desktop", "phone", "phone-landscape"]);

type PositionMap = Record<string, { top: number; left: number }>;

function isValidPositions(value: unknown): value is PositionMap {
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > ALLOWED_POSITION_IDS.size) return false;
  return entries.every(([id, p]) => {
    if (!ALLOWED_POSITION_IDS.has(id)) return false;
    if (!p || typeof p !== "object") return false;
    const { top, left } = p as { top?: unknown; left?: unknown };
    return typeof top === "number" && typeof left === "number" && Number.isFinite(top) && Number.isFinite(left) &&
      top >= -20 && top <= 120 && left >= -20 && left <= 120;
  });
}

export async function POST(request: Request) {
  const blocked = assertDevWriteAllowed(request, MAX_PAYLOAD_BYTES);
  if (blocked) return blocked;

  try {
    const parsed = await readJsonBody(request, MAX_PAYLOAD_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!body || typeof body !== "object" || !isValidPositions((body as { positions?: unknown }).positions)) {
      return apiJson({ ok: false, error: "Invalid positions payload" }, 400);
    }

    const viewport = (body as { viewport?: unknown }).viewport;
    if (typeof viewport !== "string" || !ALLOWED_VIEWPORTS.has(viewport)) {
      return apiJson({ ok: false, error: "Invalid viewport" }, 400);
    }

    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(filePath(), "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }

    const isPhone = viewport === "phone";
    const isPhoneLandscape = viewport === "phone-landscape";
    const isDesktop = viewport === "desktop";
    const now = new Date().toISOString();
    const incoming = (body as { positions: PositionMap }).positions;
    const safe = {
      positions: (isDesktop ? incoming : isValidPositions(existing.positions) ? existing.positions : incoming) as PositionMap,
      phonePositions: (isPhone ? incoming : isValidPositions(existing.phonePositions) ? existing.phonePositions : undefined) as
        | PositionMap
        | undefined,
      phoneLandscapePositions: (isPhoneLandscape
        ? incoming
        : isValidPositions(existing.phoneLandscapePositions)
          ? existing.phoneLandscapePositions
          : undefined) as PositionMap | undefined,
      savedAt: isDesktop ? now : typeof existing.savedAt === "string" ? existing.savedAt : now,
      phoneSavedAt: isPhone ? now : existing.phoneSavedAt,
      phoneLandscapeSavedAt: isPhoneLandscape ? now : existing.phoneLandscapeSavedAt,
      baked: true,
    };
    if (!safe.phonePositions) delete safe.phonePositions;
    if (!safe.phoneLandscapePositions) delete safe.phoneLandscapePositions;

    await writeFile(filePath(), JSON.stringify(safe, null, 2), "utf8");
    return apiJson({ ok: true, path: "/float-q-lock.json", viewport });
  } catch (error) {
    console.error("Floating-card lock save failed", error);
    return apiJson({ ok: false, error: "Failed to save" }, 500);
  }
}

export async function GET() {
  try {
    const raw = await readFile(filePath(), "utf8");
    return apiJson(JSON.parse(raw));
  } catch {
    return apiJson({ ok: false, error: "No lock file" }, 404);
  }
}
