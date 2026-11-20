import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { providerKey, routerClient } from "@/lib/server/ai/service";
import { isCrossSite } from "@/lib/server/same-site";
import { langOf } from "@/lib/sommelier/prompt";
import {
  PROFILE_SYSTEM,
  parseProfile,
  profilePrompt,
} from "@/lib/sommelier/profile";

/**
 * The wine sheet of one wine for the guest page: the kept one, or written
 * now by Claude (once per wine and language, capped per business/day).
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  t: z
    .string()
    .min(20)
    .max(80)
    .regex(/^[a-f0-9]+$/),
  id: z.string().min(1).max(200),
  lang: z.string().max(8),
});

const TIMEOUT_MS = 45_000;
const EFFORT_MODELS = /^claude-(fable|mythos|opus|sonnet|haiku)-5/;

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const lang = langOf(parsed.data.lang);
  try {
    const c = await routerClient();
    const job = await c.mutation(api.sommelier.profileJob, {
      token: parsed.data.t,
      wineId: parsed.data.id,
      lang: lang.code,
    });
    if (!job.ok) {
      return NextResponse.json({ error: job.reason }, { status: 404 });
    }
    if ("profile" in job && job.profile) {
      return NextResponse.json({ profile: job.profile });
    }
    if (!("wine" in job)) {
      return NextResponse.json({ error: "unknown" }, { status: 404 });
    }
    const saved = await providerKey("anthropic").catch(() => null);
    const key = saved?.key ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "closed" }, { status: 503 });
    }
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const msg = await client.messages.create(
      {
        model: job.model,
        max_tokens: 2500,
        ...(EFFORT_MODELS.test(job.model)
          ? { output_config: { effort: "low" as const } }
          : {}),
        system: PROFILE_SYSTEM,
        messages: [
          { role: "user", content: profilePrompt(job.wine, lang.name) },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    const answer = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const profile = parseProfile(answer);
    if (!profile) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    const kept = await c.mutation(api.sommelier.saveProfile, {
      company: job.company,
      wineId: parsed.data.id,
      lang: lang.code,
      profile,
      model: msg.model,
    });
    return NextResponse.json({ profile: kept ?? profile });
  } catch (err) {
    console.error("[sommelier profile]", err);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
