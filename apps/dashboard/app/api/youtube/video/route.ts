import type { NextRequest } from "next/server";
import { videoDetails } from "@/lib/server/youtube";
import { isVideoId, ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";

/** GET ?id=<videoId> → YtVideoDetails */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!isVideoId(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  return ytRoute(request, () => videoDetails(id));
}
