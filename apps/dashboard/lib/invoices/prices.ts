import { basePrice } from "./match";
import type { Ingredient, InvoiceData } from "./types";

/**
 * Price history per ingredient across every company, location and
 * supplier, in price per kg / litre / unit (without VAT).
 */

export interface PricePoint {
  date: string;
  price: number;
  /** Base units bought (kg, l, un). */
  amount: number;
  supplierId: string;
  companyId: string;
  locationId: string;
  invoiceId: string;
  description: string;
  currency: string;
}

export interface SupplierQuote {
  supplierId: string;
  latest: number;
  latestDate: string;
  min: number;
  avg: number;
  amount: number;
}

export interface IngredientPrices {
  ingredient: Ingredient;
  points: PricePoint[];
  bySupplier: SupplierQuote[];
  best: SupplierQuote | null;
  latest: PricePoint | null;
  /** Change of the latest price against the one before it, percent. */
  change: number | null;
  /** What buying everything at the best current price would have saved. */
  savings: number;
  spend: number;
  currency: string;
  companies: string[];
}

interface Filter {
  companyId?: string;
  since?: string;
}

function collectPoints(data: InvoiceData, filter: Filter) {
  const points = new Map<string, PricePoint[]>();
  const invoices = data.invoices.filter(
    (inv) =>
      (!filter.companyId || inv.companyId === filter.companyId) &&
      (!filter.since || inv.date >= filter.since)
  );
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const price = basePrice(line);
      if (!(line.ingredientId && price)) {
        continue;
      }
      const list = points.get(line.ingredientId) ?? [];
      list.push({
        date: inv.date,
        price,
        amount: line.quantity * line.packSize,
        supplierId: inv.supplierId,
        companyId: inv.companyId,
        locationId: inv.locationId,
        invoiceId: inv.id,
        description: line.description,
        currency: inv.currency,
      });
      points.set(line.ingredientId, list);
    }
  }
  return points;
}

function quote(supplierId: string, ps: PricePoint[]): SupplierQuote {
  const amount = ps.reduce((n, p) => n + p.amount, 0);
  const spent = ps.reduce((n, p) => n + p.amount * p.price, 0);
  const last = ps.at(-1) as PricePoint;
  return {
    supplierId,
    latest: last.price,
    latestDate: last.date,
    min: Math.min(...ps.map((p) => p.price)),
    avg: amount ? spent / amount : last.price,
    amount,
  };
}

function summarize(
  ingredient: Ingredient,
  list: PricePoint[]
): IngredientPrices {
  const groups = new Map<string, PricePoint[]>();
  for (const p of list) {
    groups.set(p.supplierId, [...(groups.get(p.supplierId) ?? []), p]);
  }
  const bySupplier = [...groups.entries()]
    .map(([id, ps]) => quote(id, ps))
    .sort((a, b) => a.latest - b.latest);
  const best = bySupplier[0] ?? null;
  const latest = list.at(-1) ?? null;
  const previous = list.at(-2) ?? null;
  const bestPrice = best?.latest ?? Number.POSITIVE_INFINITY;
  return {
    ingredient,
    points: list,
    bySupplier,
    best,
    latest,
    change:
      latest && previous && previous.price > 0
        ? ((latest.price - previous.price) / previous.price) * 100
        : null,
    savings: list.reduce(
      (n, p) => n + Math.max(0, (p.price - bestPrice) * p.amount),
      0
    ),
    spend: list.reduce((n, p) => n + p.amount * p.price, 0),
    currency: latest?.currency ?? "EUR",
    companies: [...new Set(list.map((p) => p.companyId))],
  };
}

export function ingredientPrices(
  data: InvoiceData,
  filter: Filter = {}
): IngredientPrices[] {
  const points = collectPoints(data, filter);
  return data.ingredients
    .map((ing) => {
      const list = (points.get(ing.id) ?? []).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      return list.length ? summarize(ing, list) : null;
    })
    .filter((x): x is IngredientPrices => x !== null)
    .sort((a, b) => b.spend - a.spend);
}

export const UNIT_LABEL = { kg: "kg", l: "L", un: "un" } as const;
