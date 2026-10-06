import type { NextRequest } from "next/server";
import { readIcon, readSettingsSafe } from "@/lib/server/settings-store";
import { ICON_SIZES, type IconSize } from "@/lib/settings-types";

export const dynamic = "force-dynamic";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * App icon used by the Home Screen (apple-touch-icon), the manifest and the
 * header: the uploaded one when there is one, else the bundled default.
 */
export async function GET(request: NextRequest) {
  const asked = Number(request.nextUrl.searchParams.get("size"));
  const size: IconSize = ICON_SIZES.includes(asked as IconSize)
    ? (asked as IconSize)
    : 512;
  const settings = await readSettingsSafe();
  const stream = settings?.icon
    ? await readIcon(settings.icon, size).catch(() => null)
    : null;
  if (!stream) {
    return Response.redirect(
      new URL(`${base}/icons/icon-${size}.png`, request.url),
      307
    );
  }
  return new Response(stream, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, must-revalidate",
    },
  });
}
