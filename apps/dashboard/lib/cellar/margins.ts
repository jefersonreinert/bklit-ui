import { round2 } from "@/lib/money";
import type { CellarWine } from "./types";

export interface PriceMargin {
  /** Price without VAT. */
  exVat: number;
  /** Gross profit per sale (ex VAT − cost). */
  profit: number | null;
  /** Gross margin on the ex-VAT price, percent. */
  margin: number | null;
  /** ex-VAT price ÷ cost. */
  markup: number | null;
}

export function priceMargin(
  price: number | null,
  cost: number | null,
  vatRate: number
): PriceMargin | null {
  if (price === null || price <= 0) {
    return null;
  }
  const exVat = round2(price / (1 + vatRate / 100));
  if (cost === null || cost <= 0) {
    return { exVat, profit: null, margin: null, markup: null };
  }
  const profit = round2(exVat - cost);
  return {
    exVat,
    profit,
    margin: round2((profit / exVat) * 100),
    markup: round2(exVat / cost),
  };
}

export type MarginAlert = "no-cost" | "no-price" | "low" | "ok";

export function marginAlert(w: CellarWine, minMargin: number): MarginAlert {
  if (w.priceDineIn === null) {
    return "no-price";
  }
  if (w.cost === null || w.cost <= 0) {
    return "no-cost";
  }
  const m = priceMargin(w.priceDineIn, w.cost, w.vatRate);
  return m?.margin !== null && m?.margin !== undefined && m.margin < minMargin
    ? "low"
    : "ok";
}

export const ALERT_LABEL: Record<MarginAlert, string> = {
  "no-cost": "Sem custo ainda",
  "no-price": "Sem preço",
  low: "Margem baixa",
  ok: "Margem ok",
};

/** Price that reaches a target margin for a cost (VAT included). */
export function priceForMargin(cost: number, margin: number, vatRate: number) {
  const exVat = cost / (1 - margin / 100);
  return round2(exVat * (1 + vatRate / 100));
}

export const PRICE_BANDS = [
  { value: "0-25", label: "Até 25", min: 0, max: 25 },
  { value: "25-40", label: "25 – 40", min: 25, max: 40 },
  { value: "40-60", label: "40 – 60", min: 40, max: 60 },
  { value: "60-100", label: "60 – 100", min: 60, max: 100 },
  {
    value: "100+",
    label: "Acima de 100",
    min: 100,
    max: Number.POSITIVE_INFINITY,
  },
] as const;

export const priceBand = (price: number | null) =>
  price === null
    ? null
    : (PRICE_BANDS.find((b) => price >= b.min && price < b.max)?.value ?? null);
