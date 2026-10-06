import type { Txn } from "./types";

const formatters = new Map<string, Intl.NumberFormat>();

/** "€ 1.234,56" — pt-BR style for any statement currency. */
export function money(value: number, currency = "EUR", digits = 2) {
  const key = `${currency}:${digits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, f);
  }
  return f.format(value);
}

/** Compact axis label: "€ 1,2 mil". */
export function moneyAxis(value: number, currency = "EUR") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Currency most lines use. */
export function mainCurrency(txns: Txn[]) {
  const counts = new Map<string, number>();
  for (const t of txns) {
    counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  }
  let best = "EUR";
  let max = 0;
  for (const [c, n] of counts) {
    if (n > max) {
      best = c;
      max = n;
    }
  }
  return best;
}

export function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
