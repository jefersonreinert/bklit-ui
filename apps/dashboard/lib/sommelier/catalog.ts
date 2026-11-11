/**
 * The wine list the AI sommelier talks about, merged from three sources:
 * - the By The Glass dispensers (Wine Monitor): what is on tap right now,
 *   with the real dose sizes and prices of the machine;
 * - the POS products of the business: bottle and takeaway prices, colour;
 * - the cellar (Notion wine database): story, tasting notes, pairings.
 * Pure: used by Convex (public menu, AI context) and the tests.
 */

export type WineColor =
  | "red"
  | "white"
  | "rose"
  | "orange"
  | "sparkling"
  | "dessert"
  | "";

export interface SommelierWine {
  id: string;
  name: string;
  producer: string;
  color: WineColor;
  grape: string;
  country: string;
  region: string;
  vintage: string;
  abv: number | null;
  /** In a dispenser now, with wine left to pour. */
  onTap: boolean;
  pours: { ml: number; price: number }[];
  bottle: number | null;
  takeaway: number | null;
  story: string;
  notes: string;
  pairing: string[];
  image: string;
}

export interface FoodItem {
  name: string;
  category: string;
  price: number;
  description: string;
}

/* ------------------------------- the sources ------------------------------ */

export interface WmPositionIn {
  sku?: string;
  wine?: string;
  doses?: number[];
  prices?: number[];
  residueMl?: number;
}

export interface WmWineIn {
  sku?: string;
  name?: string;
  title1?: string;
  title2?: string;
  description?: string;
  origin?: string;
  vintage?: string;
  minResidueMl?: number;
  valid?: boolean;
}

export interface PosProductIn {
  name: string;
  category: string;
  subcategory?: string;
  price: number;
  available: boolean;
  description?: string;
  wine?: {
    color?: string;
    country?: string;
    region?: string;
    grape?: string;
    producer?: string;
    vintage?: string;
    tap?: string;
    takeaway?: number;
    pours?: { ml: number; price: number }[];
  };
}

export interface CellarWineIn {
  name: string;
  producer?: string;
  style?: string;
  grapes?: string[];
  country?: string;
  region?: string;
  vintage?: number | null;
  abv?: number | null;
  story?: string;
  tastingNotes?: string;
  foodPairing?: string[];
  imageUrl?: string;
  available?: boolean;
  priceGlass?: number | null;
  priceDineIn?: number | null;
}

/* --------------------------------- matching -------------------------------- */

const STOP = new Set([
  "de",
  "di",
  "da",
  "del",
  "della",
  "do",
  "la",
  "le",
  "el",
  "the",
  "and",
  "e",
  "y",
  "wine",
  "vino",
  "vinho",
  "vin",
  "doc",
  "docg",
  "dop",
  "igt",
  "igp",
  "aoc",
  "dok",
]);

const ACCENTS = /[̀-ͯ]/g;
const NON_WORD = /[^a-z0-9]+/;

/** Lowercase words without accents, punctuation or filler. */
export function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(ACCENTS, "")
    .toLowerCase()
    .split(NON_WORD)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** 0..1: how much two wine names look like the same wine. */
export function nameScore(a: string, b: string) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!(A.size && B.size)) {
    return 0;
  }
  let common = 0;
  let longest = 0;
  for (const w of A) {
    if (B.has(w)) {
      common++;
      longest = Math.max(longest, w.length);
    }
  }
  // One shared word is a match only when it is distinctive
  if (common === 0 || (common === 1 && longest < 5)) {
    return 0;
  }
  return common / Math.min(A.size, B.size);
}

const MATCH = 0.6;

function best<T>(name: string, list: T[], nameOf: (t: T) => string) {
  let top: T | null = null;
  let score = MATCH;
  for (const item of list) {
    const s = nameScore(name, nameOf(item));
    if (s >= score) {
      score = s;
      top = item;
    }
  }
  return top;
}

/* --------------------------------- helpers -------------------------------- */

const SMALL = new Set(["de", "di", "da", "del", "la", "le", "y", "e", "and"]);

/** "DI MAJO NORANTE GRECO" → "Di Majo Norante Greco". */
export function titleCase(s: string) {
  if (s !== s.toUpperCase()) {
    return s.trim();
  }
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

const COLOR_WORDS: [WineColor, RegExp][] = [
  ["sparkling", /sparkl|espum|prosecco|champagne|cava|cr[eé]mant|frizz|spumante/i],
  ["rose", /ros[eé]|rosat|rosado|rosato|blush/i],
  ["orange", /orange|laranja|macerat|skin.contact|ramato/i],
  ["dessert", /dessert|sweet|sobremesa|port\b|porto|moscato|passito|sauternes|tokaj/i],
  ["white", /white|branco|blanc|bianco|blanco/i],
  ["red", /\bred\b|tinto|rouge|rosso/i],
];

export function colorOf(...hints: (string | undefined)[]): WineColor {
  const text = hints.filter(Boolean).join(" ");
  for (const [color, re] of COLOR_WORDS) {
    if (re.test(text)) {
      return color;
    }
  }
  return "";
}

const knownColor = (c: string | undefined): WineColor =>
  c && ["red", "white", "rose", "orange", "sparkling", "dessert"].includes(c)
    ? (c as WineColor)
    : "";

const cellarColor: Record<string, WineColor> = {
  Red: "red",
  White: "white",
  "Rosé": "rose",
  Sparkling: "sparkling",
  Sweet: "dessert",
  Orange: "orange",
};

const clean = (s: string | undefined) => (s ?? "").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

function poursOf(doses: number[] = [], prices: number[] = []) {
  return doses
    .map((ml, i) => ({ ml, price: r2(Number(prices[i] ?? 0)) }))
    .filter((p) => p.ml > 0 && p.price > 0)
    .sort((a, b) => a.ml - b.ml);
}

/* ---------------------------------- build --------------------------------- */

export interface CatalogInput {
  positions: WmPositionIn[];
  wmWines: WmWineIn[];
  products: PosProductIn[];
  cellar: CellarWineIn[];
}

/**
 * Every wine a guest can order now: available POS wines plus whatever is
 * in the dispensers (even when the POS doesn't list it), enriched with
 * the cellar notes. On tap first, then by colour and name.
 */
export function buildCatalog(input: CatalogInput): SommelierWine[] {
  const out: SommelierWine[] = [];
  const posWines = input.products.filter((p) => p.wine);

  for (const p of posWines) {
    const w = p.wine ?? {};
    out.push({
      id: `pos:${p.name}`,
      name: p.name.trim(),
      producer: clean(w.producer),
      color: knownColor(w.color) || colorOf(p.category, p.subcategory, p.name),
      grape: clean(w.grape),
      country: clean(w.country),
      region: clean(w.region),
      vintage: clean(w.vintage),
      abv: null,
      onTap: false,
      pours: (w.pours ?? []).filter((x) => x.price > 0).sort((a, b) => a.ml - b.ml),
      bottle: p.price > 0 ? r2(p.price) : null,
      takeaway: w.takeaway ? r2(w.takeaway) : null,
      story: "",
      notes: clean(p.description),
      pairing: [],
      image: "",
    });
  }
  const available = new Set(
    posWines.filter((p) => p.available).map((p) => `pos:${p.name}`)
  );

  // Dispensers: what is really pourable right now
  // The portal reuses SKUs: the wine must also carry the same name
  const infoOf = (pos: WmPositionIn) => {
    const same = input.wmWines.filter((w) => w.sku && String(w.sku) === String(pos.sku));
    const name = clean(pos.wine);
    return (
      same.find((w) => clean(w.name) === name) ??
      best(name, same, (w) => clean(w.name) || clean(w.title1))
    );
  };
  for (const pos of input.positions) {
    const name = clean(pos.wine);
    if (!name) {
      continue;
    }
    const info = pos.sku ? infoOf(pos) ?? undefined : undefined;
    const minLeft = info?.minResidueMl ?? 15;
    if ((pos.residueMl ?? 0) <= minLeft || info?.valid === false) {
      continue;
    }
    const pours = poursOf(pos.doses, pos.prices);
    let entry = best(name, out, (e) => e.name);
    if (!entry) {
      entry = {
        id: `tap:${pos.sku ?? name}`,
        name: titleCase(clean(info?.title1) || name),
        // The portal's "producer" is the importer: not shown
        producer: "",
        color: colorOf(name, info?.title2, info?.description),
        grape: titleCase(clean(info?.title2) || clean(info?.description)),
        country: titleCase(clean(info?.origin)),
        region: "",
        vintage: clean(info?.vintage),
        abv: null,
        onTap: true,
        pours,
        bottle: null,
        takeaway: null,
        story: "",
        notes: "",
        pairing: [],
        image: "",
      };
      out.push(entry);
    }
    entry.onTap = true;
    available.add(entry.id);
    if (pours.length) {
      entry.pours = pours;
    }
    entry.grape ||= titleCase(clean(info?.title2) || clean(info?.description));
    entry.country ||= titleCase(clean(info?.origin));
  }

  // Cellar notes (Notion): the owner's words win over general knowledge
  for (const c of input.cellar) {
    if (c.available === false) {
      continue;
    }
    const entry = best(c.name, out, (e) => e.name);
    if (!entry) {
      continue;
    }
    entry.producer ||= clean(c.producer);
    entry.color ||= cellarColor[c.style ?? ""] ?? "";
    entry.grape = (c.grapes ?? []).join(", ") || entry.grape;
    entry.country ||= clean(c.country);
    entry.region ||= clean(c.region);
    entry.vintage ||= c.vintage ? String(c.vintage) : "";
    entry.abv = c.abv ?? entry.abv;
    entry.story = clean(c.story);
    entry.notes = clean(c.tastingNotes) || entry.notes;
    entry.pairing = (c.foodPairing ?? []).map(clean).filter(Boolean);
    entry.image = clean(c.imageUrl);
  }

  const order: WineColor[] = ["sparkling", "white", "rose", "orange", "red", "dessert", ""];
  return out
    .filter((e) => available.has(e.id))
    .sort(
      (a, b) =>
        Number(b.onTap) - Number(a.onTap) ||
        order.indexOf(a.color) - order.indexOf(b.color) ||
        a.name.localeCompare(b.name)
    );
}

const DRINKS =
  /\b(wines?|vinhos?|vino|beers?|cervejas?|drinks?|bebidas?|cocktails?|gin|whiske?y|rum|shots?|vodka|tequila|liqueurs?|spirits?|soft|juices?|water|coffee|caf[eé]|tea)\b/i;

/** Dishes and snacks for pairings: available POS products that aren't wine. */
export function foodOf(products: PosProductIn[]): FoodItem[] {
  return products
    .filter((p) => p.available && !p.wine && p.price > 0)
    .filter((p) => !DRINKS.test(`${p.category} ${p.subcategory ?? ""}`))
    .map((p) => ({
      name: p.name.trim(),
      category: p.category,
      price: r2(p.price),
      description: clean(p.description),
    }))
    .slice(0, 150);
}

/* ------------------------------ text for the AI ---------------------------- */

const COLOR_NAME: Record<WineColor, string> = {
  red: "red",
  white: "white",
  rose: "rosé",
  orange: "orange",
  sparkling: "sparkling",
  dessert: "dessert",
  "": "",
};

const price = (n: number, currency: string) =>
  `${currency}${n.toFixed(2)}`;

/** One line per wine: compact, but with everything the sommelier needs. */
export function catalogText(
  wines: SommelierWine[],
  food: FoodItem[],
  currency = "€"
) {
  const lines = wines.map((w) => {
    const parts = [
      w.name,
      COLOR_NAME[w.color],
      w.grape && `grape: ${w.grape}`,
      [w.producer && `by ${w.producer}`, [w.region, w.country].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(", "),
      w.vintage && `vintage ${w.vintage}`,
      w.abv ? `${w.abv}% abv` : "",
      w.pours.length
        ? `${w.onTap ? "ON TAP now" : "by the glass"}: ${w.pours
            .map((p) => `${p.ml} ml ${price(p.price, currency)}`)
            .join(", ")}`
        : w.onTap
          ? "ON TAP now"
          : "",
      w.bottle ? `bottle at the table ${price(w.bottle, currency)}` : "",
      w.takeaway ? `bottle to take away ${price(w.takeaway, currency)}` : "",
      w.notes && `house tasting notes: ${w.notes}`,
      w.story && `story: ${w.story}`,
      w.pairing.length ? `house pairings: ${w.pairing.join("; ")}` : "",
    ].filter(Boolean);
    return `- ${parts.join(" | ")}`;
  });
  const dishes = food.map(
    (f) =>
      `- ${f.name} (${f.category}) ${price(f.price, currency)}${f.description ? `: ${f.description}` : ""}`
  );
  return [
    `WINE LIST (${wines.length} wines; ${wines.filter((w) => w.onTap).length} on tap now):`,
    ...lines,
    "",
    dishes.length ? `FOOD MENU (${dishes.length} items):` : "FOOD MENU: not available.",
    ...dishes,
  ].join("\n");
}

/** Shown to guests next to the conversation (no costs, no stock). */
export type PublicWine = Pick<
  SommelierWine,
  | "id"
  | "name"
  | "producer"
  | "color"
  | "grape"
  | "country"
  | "region"
  | "onTap"
  | "pours"
  | "bottle"
  | "image"
>;

export const publicWine = (w: SommelierWine): PublicWine => ({
  id: w.id,
  name: w.name,
  producer: w.producer,
  color: w.color,
  grape: w.grape,
  country: w.country,
  region: w.region,
  onTap: w.onTap,
  pours: w.pours,
  bottle: w.bottle,
  image: w.image,
});

/** Wines the answer talks about, in the order they are mentioned. */
export function mentioned<T extends { name: string }>(answer: string, wines: T[]) {
  const text = ` ${words(answer).join(" ")} `;
  const hits: { w: T; at: number }[] = [];
  for (const w of wines) {
    const ws = words(w.name);
    if (!ws.length) {
      continue;
    }
    // The full name, or its first two distinctive words
    const probes = [ws.join(" "), ws.slice(0, 2).join(" ")].filter(
      (p) => p.length >= 5
    );
    let at = -1;
    for (const p of probes) {
      const i = text.indexOf(` ${p} `);
      if (i !== -1 && (at === -1 || i < at)) {
        at = i;
      }
    }
    if (at !== -1) {
      hits.push({ w, at });
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.w);
}
