/**
 * Technical sheets (recipes) and their cost, as pure functions shared by
 * convex/recipes.ts and the screens:
 * - a line is a stock item or a prep (a sub-recipe such as a syrup),
 *   in the ingredient's base unit, with a loss % (trim, spill);
 * - a prep's cost per base unit = its total cost ÷ its yield;
 * - margin (GP%) on the price without VAT, and a suggested price.
 */

export interface CostLine {
  itemId?: string;
  prepId?: string;
  /** Quantity in the ingredient's base unit (ml, g, un). */
  qty: number;
  /** Loss 0–0.9: 0.1 means 10% of what is used is lost (trim, spill). */
  waste: number;
}

export interface CostRecipe {
  id: string;
  /** What one batch gives, in the base unit (a menu item = 1 portion). */
  yieldQty: number;
  lines: CostLine[];
}

export interface CostResult {
  /** Cost of the whole recipe (one portion for a menu item). */
  cost: number;
  /** Per line, null when the ingredient has no cost yet. */
  lineCosts: (number | null)[];
  /** Ingredients (item or prep ids) without a cost. */
  missing: string[];
}

export class RecipeCycleError extends Error {
  constructor(readonly path: string[]) {
    super("CYCLE");
  }
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Quantity actually taken from stock for a line, loss included. */
export function grossQty(line: Pick<CostLine, "qty" | "waste">) {
  const w = Math.min(0.9, Math.max(0, line.waste));
  return line.qty / (1 - w);
}

/**
 * Cost of a recipe from the cost per base unit of each stock item
 * (`itemCost`, null = unknown) and the other recipes (for preps).
 * Throws RecipeCycleError when preps use each other in a loop.
 */
export function recipeCost(
  recipe: CostRecipe,
  recipes: Map<string, CostRecipe>,
  itemCost: (itemId: string) => number | null,
  stack: string[] = []
): CostResult {
  if (stack.includes(recipe.id)) {
    throw new RecipeCycleError([...stack, recipe.id]);
  }
  const path = [...stack, recipe.id];
  const missing = new Set<string>();
  const lineCosts = recipe.lines.map((line) => {
    let unit: number | null = null;
    if (line.itemId) {
      unit = itemCost(line.itemId);
      if (unit === null || unit <= 0) {
        missing.add(line.itemId);
        unit = null;
      }
    } else if (line.prepId) {
      const prep = recipes.get(line.prepId);
      if (prep && prep.yieldQty > 0) {
        const sub = recipeCost(prep, recipes, itemCost, path);
        for (const m of sub.missing) {
          missing.add(m);
        }
        unit = sub.cost / prep.yieldQty;
      } else {
        missing.add(line.prepId);
      }
    }
    return unit === null ? null : r4(grossQty(line) * unit);
  });
  return {
    cost: r4(lineCosts.reduce<number>((s, c) => s + (c ?? 0), 0)),
    lineCosts,
    missing: [...missing],
  };
}

/** Price without VAT, from a price that includes it. */
export const netOfVat = (price: number, vatRate: number) =>
  r4(price / (1 + Math.max(0, vatRate) / 100));

/** Gross profit margin 0–1 on the price without VAT (null without a price). */
export function grossMargin(price: number, vatRate: number, cost: number) {
  const net = netOfVat(price, vatRate);
  return net > 0 ? r4((net - cost) / net) : null;
}

/**
 * Menu price (VAT included) that gives the target margin, rounded up to
 * a price people expect: 0.10 below €5, 0.50 from €5.
 */
export function suggestedPrice(cost: number, targetGp: number, vatRate: number) {
  if (!(cost > 0) || !(targetGp > 0 && targetGp < 1)) {
    return null;
  }
  const gross = (cost / (1 - targetGp)) * (1 + Math.max(0, vatRate) / 100);
  const step = gross < 5 ? 0.1 : 0.5;
  return Math.round(Math.ceil(gross / step - 1e-9) * step * 100) / 100;
}

/** Usual margin targets of a bar, by recipe category. */
export const DEFAULT_TARGETS: Record<string, number> = {
  cocktail: 0.8,
  wine: 0.7,
  beer: 0.75,
  spirits: 0.8,
  soft: 0.8,
  food: 0.7,
  other: 0.7,
};

export const RECIPE_CATEGORIES = [
  { value: "cocktail", label: "Coquetéis" },
  { value: "wine", label: "Vinho" },
  { value: "beer", label: "Cerveja" },
  { value: "spirits", label: "Destilados" },
  { value: "soft", label: "Sem álcool" },
  { value: "food", label: "Comida" },
  { value: "other", label: "Outros" },
] as const;
