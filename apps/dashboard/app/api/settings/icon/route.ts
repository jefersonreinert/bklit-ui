import type { NextRequest } from "next/server";
import { DEFAULT_PREFERENCES } from "@/lib/preferences-fonts";
import { isCrossSite } from "@/lib/server/same-site";
import {
  readSettingsSafe,
  removeIcons,
  storeAvailable,
  writeIcon,
  writeSettings,
} from "@/lib/server/settings-store";
import { ICON_SIZES, type IconSize } from "@/lib/settings-types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (bytes: Uint8Array) =>
  PNG_SIGNATURE.every((b, i) => bytes[i] === b);

function guard(request: NextRequest) {
  if (isCrossSite(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!storeAvailable()) {
    return Response.json({ error: "store_unavailable" }, { status: 503 });
  }
  return null;
}

/** Decodes `{ "180": base64png, "192": …, "512": … }`; null when invalid. */
function decodeIcons(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }
  const files = {} as Record<IconSize, Uint8Array>;
  for (const size of ICON_SIZES) {
    const value = (body as Record<string, unknown>)[size];
    if (typeof value !== "string" || value.length > MAX_BYTES * 1.4) {
      return null;
    }
    const bytes = Buffer.from(value, "base64");
    if (!isPng(bytes)) {
      return null;
    }
    files[size] = bytes;
  }
  return files;
}

async function saveIcon(icon: string | undefined) {
  const current = (await readSettingsSafe()) ?? {
    ...DEFAULT_PREFERENCES,
    updatedAt: 0,
  };
  return await writeSettings({ ...current, icon, updatedAt: Date.now() });
}

/** Uploads a new app icon (the browser sends ready-made square PNGs). */
export async function POST(request: NextRequest) {
  const blocked = guard(request);
  if (blocked) {
    return blocked;
  }
  let files: Record<IconSize, Uint8Array> | null = null;
  try {
    files = decodeIcons(await request.json());
  } catch {
    files = null;
  }
  if (!files) {
    return Response.json({ error: "invalid_icon" }, { status: 400 });
  }
  try {
    const version = await writeIcon(files);
    return Response.json({ settings: await saveIcon(version) });
  } catch {
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}

/** Back to the default icon. */
export async function DELETE(request: NextRequest) {
  const blocked = guard(request);
  if (blocked) {
    return blocked;
  }
  try {
    await removeIcons();
    return Response.json({ settings: await saveIcon(undefined) });
  } catch {
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}
