import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedInvoice } from "@/lib/invoices/types";
import { DESIGN_FONTS } from "@/lib/menu-canvas/fonts";
import { MENU_ICONS } from "@/lib/menu-canvas/model";
import type { AiEdit, ExtractedDesign } from "@/lib/menu-canvas/types";
import type { ExtractedMenu } from "@/lib/menu-studio/types";
import { groqKey } from "./groq-chat";
import { GroqError, groqJson } from "./groq-json";

/**
 * Reads photos and PDFs with Claude and returns structured JSON: a menu
 * (sections, items, prices and its visual style, logo position) or a
 * supplier invoice (header and lines). Structured outputs keep the reply
 * valid against the schema, so the client never parses free text.
 */

export const EXTRACT_MODEL = "claude-opus-5-5";

export class ExtractError extends Error {
  status: number;
  /** Machine-readable reason, e.g. "needs_images" (Groq can't read PDFs). */
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Without Anthropic credits (or key), the same job runs on Groq when
 * GROQ_API_KEY is set.
 */
async function viaGroq<T>(
  files: ExtractFile[],
  prompt: string,
  schema: Schema
): Promise<T> {
  try {
    return await groqJson<T>(files, prompt, schema);
  } catch (error) {
    if (error instanceof GroqError) {
      throw new ExtractError(error.message, error.status, error.code);
    }
    throw error;
  }
}

export interface ExtractFile {
  /** Base64 without the data: prefix. */
  data: string;
  mimeType: string;
}

const NO_CREDITS = /credit balance|billing|insufficient.*(credit|fund)/i;

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

async function askClaude<T>(
  files: ExtractFile[],
  prompt: string,
  schema: Schema
): Promise<T> {
  const client = new Anthropic();
  const content = contentFor(files);
  content.push({ type: "text", text: prompt });
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
}

const noCredits = (error: unknown) =>
  error instanceof Anthropic.APIError && NO_CREDITS.test(error.message);

/** A Claude/SDK failure as a message for the panel. */
function claudeError(error: unknown): unknown {
  if (error instanceof ExtractError) {
    return error;
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ExtractError("Chave da API da Anthropic inválida.", 401);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ExtractError("Limite da API atingido; tente de novo.", 429);
  }
  if (noCredits(error)) {
    return new ExtractError(
      "Sem créditos na API da Anthropic. Adicione créditos em console.anthropic.com → Billing, ou configure GROQ_API_KEY para usar o Groq automaticamente.",
      402
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ExtractError(`Arquivo recusado: ${error.message}`, 400);
  }
  if (error instanceof Anthropic.APIError) {
    return new ExtractError(error.message, 502);
  }
  if (error instanceof SyntaxError) {
    return new ExtractError("Resposta da IA incompleta; tente de novo.", 502);
  }
  return error;
}

/**
 * Claude first; without an Anthropic key or credits, Groq (when
 * GROQ_API_KEY is set) runs the same prompt and schema.
 */
async function run<T>(
  files: ExtractFile[],
  prompt: string,
  schema: Schema,
  hint?: string
): Promise<T> {
  const fullPrompt = hint
    ? `${prompt}\n\nNotes from the user: ${hint}`
    : prompt;
  if (!process.env.ANTHROPIC_API_KEY) {
    if (groqKey()) {
      return viaGroq<T>(files, fullPrompt, schema);
    }
    throw new ExtractError(
      "ANTHROPIC_API_KEY não configurada no servidor.",
      503
    );
  }
  try {
    return await askClaude<T>(files, fullPrompt, schema);
  } catch (error) {
    if (noCredits(error) && groqKey()) {
      return viaGroq<T>(files, fullPrompt, schema);
    }
    throw claudeError(error);
  }
}

const SCAN_SCHEMA = obj({ title: str, language: str, text: str });

const SCAN_PROMPT = `You receive photos (or a PDF) of document pages the user just scanned with a phone: letters, receipts, forms, contracts, IDs, notes, whiteboards, book pages, handwriting.
Transcribe ALL readable text into "text" as GitHub-flavored Markdown, in reading order, page after page:
- Keep the original language, spelling, accents, numbers, dates and line breaks that matter. Never translate, summarize or invent text; mark unreadable bits as [ilegível].
- Headings as #/##, lists as - or 1., tables as Markdown tables, checkboxes as - [ ] / - [x], bold for printed emphasis.
- Separate pages with a line containing only ---.
- Ignore the background, fingers and the page edges.
title: a short descriptive file name in the document's language (e.g. "Recibo Farmácia 12-03-2026"), no extension.
language: ISO 639-1 code of the main language.`;

export interface ScannedText {
  title: string;
  language: string;
  text: string;
}

export const extractScan = (files: ExtractFile[], hint?: string) =>
  run<ScannedText>(files, SCAN_PROMPT, SCAN_SCHEMA, hint);

export const extractMenu = (files: ExtractFile[], hint?: string) =>
  run<ExtractedMenu>(files, MENU_PROMPT, MENU_SCHEMA, hint);

export const extractInvoice = (files: ExtractFile[], hint?: string) =>
  run<ExtractedInvoice>(files, INVOICE_PROMPT, INVOICE_SCHEMA, hint);

/* ------------------------------ work timetable ------------------------------ */

const TIMETABLE_SCHEMA = obj({
  nameAsWritten: str,
  placeGuess: str,
  weekStart: str,
  shifts: arr(
    obj({
      date: str,
      start: str,
      end: str,
      raw: str,
      note: str,
    })
  ),
  notes: str,
});

const TIMETABLE_PROMPT = `You receive a staff rota / timetable from a restaurant or bar: a photo (often HANDWRITTEN on paper), a PDF, or a spreadsheet given as CSV text. One worker uses this app; find ONLY that worker's row and return their shifts for the week.

The worker's name can appear as any of these spellings (all the same person): {ALIASES}. Handwriting may misspell or abbreviate it (e.g. "JefFeson", "Jeferson", "Jeff", "Jef", "J.") — pick the row that best matches. Ignore every other person. nameAsWritten = the name exactly as written in the rota ("" if not found).

Dates:
- If the rota prints dates (header row, title like "12-17 Oct"), use them.
- Otherwise columns are weekdays (M T W T F S S / Mon..Sun / Seg..Dom); map them onto the week starting Monday {WEEK_START}. weekStart = the Monday of the week you used, YYYY-MM-DD.

One entry in shifts per day the worker works, Monday first:
- date YYYY-MM-DD.
- start/end in 24h HH:MM. "17-" or "17" or "18 -" means it starts at 17:00 and the end is not written: end = "". "11-17:00" or "11-5" means 11:00-17:00 (read pm sensibly: a restaurant shift ending at "5" after starting at "11" ends 17:00).
- Days off ("Off", "OFF", "-", "—", "x", empty, "+") are NOT shifts: leave them out.
- A cell with a code but no readable time (e.g. "NXR", "training", "?") → include it with start "" and end "", and explain in note.
- raw = the cell text exactly as written.
- note = anything useful (e.g. "code NXR, unclear", "split shift"), else "".

placeGuess = the venue if you can tell it from the page (logo, letterhead, title). The worker's venues are: {PLACES}. Answer with one of these names when it matches, else the name as written, else "".
notes = short remarks for the worker in Portuguese (e.g. unclear handwriting on Thursday), else "".`;

export interface ExtractedShift {
  date: string;
  start: string;
  end: string;
  raw: string;
  note: string;
}

export interface ExtractedTimetable {
  nameAsWritten: string;
  placeGuess: string;
  weekStart: string;
  shifts: ExtractedShift[];
  notes: string;
}

const TEXT_TYPE = /^text\//;

/**
 * hint is JSON: { aliases: string[], weekStart: "YYYY-MM-DD", places: string[] }. Spreadsheets
 * arrive as text/csv files and are pasted into the prompt.
 */
export function extractTimetable(files: ExtractFile[], hint?: string) {
  let aliases = ["Jeferson", "Jefferson", "Jeff", "Jef"];
  let weekStart = "";
  let places: string[] = [];
  try {
    const parsed = JSON.parse(hint ?? "{}") as {
      aliases?: unknown;
      weekStart?: unknown;
      places?: unknown;
    };
    if (Array.isArray(parsed.places)) {
      places = parsed.places.map(String).slice(0, 6);
    }
    if (Array.isArray(parsed.aliases) && parsed.aliases.length) {
      aliases = parsed.aliases.map(String).slice(0, 12);
    }
    if (typeof parsed.weekStart === "string") {
      weekStart = parsed.weekStart.slice(0, 10);
    }
  } catch {
    // Not JSON: keep the defaults
  }
  const sheets = files
    .filter((f) => TEXT_TYPE.test(f.mimeType))
    .map((f) =>
      Buffer.from(f.data, "base64").toString("utf8").slice(0, 60_000)
    );
  const media = files.filter((f) => !TEXT_TYPE.test(f.mimeType));
  const prompt = [
    TIMETABLE_PROMPT.replace("{ALIASES}", aliases.join(", "))
      .replace(
        "{WEEK_START}",
        weekStart || "(unknown: use the dates printed in the rota)"
      )
      .replace("{PLACES}", places.join("; ") || "(not given)"),
    ...sheets.map((text, i) => `Spreadsheet ${i + 1} (CSV):\n${text}`),
  ].join("\n\n");
  return run<ExtractedTimetable>(media, prompt, TIMETABLE_SCHEMA);
}

/* ------------------------- free-form menu designs ------------------------ */

const AI_ELEMENT = obj({
  id: str,
  type: { type: "string", enum: ["text", "shape", "image", "icon", "line"] },
  x: num,
  y: num,
  w: num,
  h: num,
  rotation: num,
  text: str,
  fontFamily: str,
  fontCategory: str,
  fontSize: num,
  fontWeight: num,
  italic: { type: "boolean" },
  color: str,
  align: str,
  letterSpacing: num,
  lineHeight: num,
  uppercase: { type: "boolean" },
  fill: str,
  stroke: str,
  strokeWidth: num,
  radius: num,
  shape: str,
  icon: str,
  opacity: num,
});

const DESIGN_SCHEMA = obj({
  name: str,
  aspect: num,
  pages: arr(
    obj({ pageIndex: num, background: str, elements: arr(AI_ELEMENT) })
  ),
});

const EDIT_SCHEMA = obj({
  message: str,
  background: str,
  elements: arr(AI_ELEMENT),
});

const FONT_LIST = DESIGN_FONTS.map((f) => `${f.family} (${f.category})`).join(
  ", "
);

const ELEMENT_RULES = `Element fields (fill every field; use "" / 0 / false when not relevant):
- type "text": text (keep line breaks with \n), fontFamily = the Google Font that looks MOST like the lettering (prefer this list: ${FONT_LIST}; any other real Google Font name is allowed when clearly closer), fontCategory (serif, sans, display, script, mono), fontWeight 100-900, italic, color #rrggbb, align left|center|right, letterSpacing in px, lineHeight as a multiplier (e.g. 1.2), uppercase when the letters are all caps.
- type "shape": shape rect|ellipse, fill #rrggbb or "", stroke #rrggbb or "", strokeWidth, radius (corner radius).
- type "line": a straight rule/divider; stroke color and strokeWidth; h is its thickness.
- type "icon": icon = one of ${MENU_ICONS.join(", ")}; color #rrggbb.
- rotation in degrees, opacity 0-1 (1 when opaque).`;

const DESIGN_PROMPT = `You receive photos (or a PDF) of a printed restaurant menu, flyer or board. Rebuild each page as an editable design, like Canva would, so it looks as close as possible to the original.
- One entry in pages per photographed page (pageIndex = 0-based photo/page index). background = dominant page color #rrggbb.
- aspect = page width / height as photographed (e.g. A4 portrait 0.707).
- elements in back-to-front order. x, y, w, h are FRACTIONS (0-1) of the page width/height for the element's box. For text, fontSize is a FRACTION of the page height (cap height + descender, e.g. 0.02 for body text on A4).
- Make one text element per visual block: the title, each section heading, each dish line (name and price may share a line using spaces or dots, or be separate elements aligned left/right as on the original), each description. Transcribe faithfully in the original language, never translate or invent.
- Recreate decorative rules, boxes, frames, colored bands and circles as shape/line elements with the sampled colors.
- type "image": logos, photos, illustrations or ornaments that cannot be drawn with text/shapes — give only the box (they are cropped from the photo); leave other fields empty.
- Prefer icons for small pictograms (wine glass, chili, leaf, star...).
${ELEMENT_RULES}
- name: short name for the design (restaurant name + menu type).`;

const EDIT_PROMPT = `You edit a restaurant menu design (Canva-like) on a page of {W} x {H} px. The user gives an instruction in natural language (often Portuguese, maybe dictated by voice). Apply it and return the COMPLETE new list of elements for the page, back-to-front.
- Keep the id of every element you keep or change; elements you omit are deleted; new elements get id "" .
- Coordinates and sizes are page pixels; fontSize in px.
- Change only what the instruction asks, but do it fully (e.g. "mude todas as fontes dos preços para…" means every price). Keep the layout tidy: aligned, inside the page, no overlaps unless intended.
- Images ("image" elements) cannot be created, only moved, resized, rotated or deleted.
- background: the page background #rrggbb (keep it unless asked).
- message: one short sentence in the user's language telling what you did.
${ELEMENT_RULES}`;

export const extractDesign = (files: ExtractFile[], hint?: string) =>
  run<ExtractedDesign>(files, DESIGN_PROMPT, DESIGN_SCHEMA, hint);

export function editDesign(input: {
  width: number;
  height: number;
  background: string;
  elements: unknown[];
  instruction: string;
}) {
  const prompt = `${EDIT_PROMPT.replace("{W}", String(input.width)).replace("{H}", String(input.height))}

Current page background: ${input.background}
Current elements (JSON):
${JSON.stringify(input.elements)}

Instruction: ${input.instruction}`;
  return run<AiEdit>([], prompt, EDIT_SCHEMA);
}

const ELEMENTS_SCHEMA = obj({
  named: arr(
    obj({ index: num, name: str, kind: str, isDecoration: { type: "boolean" } })
  ),
  extra: arr(obj({ name: str, kind: str, x: num, y: num, w: num, h: num })),
});

const ELEMENTS_PROMPT = `This is a page of a restaurant/bar menu with numbered red boxes drawn around the drawings found automatically.
For each numbered box return { index, name, kind, isDecoration }:
- name: a short descriptive name in Portuguese for a design library (e.g. "Taça coupe", "Copo highball", "Ornamento art déco", "Divisória dupla", "Ilustração marinheiros", "Logotipo").
- kind: icon (small pictogram like a glass or bottle), ornament, illustration (picture/drawing), divider (rule/line), logo, frame (border/box), text (the box holds mostly text), other.
- isDecoration: true for anything worth reusing in another design; false for text, page numbers or empty boxes.
In "extra" list important decorative drawings that no box covers well, as fractions (0-1) of the page (x, y = top-left corner).`;

export const extractElements = (files: ExtractFile[], hint?: string) =>
  run<{
    named: {
      index: number;
      name: string;
      kind: string;
      isDecoration: boolean;
    }[];
    extra: {
      name: string;
      kind: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
  }>(files, ELEMENTS_PROMPT, ELEMENTS_SCHEMA, hint);
