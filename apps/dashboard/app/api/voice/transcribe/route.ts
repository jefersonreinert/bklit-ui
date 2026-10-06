import type { NextRequest } from "next/server";
import { TranscriptError, transcribeAudio } from "@/lib/server/transcript";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ~3 MB of base64 ≈ 2 minutes of AAC — far above our 15-second clips. */
const MAX_BASE64 = 3_000_000;

/** POST { audio: base64, mimeType } → { text } */
export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    audio?: string;
    mimeType?: string;
  } | null;
  if (!(typeof body?.audio === "string" && body.audio.length > 0)) {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  if (body.audio.length > MAX_BASE64) {
    return Response.json({ error: "audio_too_long" }, { status: 413 });
  }
  try {
    const text = await transcribeAudio(
      body.audio,
      body.mimeType ?? "audio/mp4"
    );
    return Response.json({ text });
  } catch (error) {
    const status = error instanceof TranscriptError ? error.status : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "failed" },
      { status }
    );
  }
}
