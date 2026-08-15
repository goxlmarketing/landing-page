import { writeFile, readFile } from "fs/promises";
import path from "path";
import { apiJson, assertDevWriteAllowed, readJsonBody } from "../_dev-write-security";

const filePath = () => path.join(process.cwd(), "public", "sb-logo-lock.json");
const MAX_PAYLOAD_BYTES = 4_000;

function isValidPos(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= -240 &&
    x <= 240 &&
    y >= -240 &&
    y <= 240
  );
}

export async function POST(request: Request) {
  const blocked = assertDevWriteAllowed(request, MAX_PAYLOAD_BYTES);
  if (blocked) return blocked;

  try {
    const parsed = await readJsonBody(request, MAX_PAYLOAD_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!isValidPos(body)) {
      return apiJson({ ok: false, error: "Invalid position" }, 400);
    }

    const safe = {
      x: Math.round(body.x * 10) / 10,
      y: Math.round(body.y * 10) / 10,
      savedAt: new Date().toISOString(),
    };
    await writeFile(filePath(), JSON.stringify(safe, null, 2), "utf8");
    return apiJson({ ok: true, path: "/sb-logo-lock.json", ...safe });
  } catch (error) {
    console.error("Sidebar logo lock save failed", error);
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
