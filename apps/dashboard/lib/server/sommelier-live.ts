import { api } from "@/convex/_generated/api";
import { langOf } from "@/lib/sommelier/prompt";
import { providerKey, routerClient } from "./ai/service";

/**
 * Live voice conversation for the AI sommelier: GPT-Live (OpenAI) does
 * the talking over WebRTC (listens, speaks, can be interrupted), and every
 * wine question is delegated to the page, which asks Claude (the wine
 * list and house notes live there) and hands the answer back to speak.
 *
 * The server only exchanges the browser's SDP offer for an answer, so
 * the OpenAI key never reaches the phone.
 */

export const LIVE_MODEL = "gpt-live-1";
/** GPT-Live voices that read well in every language we offer. */
const LIVE_VOICES = new Set(["marin", "cedar"]);

export function liveInstructions(venue: string, langName: string) {
  return `You are the sommelier of ${venue}, a wine bar in Malta, talking by voice with a guest on their phone at the bar. Guests pour wine themselves from self-service dispensers (taster, glass or large glass) or order bottles.

Speak warmly and naturally, like a relaxed, knowledgeable sommelier: no lists, never read out symbols or prices digit by digit. Be short and spot-on: one or two sentences per answer, only the most valuable and interesting point, no filler, no repeating the question, no small talk unless the guest starts it. Start in ${langName}; if the guest speaks another language, switch to it.

Backchannel policy: Use light backchannels. Let the guest finish describing what they like.

Interruption policy: Stop speaking when the guest interrupts. Listen to what they say.

Delegation policy:
Backend tools:
- Sommelier notes: the venue's full wine list (what is on the dispensers, prices, grapes, regions, tasting notes, stories) and food menu, with expert recommendations, pairings and tasting flights.

Generate <|SpawnThinking|> when:
- The guest asks for a recommendation, a pairing, a tasting flight or a comparison.
- The guest asks about a wine, grape, region, price, the food or what is available.
- A correction or new preference changes a recommendation already given.

Do not generate <|SpawnThinking|> when:
- The guest greets you, thanks you or makes small talk.
- You need a brief clarification first (for example red or white).
- The guest asks you to repeat what you just said.

Generate <|SpawnThinking|> before giving an answer that depends on the wine list. Never name a wine, price or dish that did not come from the sommelier notes, and do not guess while waiting: a short natural line like "let me think" is fine. When the notes arrive, say them briefly in your own words without adding anything, keeping wine names and prices exact.`;
}

export class LiveUnavailable extends Error {}

export async function startLive(input: {
  token: string;
  sid: string;
  ip: string;
  lang: string;
  sdp: string;
  greeting: string;
}): Promise<{ sdp: string; id: string }> {
  const c = await routerClient();
  const allowed = await c.mutation(api.sommelier.live, {
    token: input.token,
    sid: input.sid,
    ip: input.ip,
  });
  if (!allowed.ok) {
    throw new LiveUnavailable(allowed.reason);
  }
  const openai = await providerKey("openai");
  if (!openai) {
    throw new LiveUnavailable("no key");
  }
  const lang = langOf(input.lang).name;
  const greet = `Greet the guest now in ${lang}${input.greeting ? `, in your own words, along the lines of: "${input.greeting.slice(0, 300)}"` : ": welcome them and ask what they feel like drinking today"}. Keep it to one or two short sentences, then pause and listen.`;
  const res = await fetch("https://api.openai.com/v1/live/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openai.key}`,
      "content-type": "application/json",
      "openai-safety-identifier": await hash(input.sid),
    },
    body: JSON.stringify({
      session: {
        model: LIVE_MODEL,
        instructions: liveInstructions(allowed.name, lang),
        audio: {
          output: {
            voice: LIVE_VOICES.has(allowed.voice) ? allowed.voice : "marin",
          },
        },
        delegation: { type: "client" },
        input: [
          {
            type: "message",
            role: "developer",
            content: [{ type: "input_text", text: greet }],
          },
        ],
      },
      transport: { type: "webrtc", sdp: input.sdp },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    console.error("[sommelier] live session failed", res.status, detail);
    throw new Error(`live ${res.status}`);
  }
  const body = (await res.json()) as {
    session?: { id?: string };
    transport?: { sdp?: string };
  };
  if (!body.transport?.sdp) {
    throw new Error("live: no SDP answer");
  }
  return { sdp: body.transport.sdp, id: body.session?.id ?? "" };
}

async function hash(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sommelier:${text}`)
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
