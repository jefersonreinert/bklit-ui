/**
 * Bottle sizes: the same product in another size (Cointreau 700 ml →
 * Cointreau 1L) is a copy with the size in its name and description.
 */

/** Common bottle and can sizes, in ml. */
export const BOTTLE_SIZES = [
  200, 330, 350, 375, 500, 700, 750, 1000, 1500, 3000,
] as const;

/** "1L", "1.5L", "700ml". */
export function sizeLabel(ml: number): string {
  if (ml >= 1000) {
    return `${Math.round((ml / 1000) * 100) / 100}L`;
  }
  return `${Math.round(ml)}ml`;
}

/** Sizes already written in a name or description ("70cl", "1 L", "700 ml", "1Ltr"). */
const SIZE = /\s*(?:[·\-–(]\s*)?\b\d+(?:[.,]\d+)?\s?(?:ml|cl|ltr|lt|l)\b\)?/gi;

const TRAILING_DOT = /\s*·\s*$/;
const SPACES = /\s{2,}/g;

/** The text without any size in it. */
export function stripSize(text: string): string {
  return text
    .replace(SIZE, "")
    .replace(TRAILING_DOT, "")
    .replace(SPACES, " ")
    .trim();
}

/** "Cointreau 700ml" + 1000 → "Cointreau 1L". */
export function nameWithSize(name: string, ml: number): string {
  return `${stripSize(name)} ${sizeLabel(ml)}`;
}

/** "Orange liqueur 40% · 70 cl" + 1000 → "Orange liqueur 40% · 1L". */
export function descriptionWithSize(
  text: string | undefined,
  ml: number
): string {
  const base = stripSize(text ?? "");
  return base ? `${base} · ${sizeLabel(ml)}` : sizeLabel(ml);
}
