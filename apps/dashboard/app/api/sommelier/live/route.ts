import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isCrossSite } from "@/lib/server/same-site";
import { LiveUnavailable, startLive } from "@/lib/server/sommelier-live";
import { guestIp } from "../guest";

/**
 * Starts a live voice conversation (GPT-Live over WebRTC): takes the
 * phone's SDP offer, returns OpenAI's answer. 204 = live voice is not
 * available (not chosen, no key, limit): the page uses tap-to-talk.
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  t: z.string().min(20).max(80).regex(/^[a-f0-9]+$/),
  sid: z.string().min(8).max(64).regex(/^[\w-]+$/),
  lang: z.string().max(8),
  greeting: z.string().max(400).default(""),
  sdp: z.string().min(10).max(60_000),
});

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { t, sid, lang, sdp, greeting } = parsed.data;
  try {
    const live = await startLive({
      token: t,
      sid,
      lang,
      sdp,
      greeting,
      ip: await guestIp(request),
    });
    return NextResponse.json(live, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (!(err instanceof LiveUnavailable)) {
      console.error("[sommelier] live", err);
    }
    return new Response(null, { status: 204 });
  }
}
