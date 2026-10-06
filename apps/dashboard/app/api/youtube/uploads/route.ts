import type { NextRequest } from "next/server";
import { uploadsPage } from "@/lib/server/youtube";
import { ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";

const UPLOADS = /^UU[\w-]{22}$/;

/** GET ?channelId=UC…&pageToken= → 50 uploads per page, newest first */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const channelId = p.get("channelId") ?? "";
  // A channel's uploads playlist is its id with "UC" replaced by "UU"
  const uploads = channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : "";
  if (!UPLOADS.test(uploads)) {
    return Response.json({ error: "invalid_channel" }, { status: 400 });
  }
  return ytRoute(request, () =>
    uploadsPage(uploads, p.get("pageToken") ?? undefined)
  );
}
