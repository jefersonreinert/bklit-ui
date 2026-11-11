import Anthropic from "@anthropic-ai/sdk";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  forSpeech,
  instructions,
  langOf,
  OPENAI_VOICES,
  turnContext,
} from "@/lib/sommelier/prompt";
import { providerKey, routerClient } from "./ai/service";

/**
 * Server side of the AI sommelier: one guest turn streamed from Claude
 * (the Anthropic key of Settings → AI Providers), and the optional
 * OpenAI voice. Limits and the log live in convex/sommelier.ts.
 */

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Models that take the server-side refusal fallback ("default" routing). */
const FALLBACK_MODELS = /^claude-(fable-5|opus-5|sonnet-5-5)/;
const EFFORT_MODELS = /^claude-(fable|mythos|opus|sonnet|haiku)-5/;
const TIMEOUT_MS = 60_000;

export class SommelierError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const LIMITS: Record<string, string> = {
  closed: "This sommelier is not available right now.",
  guest: "You have asked a lot today! Please ask our staff for more help.",
  network: "Too many questions from this network today. Please ask our staff.",
  venue: "The sommelier is resting for today. Please ask our staff.",
};

/** Alternating turns that start with the guest, newest last. */
export function cleanTurns(turns: Turn[], max = 12): Turn[] {
  const out: Turn[] = [];
  for (const t of turns.slice(-max)) {
    const content = t.content.trim();
    if (!content) {
      continue;
    }
    const last = out.at(-1);
    if (last && last.role === t.role) {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role: t.role, content });
    }
  }
  while (out[0]?.role === "assistant") {
    out.shift();
  }
  return out;
}

const SORRY =
  "Sorry, I lost my train of thought for a moment. Could you ask me again?";

/**
 * Streams the sommelier's answer as plain text. The question is logged
 * (and the limits checked) before Claude is called; the answer and the
 * token usage are saved when the stream ends.
 */
export async function chat(input: {
  token: string;
  sid: string;
  ip: string;
  lang: string;
  turns: Turn[];
}): Promise<ReadableStream<Uint8Array>> {
  const turns = cleanTurns(input.turns);
  const question = turns.at(-1);
  if (!question || question.role !== "user") {
    throw new SommelierError(400, "Empty question.");
  }
  const c = await routerClient();
  // The key of Settings → AI Providers, else the app's own Claude key
  const saved = await providerKey("anthropic").catch(() => null);
  const envKey = process.env.ANTHROPIC_API_KEY;
  const anthropic = saved ?? (envKey ? { key: envKey } : null);
  if (!anthropic) {
    throw new SommelierError(503, LIMITS.closed as string);
  }
  const lang = langOf(input.lang);
  const started = await c.mutation(api.sommelier.begin, {
    token: input.token,
    sid: input.sid,
    ip: input.ip,
    lang: lang.code,
    question: question.content,
  });
  if (!started.ok) {
    throw new SommelierError(
      started.reason === "closed" ? 404 : 429,
      LIMITS[started.reason] ?? (LIMITS.closed as string)
    );
  }

  const model = started.model;
  const client = new Anthropic({ apiKey: anthropic.key, maxRetries: 0 });
  const encoder = new TextEncoder();
  const t0 = Date.now();
  const finish = (args: {
    ok: boolean;
    answer: string;
    model?: string;
    inTokens?: number;
    outTokens?: number;
    cacheRead?: number;
    error?: string;
  }) =>
    c
      .mutation(api.sommelier.finish, {
        id: started.id as Id<"sommelierChats">,
        ms: Date.now() - t0,
        ...args,
      })
      .catch((err) => console.error("[sommelier] log failed", err));

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      const write = (text: string) => {
        answer += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: 4000,
            ...(EFFORT_MODELS.test(model)
              ? { output_config: { effort: "low" as const } }
              : {}),
            ...(FALLBACK_MODELS.test(model)
              ? {
                  betas: ["server-side-fallback-2026-07-01"],
                  fallbacks: "default" as const,
                }
              : {}),
            system: [
              { type: "text", text: instructions(started.venue, started.notes) },
              {
                type: "text",
                text: started.catalog,
                // Instructions + wine list are the same for every guest
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: turnContext(lang.name, new Date()) },
            ],
            messages: turns,
          },
          { signal: AbortSignal.timeout(TIMEOUT_MS) }
        );
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            write(event.delta.text);
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !answer.trim()) {
          write("I'd rather keep our talk about wine. What would you like to taste?");
        }
        await finish({
          ok: true,
          answer,
          model: final.model,
          inTokens:
            final.usage.input_tokens +
            (final.usage.cache_creation_input_tokens ?? 0) +
            (final.usage.cache_read_input_tokens ?? 0),
          outTokens: final.usage.output_tokens,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
        });
      } catch (err) {
        console.error("[sommelier] claude failed", err);
        if (!answer.trim()) {
          write(SORRY);
        }
        await finish({
          ok: false,
          answer,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * A natural voice for one piece of an answer (OpenAI gpt-4o-mini-tts),
 * when the business picked it and an OpenAI key is set. null: the page
 * uses the phone's own voice.
 */
export async function speech(input: {
  token: string;
  sid: string;
  ip: string;
  text: string;
  lang: string;
}): Promise<Response | null> {
  const text = forSpeech(input.text).slice(0, 800);
  if (!text) {
    return null;
  }
  const c = await routerClient();
  const allowed = await c.mutation(api.sommelier.speech, {
    token: input.token,
    sid: input.sid,
    ip: input.ip,
  });
  if (!allowed.ok) {
    return null;
  }
  const openai = await providerKey("openai");
  if (!openai) {
    return null;
  }
  const voice = (OPENAI_VOICES as readonly string[]).includes(allowed.voice)
    ? allowed.voice
    : "sage";
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openai.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
      instructions: `Speak ${langOf(input.lang).name} like a warm, relaxed sommelier talking to a guest at a wine bar: natural pace, friendly, a little smile in the voice.`,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!(res?.ok && res.body)) {
    console.error("[sommelier] voice failed", res?.status);
    return null;
  }
  return new Response(res.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}
