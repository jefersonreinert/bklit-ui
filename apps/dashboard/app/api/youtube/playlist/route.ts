import type { NextRequest } from "next/server";
import { playlistDetails } from "@/lib/server/youtube";
import { ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";

/** GET ?id=<playlistId> → YtPlaylist (videos, durations, total) */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
  return ytRoute(request, () => playlistDetails(id));
}
