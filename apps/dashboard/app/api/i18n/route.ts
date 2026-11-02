import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { groqJson } from "@/lib/server/groq-json";
import { convexUrl, signPanelToken } from "@/lib/server/panel-jwt";
import { isCrossSite } from "@/lib/server/same-site";

/**
 * Translates interface texts of the app (written in Portuguese) into any
 * language and keeps them in Convex (i18n.save), so each language is
 * translated once for every device.
 */

export const dynamic = "force-dynamic";

const MAX_TEXTS = 150;
const MAX_CHARS = 20_000;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const Result = z.object({
  items: z.array(z.object({ n: z.number().int(), text: z.string() })),
});

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, text: { type: "string" } },
        required: ["n", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function prompt(language: string, texts: string[]) {
  return [
    `Translate these user-interface texts of a restaurant, bar and trading management app (point of sale, staff rota, wine list, finances, charts, AI assistant) into ${language}. Most are in Brazilian Portuguese; a few are already in English.`,
    "Keep them short like buttons, labels and help lines, in the natural tone of a professional app. Some are fragments of a sentence: translate them so they still fit between the surrounding words, keeping leading or trailing punctuation such as ·, :, … or —.",
    "Keep placeholders such as {n} or {name}, product and brand names, people's names, ticker symbols, code, currency symbols and numbers unchanged. If a text needs no translation, repeat it.",
    "Answer with every item, using the same n.",
    "",
    JSON.stringify(texts.map((text, n) => ({ n, text }))),
  ].join("\n");
}

async function withClaude(language: string, texts: string[]) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 32_000,
    output_config: { effort: "low", format: zodOutputFormat(Result) },
    messages: [{ role: "user", content: prompt(language, texts) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("translation refused or unparsable");
  }
  return response.parsed_output.items;
}

async function withGroq(language: string, texts: string[]) {
  const out = await groqJson<z.infer<typeof Result>>(
    [],
    prompt(language, texts),
    SCHEMA
  );
  return out.items;
}

async function translate(language: string, texts: string[]) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await withClaude(language, texts);
    } catch {
      // credits, rate limit or refusal: Groq below
    }
  }
  return await withGroq(language, texts);
}

/** Saves to the shared cache; translating still works without it. */
async function keep(locale: string, pairs: string[][]) {
  const url = convexUrl();
  const signed = await signPanelToken("i18n");
  if (!(url && signed && pairs.length)) {
    return;
  }
  const client = new ConvexHttpClient(url);
  client.setAuth(signed.token);
  await client.mutation(api.i18n.save, { locale, pairs }).catch(() => null);
}

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    locale?: string;
    texts?: (string | { id: string })[];
  } | null;
  const locale = body?.locale ?? "";
  // Texts are the Portuguese keys (older clients sent { id, en })
  const keys = (Array.isArray(body?.texts) ? body.texts : [])
    .map((t) => (typeof t === "string" ? t : t?.id))
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  const size = keys.reduce((a, t) => a + t.length, 0);
  if (
    !LOCALE.test(locale) ||
    locale === "pt" ||
    keys.length === 0 ||
    keys.length > MAX_TEXTS ||
    size > MAX_CHARS
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  let language = locale;
  try {
    language = `${new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale} (${locale})`;
  } catch {
    // keep the code
  }
  let items: { n: number; text: string }[];
  try {
    items = await translate(language, keys);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  const translations: Record<string, string> = {};
  for (const item of items) {
    const key = keys[item.n];
    if (key && item.text.trim()) {
      translations[key] = item.text.trim();
    }
  }
  await keep(locale, Object.entries(translations));
  return NextResponse.json(
    { translations },
    { headers: { "Cache-Control": "no-store" } }
  );
}
