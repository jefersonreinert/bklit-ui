const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const brlCents = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat("pt-BR");

export const formatBRL = (value: number) => brl.format(value);
export const formatBRLCents = (value: number) => brlCents.format(value);
export const formatCompact = (value: number) => compact.format(value);
export const formatInt = (value: number) => integer.format(value);
export const formatPercent = (value: number, digits = 1) =>
  `${value.toFixed(digits).replace(".", ",")}%`;

export const formatMonth = (date: Date) =>
  date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

export const formatDay = (date: Date) =>
  date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Currency options for NumberFlow-based chart labels (ChartStatFlow, Gauge, centers). */
export const brlFormatOptions = {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
} as const;
