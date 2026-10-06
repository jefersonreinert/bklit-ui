import type { NextRequest } from "next/server";
import { DEFAULT_PREFERENCES } from "@/lib/preferences-fonts";
import { isCrossSite } from "@/lib/server/same-site";
import {
  readSettingsSafe,
  removeImages,
  storeAvailable,
  writeImage,
  writeSettings,
} from "@/lib/server/settings-store";
import { IMAGE_SIZES, type ImageKind } from "@/lib/settings-types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ kind: string }>;
}

const MAX_BYTES = 1_500_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (bytes: Uint8Array) =>
  PNG_SIGNATURE.every((b, i) => bytes[i] === b);

const isKind = (k: string): k is ImageKind => k in IMAGE_SIZES;

/** Kind from the URL, or an error response. */
async function guard(request: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (isCrossSite(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isKind(kind)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!storeAvailable()) {
    return Response.json({ error: "store_unavailable" }, { status: 503 });
  }
  return kind;
}

/** Decodes `{ "<size>": base64png, … }` for every size; null when invalid. */
function decode(kind: ImageKind, body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }
  const files: Record<number, Uint8Array> = {};
  for (const size of IMAGE_SIZES[kind]) {
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

async function record(kind: ImageKind, version: string | undefined) {
  const current = (await readSettingsSafe()) ?? {
    ...DEFAULT_PREFERENCES,
    updatedAt: 0,
  };
  return await writeSettings({
    ...current,
    [kind]: version,
    updatedAt: Date.now(),
  });
}

/** Uploads the image (the browser sends ready-made square PNGs). */
export async function POST(request: NextRequest, ctx: Ctx) {
  const kind = await guard(request, ctx);
  if (kind instanceof Response) {
    return kind;
  }
  let files: Record<number, Uint8Array> | null = null;
  try {
    files = decode(kind, await request.json());
  } catch {
    files = null;
  }
  if (!files) {
    return Response.json({ error: "invalid_image" }, { status: 400 });
  }
  try {
    const version = await writeImage(kind, files);
    return Response.json({ settings: await record(kind, version) });
  } catch {
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}

/** Removes the image (back to the default icon / initials). */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const kind = await guard(request, ctx);
  if (kind instanceof Response) {
    return kind;
  }
  try {
    await removeImages(kind);
    return Response.json({ settings: await record(kind, undefined) });
  } catch {
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}
