import type { NextRequest } from "next/server";
import { googleSession } from "@/lib/server/google-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";
import { playlistDetails, YoutubeError } from "@/lib/server/youtube";
import { ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";

/**
 * GET ?id=<playlistId> → YtPlaylist (videos, durations, total).
 * Private playlists ("Assistir mais tarde", your own) are read with the
 * user's Google login when the public lookup does not find them.
 */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
  return ytRoute(request, async () => {
    try {
      return await playlistDetails(id);
    } catch (error) {
      const session = connectorsSecret() ? await googleSession(request) : null;
      if (
        error instanceof YoutubeError &&
        error.status === 404 &&
        session?.status === "ok" &&
        session.youtube
      ) {
        return playlistDetails(id, undefined, session.token);
      }
      throw error;
    }
  });
}
