const formatters = new Map<string, Intl.NumberFormat>();

/** Money in any currency (the menu, cellar and invoices use EUR, BRL…). */
export function formatMoney(value: number, currency = "EUR", digits = 2) {
  const key = `${currency}|${digits}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: currency || "EUR",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      f = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    formatters.set(key, f);
  }
  return f.format(value);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "€32.00", "32,00 €", "R$ 1.234,56", "1,234.5" → number. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== "string") {
    return null;
  }
  let s = input.replace(/[^\d.,-]/g, "");
  if (!s || s === "-") {
    return null;
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
