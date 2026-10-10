import { parseMoney } from "@/lib/money";
import { parseCsv } from "@/lib/notes/notion/csv";
import { readInputs, type Vfs } from "@/lib/notes/notion/vfs";
import { blankWine } from "./store";
import type { CellarStyle, CellarWine } from "./types";

/**
 * Reads the wine database exported from Notion: the .zip ("Markdown &
 * CSV"), the database .csv on its own, or single wine pages (.md) with
 * "Property: value" lines. Relations ("Malta (https://app.notion.com/…)")
 * become plain names. Pages and CSV rows of the same wine are merged.
 */

type Props = Map<string, string>;

const NOTION_ID = /([0-9a-f]{32})(?:\.\w+)?$/i;
const RELATION = /([^,]+?)\s*\((?:https?:\/\/[^)]*notion[^)]*)\)/g;
const PROP_LINE = /^([A-Za-zÀ-ÿ][^:\n]{0,60}):\s?(.*)$/;
const MD = /\.md$/i;
const CSV = /\.csv$/i;
const ALL_CSV = /_all\.csv$/i;
const LEADING_SEP = /^[,\s]+/;
const LIST_SEP = /\s*[,;]\s*/;
const NO = /^(no|false|não)$/i;
const URL_PREFIX = /^https?:/i;
const BOM = /^\uFEFF/;
const NON_DIGITS = /\D/g;

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Malta (https://…), Italy (https://…)" → ["Malta", "Italy"] */
export function relationNames(value: string): string[] {
  if (!value.trim()) {
    return [];
  }
  const names = [...value.matchAll(RELATION)].map((m) =>
    (m[1] ?? "").replace(LEADING_SEP, "").trim()
  );
  if (names.length > 0) {
    return names.filter(Boolean);
  }
  return value
    .split(LIST_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

const pick = (p: Props, ...names: string[]) => {
  for (const n of names) {
    const v = p.get(key(n));
    if (v !== undefined && v.trim() !== "") {
      return v.trim();
    }
  }
  return "";
};

const num = (s: string) => {
  if (!s) {
    return null;
  }
  const n = parseMoney(s.replace("%", ""));
  return n === null ? null : n;
};

const STYLE_MAP: Record<string, CellarStyle> = {
  red: "Red",
  tinto: "Red",
  rosso: "Red",
  white: "White",
  branco: "White",
  bianco: "White",
  rose: "Rosé",
  rosato: "Rosé",
  sparkling: "Sparkling",
  espumante: "Sparkling",
  champagne: "Sparkling",
  prosecco: "Sparkling",
  sweet: "Sweet",
  dessert: "Sweet",
  sobremesa: "Sweet",
  orange: "Orange",
  laranja: "Orange",
};

export function toStyle(value: string): CellarStyle {
  const k = key(relationNames(value)[0] ?? value);
  for (const [word, style] of Object.entries(STYLE_MAP)) {
    if (k.includes(word)) {
      return style;
    }
  }
  return value ? "Other" : "Red";
}

function dateOf(s: string) {
  if (!s) {
    return new Date().toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

const isWine = (p: Props) =>
  ["wine id", "grapes", "abv", "price dine in", "style", "tasting notes"].some(
    (k) => p.has(k)
  );

function pricing(p: Props, defaultVat: number) {
  const price = num(pick(p, "Price (Dine-in)", "Price Dine-in", "Price"));
  const priceExVat = num(pick(p, "Price Dine-in ex VAT"));
  // Notion has both prices: derive the VAT rate it used when it can
  let vatRate = num(pick(p, "VAT", "VAT Rate")) ?? defaultVat;
  if (price && priceExVat) {
    vatRate = Math.round((price / priceExVat - 1) * 100);
  }
  if (!(vatRate > 0 && vatRate < 40)) {
    vatRate = defaultVat;
  }
  const cost = num(
    pick(p, "Last Purchase Price ex VAT", "Cost", "Cost ex VAT")
  );
  return {
    priceDineIn: price,
    priceGlass: num(pick(p, "Price (Glass/Takeaway)", "Price Glass", "Glass")),
    vatRate,
    cost: cost && cost > 0 ? cost : null,
  };
}

const firstName = (value: string) => relationNames(value)[0] ?? "";
const positiveOrNull = (s: string) => num(s) || null;

export function wineFromProps(
  title: string,
  p: Props,
  notionId: string,
  defaultVat: number
): CellarWine {
  const vintage = num(pick(p, "Vintage", "Year"));
  return blankWine({
    ...pricing(p, defaultVat),
    wineId: pick(p, "Wine ID", "ID"),
    name: title || pick(p, "Name", "Wine"),
    producer: pick(p, "Producer", "Winery"),
    style: toStyle(pick(p, "Style", "Type", "Colour", "Color")),
    grapes: relationNames(pick(p, "Grapes", "Grape", "Varietal")),
    grapeNotes: pick(p, "Grape Notes"),
    country: firstName(pick(p, "Country", "Origin")),
    region: firstName(pick(p, "Region", "Appellation")),
    vintage: vintage && vintage > 1800 ? vintage : null,
    abv: num(pick(p, "ABV", "Alcohol")),
    volumeMl: num(pick(p, "Volume (ml)", "Volume")) ?? 750,
    ean: pick(p, "Barcode (EAN)", "EAN", "Barcode").replace(NON_DIGITS, ""),
    tapCode: pick(p, "Tap Code", "Bin", "Location"),
    purchaseCount: num(pick(p, "Purchase Count")) ?? 0,
    story: pick(p, "Story", "Description"),
    tastingNotes: pick(p, "Tasting Notes", "Notes"),
    foodPairing: relationNames(pick(p, "Food Pairing", "Pairing")),
    imageUrl: pick(p, "Image URL", "Image", "Photo"),
    wineWeightG: positiveOrNull(pick(p, "Wine Weight (g)")),
    fullBottleG: positiveOrNull(pick(p, "Full Bottle (g)")),
    addedOn: dateOf(pick(p, "Added On", "Created", "Created time")),
    available: !NO.test(pick(p, "Available", "Active")),
    origin: notionId ? `notion:${notionId}` : "",
  });
}

/** Properties of a Notion page exported as Markdown. */
export function parseWinePage(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  let title = "";
  const props: Props = new Map();
  let i = 0;
  while (i < lines.length && !lines[i]?.trim()) {
    i++;
  }
  const first = lines[i] ?? "";
  if (first.startsWith("# ")) {
    title = first.slice(2).trim();
    i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      if (props.size > 0) {
        break; // properties end at the first blank line after them
      }
      continue;
    }
    const m = PROP_LINE.exec(line);
    if (!m) {
      break;
    }
    props.set(key(m[1] ?? ""), m[2] ?? "");
  }
  return { title, props };
}

export interface WineImport {
  wines: CellarWine[];
  /** Local images of the export by wine origin, to show without a URL. */
  media: Map<string, Uint8Array>;
  skipped: number;
}

const isEmpty = (v: unknown) =>
  v === "" || v === null || (Array.isArray(v) && v.length === 0);

/** Wines found so far; a second source of the same wine fills its gaps. */
class Collector {
  private readonly byKey = new Map<string, CellarWine>();
  skipped = 0;

  add(w: CellarWine) {
    const k = w.origin || w.wineId || key(w.name);
    const prev = this.byKey.get(k) ?? this.byKey.get(key(w.name));
    if (!prev) {
      this.byKey.set(k, w);
      this.byKey.set(key(w.name), w);
      return w;
    }
    const target = prev as unknown as Record<string, unknown>;
    for (const [field, value] of Object.entries(w)) {
      if (isEmpty(target[field]) && !isEmpty(value)) {
        target[field] = value;
      }
    }
    return prev;
  }

  wines() {
    return [...new Set(this.byKey.values())];
  }
}

const UNDERSCORES = /_/g;
const decode = (bytes: Uint8Array | undefined) =>
  bytes ? new TextDecoder().decode(bytes) : "";

function findMedia(vfs: Vfs, pagePath: string, mediaPath: string) {
  if (!mediaPath || URL_PREFIX.test(mediaPath)) {
    return null;
  }
  const rel = decodeURIComponent((mediaPath.split(",")[0] ?? "").trim());
  const dir = pagePath.includes("/")
    ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1)
    : "";
  return (
    vfs.get(dir + rel) ??
    [...vfs.entries()].find(([p]) => p.endsWith(rel))?.[1] ??
    null
  );
}

function readPages(
  vfs: Vfs,
  out: Collector,
  media: Map<string, Uint8Array>,
  defaultVat: number
) {
  for (const [path, bytes] of vfs) {
    if (!MD.test(path)) {
      continue;
    }
    const { title, props } = parseWinePage(decode(bytes));
    if (!(title && isWine(props))) {
      out.skipped++;
      continue;
    }
    const id = NOTION_ID.exec(path.replace(UNDERSCORES, ""))?.[1] ?? "";
    const wine = out.add(
      wineFromProps(title, props, id.toLowerCase(), defaultVat)
    );
    const found = findMedia(vfs, path, pick(props, "Media", "Files"));
    if (found) {
      media.set(wine.origin || wine.name, found);
    }
  }
}

function readCsvs(vfs: Vfs, out: Collector, defaultVat: number) {
  const csvs = [...vfs.keys()].filter((p) => CSV.test(p));
  // Notion exports "<db>.csv" and "<db>_all.csv": prefer the full one
  const chosen = csvs.filter(
    (p) => ALL_CSV.test(p) || !csvs.includes(p.replace(CSV, "_all.csv"))
  );
  for (const path of chosen) {
    const [header, ...body] = parseCsv(decode(vfs.get(path)));
    if (!header) {
      continue;
    }
    const keys = header.map((h) => key(h.replace(BOM, "")));
    for (const row of body) {
      const props: Props = new Map(keys.map((k, i) => [k, row[i] ?? ""]));
      const title = row[0]?.trim() ?? "";
      if (title && isWine(props)) {
        out.add(wineFromProps(title, props, "", defaultVat));
      } else {
        out.skipped++;
      }
    }
  }
}

export async function importNotionWines(
  files: File[],
  defaultVat: number
): Promise<WineImport> {
  const vfs = await readInputs(files);
  const out = new Collector();
  const media = new Map<string, Uint8Array>();
  // Pages first: they carry the full text of long properties
  readPages(vfs, out, media, defaultVat);
  readCsvs(vfs, out, defaultVat);
  return { wines: out.wines(), media, skipped: out.skipped };
}
