import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { groqJson } from "@/lib/server/groq-json";
import { isCrossSite } from "@/lib/server/same-site";

/**
 * Translates the app's interface texts (English source) into a language
 * without a reviewed dictionary. The browser keeps the result, so each
 * device asks once per language.
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
    `Translate these user-interface texts of a restaurant and bar management app (point of sale, staff rota, time clock, wine list) from English into ${language}.`,
    "Keep them short like buttons and labels. Keep placeholders such as {n} or {name} exactly as written, and keep product names, brand names, currency symbols and numbers unchanged.",
    "Answer with every item, using the same n.",
    "",
    JSON.stringify(texts.map((text, n) => ({ n, text }))),
  ].join("\n");
}

async function withClaude(language: string, texts: string[]) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16_000,
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

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    locale?: string;
    texts?: { id: string; en: string }[];
  } | null;
  const locale = body?.locale ?? "";
  const texts = Array.isArray(body?.texts) ? body.texts : [];
  const size = texts.reduce((a, t) => a + String(t.en).length, 0);
  if (
    !LOCALE.test(locale) ||
    texts.length === 0 ||
    texts.length > MAX_TEXTS ||
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
  const sources = texts.map((t) => String(t.en));
  let items: { n: number; text: string }[];
  try {
    items = process.env.ANTHROPIC_API_KEY
      ? await withClaude(language, sources)
      : await withGroq(language, sources);
  } catch {
    try {
      items = await withGroq(language, sources);
    } catch {
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }
  }
  const translations: Record<string, string> = {};
  for (const item of items) {
    const source = texts[item.n];
    if (source && item.text.trim()) {
      translations[source.id] = item.text.trim();
    }
  }
  return NextResponse.json(
    { translations },
    { headers: { "Cache-Control": "no-store" } }
  );
}
