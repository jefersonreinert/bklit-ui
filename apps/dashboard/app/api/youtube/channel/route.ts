import type { NextRequest } from "next/server";
import {
  channelInfo,
  channelPlaylists,
  playlistDetails,
} from "@/lib/server/youtube";
import { ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";

/** GET ?id=UC… | ?handle=@… → channel, its playlists and recent uploads */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const id = p.get("id") ?? undefined;
  const handle = p.get("handle") ?? undefined;
  if (!(id || handle)) {
    return Response.json({ error: "missing_channel" }, { status: 400 });
  }
  return ytRoute(request, async () => {
    const channel = await channelInfo({ id, handle });
    const [playlists, uploads] = await Promise.all([
      channelPlaylists(channel.id),
      channel.uploadsPlaylistId
        ? playlistDetails(channel.uploadsPlaylistId, 24)
        : null,
    ]);
    return {
      channel,
      playlists: playlists.playlists,
      recent: uploads?.videos ?? [],
    };
  });
}
