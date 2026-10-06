import type { NextRequest } from "next/server";
import { readImage, readSettingsSafe } from "@/lib/server/settings-store";
import { IMAGE_SIZES, type ImageKind } from "@/lib/settings-types";

export const dynamic = "force-dynamic";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Uploaded images: /api/brand/icon (Home Screen, manifest, header — falls
 * back to the bundled icon) and /api/brand/avatar (profile photo).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ kind: string }> }
) {
  const { kind } = await ctx.params;
  if (!(kind in IMAGE_SIZES)) {
    return new Response(null, { status: 404 });
  }
  const sizes = IMAGE_SIZES[kind as ImageKind];
  const asked = Number(request.nextUrl.searchParams.get("size"));
  const size = sizes.includes(asked) ? asked : (sizes[0] ?? 0);
  const settings = await readSettingsSafe();
  const version = settings?.[kind as ImageKind];
  const stream = version
    ? await readImage(kind as ImageKind, version, size).catch(() => null)
    : null;
  if (stream) {
    return new Response(stream, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60, must-revalidate",
      },
    });
  }
  if (kind === "icon") {
    const fallback = [180, 192, 512].includes(size) ? size : 512;
    return Response.redirect(
      new URL(`${base}/icons/icon-${fallback}.png`, request.url),
      307
    );
  }
  return new Response(null, { status: 404 });
}
