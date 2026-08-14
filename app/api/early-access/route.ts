import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const filePath = () => path.join(process.cwd(), "data", "early-access.json");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

type Lead = { email: string; phone: string; at: string };

async function loadLeads(): Promise<Lead[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 120);
    const phone = String(body?.phone || "")
      .trim()
      .slice(0, 24);

    if (!EMAIL_RE.test(email)) {
      return Response.json({ ok: false, error: "Enter a valid email" }, { status: 400 });
    }
    const digits = digitsOnly(phone);
    if (digits.length < 10 || digits.length > 15) {
      return Response.json({ ok: false, error: "Enter a valid phone number" }, { status: 400 });
    }

    await mkdir(path.dirname(filePath()), { recursive: true });
    const leads = await loadLeads();
    if (!leads.some((lead) => lead.email === email)) {
      leads.push({ email, phone, at: new Date().toISOString() });
      await writeFile(filePath(), JSON.stringify(leads, null, 2), "utf8");
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
