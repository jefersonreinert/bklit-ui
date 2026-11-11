import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isCrossSite } from "@/lib/server/same-site";
import { speech } from "@/lib/server/sommelier";
import { guestIp } from "../guest";

/**
 * Natural voice for a piece of the sommelier's answer. 204 = use the
 * phone's voice (browser voice chosen, no OpenAI key, or limit reached).
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  t: z.string().min(20).max(80).regex(/^[a-f0-9]+$/),
  sid: z.string().min(8).max(64).regex(/^[\w-]+$/),
  lang: z.string().max(8),
  text: z.string().min(1).max(800),
});

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { t, sid, lang, text } = parsed.data;
  const audio = await speech({ token: t, sid, lang, text, ip: await guestIp(request) }).catch((err) => {
    console.error("[sommelier] speech", err);
    return null;
  });
  return audio ?? new Response(null, { status: 204 });
}
