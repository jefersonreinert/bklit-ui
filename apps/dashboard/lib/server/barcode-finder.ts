import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ConvexHttpClient } from "convex/browser";
import * as z from "zod/v4";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { validGtin } from "@/lib/inventory/gtin";
import { providerKey } from "./ai/service";
import { convexUrl } from "./panel-jwt";

/**
 * Finds the barcode (GTIN/EAN) of dispenser wines. Claude searches Open
 * Food Facts (a public barcode database, through our tool) and the web
 * (Anthropic's web search and fetch tools) for the exact wine and bottle
 * size, and reports each code with its source and how sure it is. Codes
 * with a wrong check digit are refused; a person accepts the rest.
 */

const MODEL = "claude-opus-5-5";
const MAX_WINES = 5;

export class FinderError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
    super(message);
  }
}

const SYSTEM = `You find the barcode (GTIN / EAN-13) of wines for the stock system of a wine bar in Malta. For each wine you get its name as written on the dispenser, the producer code, grape, origin, vintage and bottle size.

How to search:
- First off_search (Open Food Facts) with the producer and wine name; then web_search (retailer and producer pages, wine shops in Malta and the producer's country, distributor catalogues often print "EAN" or "barcode"); use web_fetch to read a promising page.
- The code must be for this exact wine AND bottle size (a 75 cl and a 1.5 l bottle have different codes; the vintage usually does not change it). Names on the dispenser are short or uppercase; the producer field may be the supplier's short code, not the winery.
- Never guess, complete or "fix" digits. If no page shows the code of this exact product, report it without a gtin.

Each wine also comes with the closest wines of the bar's stock catalog (catalogCandidates, written as the POS sells them). Say in itemId which one is this same wine (same producer and wine; the size may be missing from the name), or leave itemId out when none is: then a new item is created. Do not pick a different wine of the same producer.

Report every wine exactly once with report_barcode: the gtin (digits only) when found, the URL where you saw it, a confidence from 0 to 1 (0.9 or more only when a page shows this exact wine and size with the code; 0.6-0.8 when the wine matches but the size or producer is not fully certain), and a short note in Brazilian Portuguese (what page, what was uncertain). Finish with one short sentence.`;

type Find = { sku: string; gtin?: string; itemId?: string; source?: string; note?: string; confidence: number };

export async function findBarcodes(input: { session: string; company: string; skus: string[] }) {
  const url = convexUrl();
  if (!url) {
    throw new FinderError("Banco de dados não configurado.", 503);
  }
  const db = new ConvexHttpClient(url);
  const all = await db
    .query(api.barcodes.context, { session: input.session, company: input.company })
    .catch(() => null);
  if (!all) {
    throw new FinderError("Sem acesso ao estoque deste bar.", 403);
  }
  const wanted = all.filter((w) => input.skus.includes(w.sku)).slice(0, MAX_WINES);
  if (!wanted.length) {
    return { finds: [] as Find[], searches: 0, inputTokens: 0, outputTokens: 0 };
  }
  const saved = await providerKey("anthropic").catch(() => null);
  const apiKey = saved?.key ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new FinderError("Configure a chave da Anthropic em Configurações → AI Providers.", 503);
  }

  const finds = new Map<string, Find>();
  const candidates = new Map(wanted.map((w) => [w.sku, w.candidates.map((c) => c.id as string)]));
  const skus = new Set(wanted.map((w) => w.sku));

  const offSearch = betaZodTool({
    name: "off_search",
    description:
      "Search Open Food Facts, a public database of products and their barcodes. Returns up to 10 products: code (the GTIN), name, brand, quantity, countries.",
    inputSchema: z.object({ query: z.string().describe("Producer and wine name, e.g. 'Marsovin 1919 white'") }),
    run: async ({ query }) => {
      const q = new URLSearchParams({
        search_terms: query.slice(0, 120),
        search_simple: "1",
        action: "process",
        json: "1",
        page_size: "10",
        fields: "code,product_name,brands,quantity,countries",
      });
      // It sometimes answers with an error page instead of JSON: one retry
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${q}`, {
            headers: { "User-Agent": "StockApp/1.0 (wine barcode lookup)" },
            signal: AbortSignal.timeout(15_000),
          });
          const body = (await res.json()) as { products?: Record<string, unknown>[] };
          const products = (body.products ?? []).slice(0, 10);
          return JSON.stringify(products.length ? products : { none: true });
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      return "Open Food Facts did not answer; use web_search.";
    },
  });

  const report = betaZodTool({
    name: "report_barcode",
    description: "Report the result for one wine (once per wine), with or without a gtin.",
    inputSchema: z.object({
      sku: z.string(),
      gtin: z.string().optional().describe("Digits only; leave out when not found"),
      itemId: z.string().optional().describe("The catalog candidate that is this same wine, if any"),
      source: z.string().optional().describe("URL where the code was seen"),
      confidence: z.number().min(0).max(1),
      note: z.string().optional().describe("Short, in Brazilian Portuguese"),
    }),
    run: async (f) => {
      if (!skus.has(f.sku)) {
        return "Error: unknown sku.";
      }
      const allowed = candidates.get(f.sku) ?? [];
      if (f.itemId && !allowed.includes(f.itemId)) {
        return "Error: itemId must be one of this wine's catalogCandidates (or left out).";
      }
      if (f.gtin && !validGtin(f.gtin)) {
        return `Error: ${f.gtin} fails the GTIN check digit. Report it without a gtin unless you read a correct code.`;
      }
      finds.set(f.sku, f);
      return "Noted.";
    },
  });

  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16_000,
    max_iterations: 40,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [
      offSearch,
      report,
      { type: "web_search_20260209", name: "web_search", max_uses: wanted.length * 4 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: wanted.length * 3 },
    ],
    messages: [
      {
        role: "user",
        content: `Find the barcodes of these dispenser wines (JSON):\n${JSON.stringify(
          wanted.map((w) => ({
            sku: w.sku,
            wine: w.wine,
            producerCode: w.producer,
            grape: w.grape,
            origin: w.origin,
            vintage: w.vintage,
            bottleMl: w.volumeMl,
            linkedCatalogItem: w.linked ? w.itemName : null,
            catalogCandidates: w.linked ? [] : w.candidates.map((c) => ({ itemId: c.id, name: c.name })),
          }))
        )}`,
      },
    ],
  });

  let inputTokens = 0;
  let outputTokens = 0;
  let searches = 0;
  for await (const message of runner) {
    inputTokens +=
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);
    outputTokens += message.usage.output_tokens;
    searches += message.usage.server_tool_use?.web_search_requests ?? 0;
  }
  // Wines it did not report count as not found (so they are not retried blindly)
  for (const w of wanted) {
    if (!finds.has(w.sku)) {
      finds.set(w.sku, { sku: w.sku, confidence: 0, note: "O agente não encontrou." });
    }
  }
  const list = [...finds.values()];
  await db.mutation(api.barcodes.saveFinds, {
    session: input.session,
    company: input.company,
    finds: list.map((f) => ({ ...f, itemId: f.itemId as Id<"invItems"> | undefined })),
  });
  return { finds: list, searches, inputTokens, outputTokens };
}
