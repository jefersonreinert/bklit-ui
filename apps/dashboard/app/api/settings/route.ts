import type { NextRequest } from "next/server";
import { FONTS } from "@/lib/preferences-fonts";
import { isCrossSite } from "@/lib/server/same-site";
import {
  readSettings,
  readSettingsSafe,
  storeAvailable,
  writeSettings,
} from "@/lib/server/settings-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Saved profile/look, or `settings: null` when nothing was saved yet. */
export async function GET() {
  try {
    return Response.json(
      { available: storeAvailable(), settings: await readSettings() },
      { headers: NO_STORE }
    );
  } catch {
    return Response.json(
      { error: "store_error" },
      { status: 502, headers: NO_STORE }
    );
  }
}

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Saves name, role and font; keeps the current icon. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!storeAvailable()) {
    return Response.json({ error: "store_unavailable" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = text(body.name, 60);
  const font = text(body.font, 40);
  if (!(name && FONTS.some((f) => f.id === font))) {
    return Response.json({ error: "invalid_settings" }, { status: 400 });
  }
  try {
    const current = await readSettingsSafe();
    const saved = await writeSettings({
      name,
      role: text(body.role, 60),
      font,
      icon: current?.icon,
      updatedAt: Date.now(),
    });
    return Response.json({ settings: saved }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}
