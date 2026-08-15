import { writeFile, readFile } from "fs/promises";
import path from "path";
import { apiJson, assertDevWriteAllowed, readJsonBody } from "../_dev-write-security";

const filePath = () => path.join(process.cwd(), "public", "hero-lock.json");
const MAX_PAYLOAD_BYTES = 100_000;

export async function POST(request: Request) {
  const blocked = assertDevWriteAllowed(request, MAX_PAYLOAD_BYTES);
  if (blocked) return blocked;

  try {
    const parsed = await readJsonBody(request, MAX_PAYLOAD_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!body || typeof body !== "object") {
      return apiJson({ ok: false, error: "Invalid payload" }, 400);
    }
    await writeFile(filePath(), JSON.stringify(body, null, 2), "utf8");
    return apiJson({ ok: true, path: "/hero-lock.json" });
  } catch (error) {
    console.error("Hero lock save failed", error);
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
