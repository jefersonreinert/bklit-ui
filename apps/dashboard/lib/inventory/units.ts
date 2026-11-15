/**
 * Pure stock arithmetic shared by the server (convex/inv.ts) and the
 * screens: bottle weight → content, the total of a counted line, the
 * weighted average cost and how a quantity reads to people.
 */

export type InvUnit = "ml" | "g" | "un";

export interface BottleProfile {
  unit: InvUnit;
  /** Content of one container in the base unit (700 for a 70 cl bottle). */
  size: number;
  emptyG?: number;
  fullG?: number;
  abv?: number;
}

const round = (n: number, step = 1000) => Math.round(n * step) / step;

/**
 * Approximate density (g/ml) of a drink from its alcohol by volume:
 * water 1.0, ethanol 0.79. Sugar (liqueurs) makes the real one higher,
 * so a result that uses it is marked as estimated.
 */
export function densityOf(abv = 0) {
  const a = Math.min(100, Math.max(0, abv)) / 100;
  return 1 - 0.21 * a;
}

/**
 * Content (base unit) of an open bottle that weighs `weightG` grams.
 * With the empty and the full weight of this product it is exact
 * (no density needed); with only the empty weight it uses the density
 * of its ABV (estimated). Without an empty weight it cannot be weighed.
 */
export function contentOfWeight(
  weightG: number,
  p: BottleProfile
): { qty: number; estimated: boolean } | null {
  if (!(Number.isFinite(weightG) && weightG >= 0 && p.size > 0)) {
    return null;
  }
  const { emptyG, fullG } = p;
  if (emptyG === undefined || emptyG <= 0) {
    return null;
  }
  const clamp = (q: number) => round(Math.min(p.size, Math.max(0, q)));
  if (fullG !== undefined && fullG > emptyG) {
    return {
      qty: clamp(((weightG - emptyG) / (fullG - emptyG)) * p.size),
      estimated: false,
    };
  }
  if (p.unit === "g") {
    // Weighed goods: the net weight is the content
    return { qty: clamp(weightG - emptyG), estimated: false };
  }
  if (p.unit !== "ml") {
    return null;
  }
  return { qty: clamp((weightG - emptyG) / densityOf(p.abv)), estimated: true };
}

export interface CountInput {
  full: number;
  weights: number[];
  loose: number;
}

/**
 * Total of a counted line in the base unit: full containers × size, the
 * content of every weighed open bottle, and a loose quantity. Throws when
 * a weight cannot be converted (no bottle profile yet).
 */
export function countedQty(line: CountInput, p: BottleProfile) {
  if (line.full < 0 || line.loose < 0 || line.weights.some((w) => w < 0)) {
    throw new Error("NEGATIVE");
  }
  let qty = line.full * p.size + line.loose;
  let estimated = false;
  for (const w of line.weights) {
    const c = contentOfWeight(w, p);
    if (!c) {
      throw new Error("NO_PROFILE");
    }
    qty += c.qty;
    estimated ||= c.estimated;
  }
  return { qty: round(qty), estimated };
}

/** Weighted average cost after receiving `qty` at `unitCost`. */
export function averageCost(
  onHand: number,
  avgCost: number,
  qty: number,
  unitCost: number
) {
  const before = Math.max(0, onHand);
  const total = before + qty;
  if (qty <= 0 || total <= 0) {
    return avgCost;
  }
  return round((before * avgCost + qty * unitCost) / total, 1e6);
}

/** "2 garrafas + 350 ml" style reading of a quantity in the base unit. */
export function describeQty(qty: number, p: BottleProfile & { container: string }) {
  const unit = p.unit === "un" ? "un" : p.unit;
  if (p.unit === "un" || p.size <= 1) {
    return `${round(qty, 100)} ${unit}`;
  }
  const sign = qty < 0 ? "−" : "";
  const abs = Math.abs(qty);
  const whole = Math.floor(abs / p.size + 1e-9);
  const rest = round(abs - whole * p.size, 10);
  if (!whole) {
    return `${sign}${rest} ${unit}`;
  }
  const c = whole === 1 ? p.container : `${p.container}s`;
  return rest
    ? `${sign}${whole} ${c} + ${rest} ${unit}`
    : `${sign}${whole} ${c}`;
}

export const INV_CATEGORIES = [
  { value: "spirits", label: "Destilados" },
  { value: "liqueur", label: "Licores" },
  { value: "wine", label: "Vinhos" },
  { value: "sparkling", label: "Espumantes" },
  { value: "beer", label: "Cervejas" },
  { value: "soft", label: "Refrigerantes e águas" },
  { value: "mixer", label: "Mixers e xaropes" },
  { value: "produce", label: "Hortifrúti" },
  { value: "meat", label: "Carnes e peixes" },
  { value: "dairy", label: "Laticínios" },
  { value: "dry", label: "Mercearia" },
  { value: "cleaning", label: "Limpeza" },
  { value: "packaging", label: "Embalagens" },
  { value: "other", label: "Outros" },
] as const;

export const invCategoryLabel = (c: string) =>
  INV_CATEGORIES.find((x) => x.value === c)?.label ?? c;
