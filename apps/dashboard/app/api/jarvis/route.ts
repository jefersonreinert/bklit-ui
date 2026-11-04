import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { groqJson } from "@/lib/server/groq-json";
import { convexUrl } from "@/lib/server/panel-jwt";

/**
 * "Jarvis" for the iPhone Shortcut ("E aí Siri, Jarvis"): the Shortcut
 * posts what was dictated with the Jarvis token; this answers with a short
 * text for Siri to speak and, when the request needs the app (doing
 * something on screen), a link that opens the app agent with it.
 * Answers come from a read-only digest of the businesses in Convex.
 */

export const dynamic = "force-dynamic";

const BEARER = /^Bearer\s+/i;

const Reply = z.object({
  speak: z.string(),
  action: z.string().nullable(),
});
type Reply = z.infer<typeof Reply>;

const SCHEMA = {
  type: "object",
  properties: {
    speak: { type: "string" },
    action: { type: ["string", "null"] },
  },
  required: ["speak", "action"],
  additionalProperties: false,
};

function prompt(question: string, data: unknown) {
  return [
    'You are "Jarvis", the voice assistant of the owner of a group of restaurants and bars in Malta (Casa Brasa POS; Vinomad is the wine bar with automatic wine machines). He talks to you through Siri on his earphones, often while walking or working.',
    `He said: ${JSON.stringify(question)}`,
    "",
    "Live data of the businesses (JSON; money in each business currency; times in Malta):",
    JSON.stringify(data),
    "",
    "Answer as JSON:",
    '- speak: what Siri will say aloud, in Brazilian Portuguese, natural and short (1 to 3 sentences, no lists, no markdown, no emojis; say amounts like "cento e vinte euros" style numbers are fine as digits). Answer from the data; if the data does not have it, say so briefly.',
    '- action: null when speaking is enough. When he asks to DO something in the app (open a page, create or change an order, product, price, message, etc.) or to see something on screen, put here the request for the app agent, in Portuguese, complete and self-contained (e.g. "Abra o Wine Monitor do Vinomad e mostre as garrafas acabando"); then speak says briefly that you are opening the app to do it.',
    "Never invent numbers. Never reveal tokens or PINs.",
  ].join("\n");
}

async function withClaude(text: string): Promise<Reply> {
  const response = await new Anthropic().messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 800,
    output_config: { effort: "low", format: zodOutputFormat(Reply) },
    messages: [{ role: "user", content: text }],
  });
  if (!response.parsed_output) {
    throw new Error("unparsable");
  }
  return response.parsed_output;
}

let claudeDownUntil = 0;

async function answer(text: string): Promise<Reply> {
  if (process.env.ANTHROPIC_API_KEY && Date.now() > claudeDownUntil) {
    try {
      return await withClaude(text);
    } catch {
      claudeDownUntil = Date.now() + 10 * 60_000;
    }
  }
  return Reply.parse(await groqJson<Reply>([], text, SCHEMA));
}

const say = (speak: string, status = 200, open: string | null = null) =>
  NextResponse.json(
    { speak, open },
    { status, headers: { "Cache-Control": "no-store" } }
  );

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 8000) {
    return say("O pedido ficou grande demais.", 413);
  }
  let body: { q?: string; token?: string } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // a plain-text body is the question itself
    body = { q: raw };
  }
  const token = (
    request.headers.get("x-jarvis-token") ??
    request.headers.get("authorization")?.replace(BEARER, "") ??
    body.token ??
    ""
  ).trim();
  const question = (body.q ?? "").trim().slice(0, 1000);
  const url = convexUrl();
  if (!(token && url)) {
    return say("Jarvis não está configurado.", 401);
  }
  if (!question) {
    return say("Não ouvi nenhum pedido.", 400);
  }
  let data: unknown;
  try {
    data = await new ConvexHttpClient(url).query(api.jarvis.context, {
      token,
    });
  } catch {
    return say("Não consegui ler os dados do app agora.", 502);
  }
  if (!data) {
    return say("A chave do Jarvis não confere.", 401);
  }
  try {
    const reply = await answer(prompt(question, data));
    const open = reply.action
      ? `${request.nextUrl.origin}/?agente=${encodeURIComponent(reply.action.slice(0, 1000))}`
      : null;
    return say(reply.speak, 200, open);
  } catch {
    return say("Estou sem acesso à inteligência agora. Tente de novo.", 502);
  }
}
