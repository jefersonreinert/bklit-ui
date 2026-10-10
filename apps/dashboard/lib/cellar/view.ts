import { marginAlert, PRICE_BANDS, priceBand, priceMargin } from "./margins";
import {
  CELLAR_STYLES,
  type CellarStyle,
  type CellarWine,
  styleLabel,
} from "./types";

export const ALL = "todos";
export type GroupBy = "none" | "style" | "grape" | "country" | "price";

export interface CellarFilter {
  query: string;
  style: string;
  grape: string;
  country: string;
  band: string;
}

const COMBINING = /[\u0300-\u036f]/g;
const fold = (text: string) =>
  text.normalize("NFD").replace(COMBINING, "").toLowerCase();

const searchText = (w: CellarWine) =>
  fold(
    [
      w.name,
      w.producer,
      w.region,
      w.country,
      w.wineId,
      w.ean,
      ...w.grapes,
      ...w.foodPairing,
    ].join(" ")
  );

const matches = (value: string, wanted: string) =>
  wanted === ALL || value === wanted;

export function filterWines(wines: CellarWine[], f: CellarFilter) {
  const q = fold(f.query.trim());
  return wines
    .filter(
      (w) =>
        matches(w.style, f.style) &&
        (f.grape === ALL || w.grapes.includes(f.grape)) &&
        matches(w.country, f.country) &&
        matches(priceBand(w.priceDineIn) ?? "", f.band) &&
        (q === "" || searchText(w).includes(q))
    )
    .sort(
      (a, b) =>
        (a.priceDineIn ?? 0) - (b.priceDineIn ?? 0) ||
        a.name.localeCompare(b.name)
    );
}

function groupKeys(w: CellarWine, by: GroupBy): string[] {
  switch (by) {
    case "grape":
      return w.grapes.length ? w.grapes : ["Sem uva"];
    case "country":
      return [w.country || "Sem país"];
    case "price":
      return [priceBand(w.priceDineIn) ?? "Sem preço"];
    default:
      return [w.style];
  }
}

function groupOrder(by: GroupBy, keys: string[]): string[] {
  if (by === "price") {
    return PRICE_BANDS.map((b) => b.value as string);
  }
  if (by === "style") {
    return CELLAR_STYLES.map((s) => s.value as string);
  }
  return [...keys].sort();
}

function groupTitle(by: GroupBy, key: string) {
  if (by === "style") {
    return styleLabel(key as CellarStyle);
  }
  if (by === "price") {
    return PRICE_BANDS.find((b) => b.value === key)?.label ?? key;
  }
  return key;
}

/** Sections of the list: by style, grape (a blend shows under each), etc. */
export function groupWines(wines: CellarWine[], by: GroupBy) {
  if (by === "none") {
    return [{ key: "all", title: "", wines }];
  }
  const map = new Map<string, CellarWine[]>();
  for (const w of wines) {
    for (const k of groupKeys(w, by)) {
      map.set(k, [...(map.get(k) ?? []), w]);
    }
  }
  const order = groupOrder(by, [...map.keys()]);
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, ws]) => ({ key, title: groupTitle(by, key), wines: ws }));
}

export function cellarStats(wines: CellarWine[], minMargin: number) {
  const margins = wines
    .map((w) => priceMargin(w.priceDineIn, w.cost, w.vatRate)?.margin)
    .filter((m): m is number => typeof m === "number");
  const alerts = wines.map((w) => marginAlert(w, minMargin));
  return {
    total: wines.length,
    grapes: new Set(wines.flatMap((w) => w.grapes)).size,
    countries: new Set(wines.map((w) => w.country).filter(Boolean)).size,
    noCost: alerts.filter((a) => a === "no-cost").length,
    low: alerts.filter((a) => a === "low").length,
    avgMargin: margins.length
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : null,
  };
}

export const formatPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
