import type { NextRequest } from "next/server";
import { transcribeVideo } from "@/lib/server/transcript";
import { isVideoId, ytRoute } from "@/lib/server/youtube-route";

export const dynamic = "force-dynamic";
// Long videos take a while to transcribe
export const maxDuration = 300;

/** POST { id } → YtTranscript */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
  } | null;
  const id = body?.id ?? null;
  if (!isVideoId(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  return ytRoute(request, () => transcribeVideo(id));
}
