import type { NextRequest } from "next/server";
import { TranscriptError } from "./transcript";
import { YoutubeError } from "./youtube";

/**
 * JSON wrapper for the YouTube routes. They spend the server's API quota,
 * so requests made by other websites (cross-site fetches) are refused.
 */
export async function ytRoute(
  request: NextRequest,
  handler: () => Promise<unknown>
) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return Response.json(await handler(), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const status =
      error instanceof YoutubeError || error instanceof TranscriptError
        ? error.status
        : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "failed" },
      { status }
    );
  }
}

const VIDEO_ID = /^[\w-]{11}$/;

export const isVideoId = (id: string | null): id is string =>
  Boolean(id && VIDEO_ID.test(id));
