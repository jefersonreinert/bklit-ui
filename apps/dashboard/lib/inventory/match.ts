/**
 * Invoice lines → stock items, as pure functions (used by
 * convex/invoices.ts and tested in lib/__tests__/inventory-match.test.ts):
 * name normalization, a name similarity score, and how many base units
 * (ml, g, un) one invoiced unit holds ("case 6 x 70cl" = 4200 ml).
 */

import type { InvUnit } from "./units";

const MARKS = /[̀-ͯ]/g;
const NON_WORD = /[^a-z0-9]+/g;
const SPACES = /\s+/g;

/** Lower case, no accents, only letters and digits. */
export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .replace(SPACES, " ")
    .trim();
}

/** Words that say size or packaging, not what the product is. */
const NOISE = new Set([
  "cl",
  "ml",
  "l",
  "lt",
  "ltr",
  "kg",
  "g",
  "gr",
  "x",
  "btl",
  "bottle",
  "bot",
  "case",
  "cs",
  "cx",
  "pk",
  "pack",
  "can",
  "keg",
  "the",
  "de",
  "di",
  "da",
  "do",
  "and",
]);
const SIZE_TOKEN = /^(\d+x)?\d+([.,]\d+)?(cl|ml|l|lt|kg|g|gr|x)?$/;

function words(s: string) {
  return normalizeName(s)
    .split(" ")
    .filter((w) => w.length > 1 && !NOISE.has(w) && !SIZE_TOKEN.test(w));
}

/**
 * Two words of the same family ("albarino" / "albarinos", "limoncello" /
 * "limoncell"): one starts the other and covers most of it. A short
 * abbreviation ("marg" for a brand) does not make "margarita".
 */
function sameStem(a: string, b: string) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short) && short.length / long.length >= 0.75;
}

/** 0–1: how alike two product names are (shared words, Dice score). */
export function nameScore(a: string, b: string) {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!(wa.size && wb.size)) {
    return 0;
  }
  let shared = 0;
  for (const w of wa) {
    if (wb.has(w) || [...wb].some((x) => sameStem(w, x))) {
      shared++;
    }
  }
  return (2 * shared) / (wa.size + wb.size);
}

/** A name match this good is taken without asking; below, it is a hint. */
export const AUTO_SCORE = 0.85;
export const HINT_SCORE = 0.5;

/** Content in the base unit of an amount like 0.75 "l", 70 "cl", 5 "kg". */
export function toBase(amount: number, unit: string, base: InvUnit): number | null {
  const u = normalizeName(unit);
  if (!(amount > 0)) {
    return null;
  }
  if (base === "ml") {
    if (u === "l" || u === "lt" || u === "ltr" || u === "litre" || u === "liter" || u === "litro") {
      return amount * 1000;
    }
    if (u === "cl") {
      return amount * 10;
    }
    if (u === "ml") {
      return amount;
    }
  }
  if (base === "g") {
    if (u === "kg" || u === "kilo") {
      return amount * 1000;
    }
    if (u === "g" || u === "gr") {
      return amount;
    }
  }
  return null;
}

const MULTI = /(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(cl|ml|l|lt|kg|g|gr)\b/i;
const COUNT_X = /(?:^|\s)(\d+)\s*[x×*](?:\s|$)|(?:^|\s)[x×*]\s*(\d+)(?:\s|$)/i;
const CASE_WORD = /\b(case|cs|cx|caixa|crate|carton|ctn|box|pack|pk|tray)\b/i;

export interface LineForUnits {
  description: string;
  unit: string;
  packSize: number | null;
  packUnit: string;
}

export interface ItemForUnits {
  unit: InvUnit;
  /** Content of one container in the base unit. */
  size: number;
}

/**
 * How many base units one invoiced unit holds, or null when it cannot be
 * told (the reviewer then fills it in):
 * - "6 x 70cl" in the description → 4200 ml;
 * - a printed content (packSize/packUnit) → that content, rounded to
 *   whole containers when it is a case of them;
 * - a case without content but with "x 6" → 6 containers;
 * - otherwise one container per invoiced unit.
 */
export function perUnitGuess(line: LineForUnits, item: ItemForUnits): number | null {
  const text = `${line.description} ${line.unit}`;
  const multi = MULTI.exec(text);
  if (multi && item.unit !== "un") {
    const n = Number(multi[1]);
    const each = toBase(Number(multi[2]?.replace(",", ".")), multi[3] ?? "", item.unit);
    if (n > 0 && each) {
      return round(n * each);
    }
  }
  if (line.packSize && line.packUnit && item.unit !== "un") {
    const content = toBase(line.packSize, line.packUnit, item.unit);
    if (content) {
      return round(content);
    }
  }
  const count = COUNT_X.exec(text);
  const n = Number(count?.[1] ?? count?.[2] ?? 0);
  if (item.unit === "un") {
    // A pack of 24 cans counted as cans
    return n > 1 ? n : 1;
  }
  if (n > 1 && CASE_WORD.test(text)) {
    return round(n * item.size);
  }
  if (CASE_WORD.test(line.unit) && !n) {
    return null;
  }
  return item.size > 0 ? item.size : null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface Candidate {
  id: string;
  name: string;
}

/** The best stock item for an invoice line by name, with its score. */
export function bestByName<T extends Candidate>(
  text: string,
  items: T[]
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = nameScore(text, item.name);
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best && best.score >= HINT_SCORE ? best : null;
}

/** Net cost of a line (without VAT): unit price × quantity, else its total. */
export function lineNet(line: {
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  vatRate: number | null;
}) {
  if (line.unitPrice !== null && Number.isFinite(line.unitPrice)) {
    return Math.round(line.unitPrice * line.quantity * 100) / 100;
  }
  if (line.lineTotal !== null && Number.isFinite(line.lineTotal)) {
    return Math.round(line.lineTotal * 100) / 100;
  }
  return 0;
}

/**
 * A dispenser wine's identity. The Wine Monitor SKU alone is not unique
 * (the portal reuses numbers across wines), so the name goes with it.
 */
export const wmKey = (sku: string | undefined, wine: string) =>
  `${(sku ?? "").trim()}:${normalizeName(wine)}`;
