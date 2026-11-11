import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isCrossSite } from "@/lib/server/same-site";
import { chat, SommelierError } from "@/lib/server/sommelier";
import { guestIp } from "./guest";

/**
 * The AI sommelier for guests (public: the link's secret is the access).
 * Streams the answer as plain text, so the page can speak it sentence by
 * sentence while it arrives.
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  t: z.string().min(20).max(80).regex(/^[a-f0-9]+$/),
  sid: z.string().min(8).max(64).regex(/^[\w-]+$/),
  lang: z.string().max(8),
  turns: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(30),
});

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const last = parsed.success ? parsed.data.turns.at(-1) : undefined;
  if (!(parsed.success && last?.role === "user" && last.content.length <= 600)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const body = await chat({
      token: parsed.data.t,
      sid: parsed.data.sid,
      ip: await guestIp(request),
      lang: parsed.data.lang,
      turns: parsed.data.turns,
    });
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof SommelierError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[sommelier]", err);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
