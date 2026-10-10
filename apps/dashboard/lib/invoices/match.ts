import type { BaseUnit, Ingredient, InvoiceLine } from "./types";

/**
 * Turns invoice descriptions ("AZEITE EXTRA VIRGEM GALLO 5L CX4",
 * "Olive oil EV 5 lt") into comparable keys and finds the canonical
 * ingredient they belong to: barcode first, then a known alias, then the
 * most similar name (token and character overlap).
 */

const SIZE =
  /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kgs?|g|gr|grs|l|lt|lts|ltr|litros?|litres?|liters?|ml|cl|un|und|unid|pcs?|pz|x)\b/g;
const PACKAGING =
  /\b(?:cx|box|caixa|pack|pk|pct|pacote|bag|saco|sack|tin|lata|can|bottle|btl|garrafa|frasco|jar|pet|bdj|bandeja|tray|case|crate|kg|un|und)\b/g;
const SPACES = /\s+/;
const DIGITS_ONLY = /^\d+$/;
const PACK_COUNT = /^(?:cx|x|pk|un)\d+$/;
const PLURAL = /s$/;
const STOP = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "the",
  "of",
  "and",
  "e",
  "com",
  "with",
  "a",
  "o",
  "in",
  "em",
  "per",
  "para",
  "for",
]);

export function normalizeName(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SIZE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(PACKAGING, " ");
  return base
    .split(SPACES)
    .filter(
      (t) =>
        t.length > 1 &&
        !STOP.has(t) &&
        !DIGITS_ONLY.test(t) &&
        !PACK_COUNT.test(t)
    )
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t))
    .join(" ")
    .trim();
}

const tokens = (s: string) => new Set(s.split(" ").filter(Boolean));

function bigrams(s: string) {
  const out = new Map<string, number>();
  const t = s.replace(/ /g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** 0–1: how alike two normalized names are. */
export function similarity(a: string, b: string): number {
  if (!(a && b)) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  const ta = tokens(a);
  const tb = tokens(b);
  let common = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      common++;
    }
  }
  const tokenScore = (2 * common) / (ta.size + tb.size);
  const ga = bigrams(a);
  const gb = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of ga) {
    shared += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) {
    total += n;
  }
  const charScore = total ? (2 * shared) / total : 0;
  // Containment ("mozzarella" in "mozzarella fior di latte") counts strongly
  const contained =
    [...ta].every((t) => tb.has(t)) || [...tb].every((t) => ta.has(t));
  const score = 0.55 * tokenScore + 0.45 * charScore;
  return Math.min(1, contained ? Math.max(score, 0.78) : score);
}

export const AUTO_LINK = 0.72;
export const SUGGEST = 0.45;

export interface Match {
  ingredient: Ingredient;
  score: number;
  via: "ean" | "alias" | "similar";
}

export function rankIngredients(
  line: Pick<InvoiceLine, "description" | "genericName" | "ean">,
  ingredients: Ingredient[],
  limit = 5
): Match[] {
  if (line.ean) {
    const byEan = ingredients.find((i) => i.eans.includes(line.ean));
    if (byEan) {
      return [{ ingredient: byEan, score: 1, via: "ean" }];
    }
  }
  const keys = [line.genericName, line.description]
    .map(normalizeName)
    .filter(Boolean);
  const ranked: Match[] = [];
  for (const ing of ingredients) {
    const names = [normalizeName(ing.name), ...ing.aliases];
    if (keys.some((k) => ing.aliases.includes(k))) {
      ranked.push({ ingredient: ing, score: 1, via: "alias" });
      continue;
    }
    let best = 0;
    for (const k of keys) {
      for (const n of names) {
        best = Math.max(best, similarity(k, n));
      }
    }
    if (best >= SUGGEST) {
      ranked.push({ ingredient: ing, score: best, via: "similar" });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

const UNIT_FACTORS: Record<string, [BaseUnit, number]> = {
  kg: ["kg", 1],
  kgs: ["kg", 1],
  g: ["kg", 0.001],
  gr: ["kg", 0.001],
  l: ["l", 1],
  lt: ["l", 1],
  ltr: ["l", 1],
  litro: ["l", 1],
  litre: ["l", 1],
  liter: ["l", 1],
  ml: ["l", 0.001],
  cl: ["l", 0.01],
};

export function toBase(
  unit: string,
  size: number | null
): { baseUnit: BaseUnit; factor: number } {
  const u = unit
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const known = UNIT_FACTORS[u] ?? UNIT_FACTORS[u.replace(PLURAL, "")];
  if (known) {
    return { baseUnit: known[0], factor: (size ?? 1) * known[1] };
  }
  return { baseUnit: "un", factor: size && size > 0 ? size : 1 };
}

/** Price of one kg / litre / unit for a line. */
export function basePrice(line: InvoiceLine): number | null {
  if (!(line.unitPrice > 0 && line.packSize > 0)) {
    return null;
  }
  return line.unitPrice / line.packSize;
}

/** Pairs of catalog ingredients that look like the same product. */
export function duplicateCandidates(ingredients: Ingredient[]) {
  const pairs: { a: Ingredient; b: Ingredient; score: number }[] = [];
  const keys = ingredients.map((i) => normalizeName(i.name));
  ingredients.forEach((a, i) => {
    ingredients.forEach((b, j) => {
      if (j <= i || a.baseUnit !== b.baseUnit) {
        return;
      }
      const score = similarity(keys[i] ?? "", keys[j] ?? "");
      if (score >= AUTO_LINK) {
        pairs.push({ a, b, score });
      }
    });
  });
  return pairs.sort((x, y) => y.score - x.score);
}
