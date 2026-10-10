import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedInvoice } from "@/lib/invoices/types";
import type { ExtractedMenu } from "@/lib/menu-studio/types";

/**
 * Reads photos and PDFs with Claude and returns structured JSON: a menu
 * (sections, items, prices and its visual style, logo position) or a
 * supplier invoice (header and lines). Structured outputs keep the reply
 * valid against the schema, so the client never parses free text.
 */

export const EXTRACT_MODEL = "claude-opus-5-5";

export class ExtractError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ExtractFile {
  /** Base64 without the data: prefix. */
  data: string;
  mimeType: string;
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type Schema = Record<string, unknown>;

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: "null" }] });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items: Schema): Schema => ({ type: "array", items });

const MENU_SCHEMA = obj({
  restaurantName: str,
  tagline: str,
  currency: str,
  language: str,
  style: obj({
    background: str,
    text: str,
    accent: str,
    muted: str,
    headingFont: obj({ category: str, closestGoogleFont: str }),
    bodyFont: obj({ category: str, closestGoogleFont: str }),
    columns: num,
    layout: str,
    ornament: str,
    uppercaseHeadings: { type: "boolean" },
    priceStyle: str,
  }),
  logo: nullable(
    obj({ pageIndex: num, x: num, y: num, width: num, height: num })
  ),
  sections: arr(
    obj({
      title: str,
      note: str,
      kind: str,
      items: arr(
        obj({
          name: str,
          description: str,
          price: nullable(num),
          secondaryPrice: nullable(num),
          secondaryLabel: str,
          tags: arr(str),
          grapes: arr(str),
          country: str,
          region: str,
          vintage: nullable(num),
          style: str,
        })
      ),
    })
  ),
});

const INVOICE_SCHEMA = obj({
  supplier: obj({ name: str, taxId: str, address: str }),
  buyer: obj({ name: str, taxId: str, address: str }),
  number: str,
  date: str,
  dueDate: str,
  currency: str,
  subtotal: nullable(num),
  vatTotal: nullable(num),
  total: nullable(num),
  lines: arr(
    obj({
      description: str,
      code: str,
      ean: str,
      quantity: nullable(num),
      unit: str,
      packSize: nullable(num),
      packUnit: str,
      unitPrice: nullable(num),
      vatRate: nullable(num),
      lineTotal: nullable(num),
      category: str,
      genericName: str,
    })
  ),
});

const MENU_PROMPT = `You receive photos or a PDF of a restaurant menu (food, drinks or a wine list).
Transcribe it faithfully into the JSON schema:
- Keep the original language, spelling, accents and order of sections and items. Do not translate or invent items.
- price: the main price as a number (no currency symbol). secondaryPrice/secondaryLabel: a second price column (glass vs bottle, half vs full, takeaway), else null and "".
- For wines fill grapes, country, region, vintage and style (Red, White, Rosé, Sparkling, Sweet, Orange); otherwise empty strings/arrays and null.
- section.kind: "food", "wine", "drinks" or "other".
- style: describe the visual design so it can be recreated. Colors as hex (#rrggbb) sampled from the page: background, main text, accent (headings/ornaments), muted (descriptions). Fonts: category (serif, sans, script, display, mono) plus the closest Google Font name. columns: 1, 2 or 3. layout: "classic", "modern", "bistro", "minimal" or "elegant". ornament: "none", "line", "dots", "double". priceStyle: "right" (aligned right with leader), "inline" (after the name) or "below".
- logo: if a logo or emblem is visible, its bounding box as fractions (0-1) of the page width/height and the 0-based page/photo index; otherwise null.
- currency: ISO code if visible or inferable (EUR, BRL, USD...), else "".`;

const INVOICE_PROMPT = `You receive a photo or PDF of a supplier invoice / nota fiscal / delivery note for a restaurant.
Extract it into the JSON schema:
- supplier = who issued the invoice; buyer = the restaurant company it was billed to. taxId = VAT/NIF/CNPJ number as printed.
- date and dueDate as YYYY-MM-DD (empty string if absent). currency as an ISO code.
- One entry in lines per product line, in order. Skip lines that are only totals, deposits summaries or page footers.
- unitPrice is the price per invoiced unit EXCLUDING VAT when the invoice shows it; vatRate as a percentage number (e.g. 18).
- packSize/packUnit: the content of one unit when printed in the description (e.g. "Olive oil 5L" -> 5, "l"; "Flour 25kg" -> 25, "kg"; "Wine 75cl" -> 0.75, "l"). Use null and "" when unknown.
- ean: barcode digits if printed; code: the supplier's own product code.
- genericName: a short generic ingredient name in English without brand, size or packaging (e.g. "olive oil extra virgin", "beef ribeye", "mozzarella"). For wines and drinks use the product name without the size.
- category: one of produce, meat, fish, dairy, dry goods, bakery, beverages, wine, spirits, beer, cleaning, packaging, other.
- Use null for numbers that are not printed; never guess totals.`;

function contentFor(files: ExtractFile[]): Anthropic.ContentBlockParam[] {
  return files.map((f): Anthropic.ContentBlockParam => {
    if (f.mimeType === "application/pdf") {
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.data },
      };
    }
    if (!IMAGE_TYPES.has(f.mimeType)) {
      throw new ExtractError(`Formato não suportado: ${f.mimeType}`, 415);
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: f.mimeType as "image/jpeg",
        data: f.data,
      },
    };
  });
}

async function run<T>(
  files: ExtractFile[],
  prompt: string,
  schema: Schema,
  hint?: string
): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractError(
      "ANTHROPIC_API_KEY não configurada no servidor.",
      503
    );
  }
  const client = new Anthropic();
  const content = contentFor(files);
  content.push({
    type: "text",
    text: hint ? `${prompt}\n\nNotes from the user: ${hint}` : prompt,
  });

  try {
    const stream = client.messages.stream({
      model: EXTRACT_MODEL,
      max_tokens: 64_000,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new ExtractError("A IA recusou ler este arquivo.", 422);
    }
    if (message.stop_reason === "max_tokens") {
      throw new ExtractError(
        "Documento grande demais para uma leitura. Envie menos páginas por vez.",
        413
      );
    }
    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ExtractError) {
      throw error;
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ExtractError("Chave da API da Anthropic inválida.", 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractError("Limite da API atingido; tente de novo.", 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ExtractError(`Arquivo recusado: ${error.message}`, 400);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ExtractError(error.message, 502);
    }
    if (error instanceof SyntaxError) {
      throw new ExtractError("Resposta da IA incompleta; tente de novo.", 502);
    }
    throw error;
  }
}

export const extractMenu = (files: ExtractFile[], hint?: string) =>
  run<ExtractedMenu>(files, MENU_PROMPT, MENU_SCHEMA, hint);

export const extractInvoice = (files: ExtractFile[], hint?: string) =>
  run<ExtractedInvoice>(files, INVOICE_PROMPT, INVOICE_SCHEMA, hint);
