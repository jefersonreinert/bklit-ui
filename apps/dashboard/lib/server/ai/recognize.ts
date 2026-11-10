import { z } from "zod";
import type { RecognizedProduct } from "@/lib/ai/providers-meta";
import type { VisionRequest } from "./types";

/**
 * Product recognition from a photo: one prompt for every provider and a
 * lenient parser, so any model that answers JSON works.
 */

export interface CategoryHint {
  name: string;
  subs: string[];
}

const SYSTEM =
  "You identify retail and bar/restaurant products (bottles, cans, packages, ingredients) from a photo for an inventory system. Answer with ONE JSON object only, no markdown, no extra text.";

export function recognitionRequest(
  image: string,
  mediaType: VisionRequest["mediaType"],
  categories: CategoryHint[],
  barcode: string | null
): VisionRequest {
  const cats = categories
    .slice(0, 80)
    .map((c) => (c.subs.length ? `${c.name} (${c.subs.slice(0, 20).join(", ")})` : c.name))
    .join("; ");
  const prompt = [
    "Identify the product in the photo.",
    'Reply with JSON: {"name": string|null, "brand": string|null, "category": string|null, "subcategory": string|null, "barcode": string|null, "size": string|null, "description": string|null, "confidence": number}.',
    "- name: how it would appear on a menu/stock list, e.g. \"Heineken 330 ml\".",
    "- barcode: only the digits printed under a barcode if you can read them clearly, else null.",
    "- size: volume or weight printed on the package (\"750 ml\", \"1 kg\").",
    "- description: one short sentence (type, origin, style).",
    "- confidence: 0 to 1, how sure you are about name and brand.",
    cats
      ? `- category/subcategory: prefer these existing ones (subcategories in parentheses): ${cats}. Use null if none fits.`
      : "- category/subcategory: a short generic category (e.g. Cervejas, Vinhos, Destilados).",
    barcode ? `The barcode scanner already read: ${barcode}.` : "",
    "Answer in Portuguese (Brazil) for description and categories; keep brand and product names as printed.",
  ]
    .filter(Boolean)
    .join("\n");
  return { image, mediaType, system: SYSTEM, prompt, maxTokens: 4000 };
}

const str = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s && s.toLowerCase() !== "null" ? s.slice(0, 200) : null;
  });

const Product = z.object({
  name: str,
  brand: str,
  category: str,
  subcategory: str,
  barcode: str,
  size: str,
  description: str,
  confidence: z.coerce.number().min(0).max(1).catch(0.5).optional(),
});

/** First JSON object in the answer (models sometimes wrap it in prose). */
export function parseRecognition(text: string): RecognizedProduct | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = Product.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const p = parsed.data;
  const digits = p.barcode?.replace(/\D/g, "") ?? "";
  return {
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    barcode: digits.length >= 6 ? digits : null,
    size: p.size,
    description: p.description,
    confidence: p.confidence ?? 0.5,
  };
}
