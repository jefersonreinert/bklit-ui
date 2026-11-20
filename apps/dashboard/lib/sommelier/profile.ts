/**
 * Wine sheet of the AI sommelier (like a winery's technical sheet):
 * the facts of the house catalog plus a profile written once by Claude
 * per wine and language, then kept (convex/sommelier.ts profiles).
 * Pure: shared by the server route, Convex and the guest page.
 */

import type { SommelierWine } from "./catalog";

export interface WineProfile {
  /** One or two sentences that sell the wine. */
  summary: string;
  /** Quick view: a few words each, spot on. */
  short: { taste: string; pairing: string; highlight: string };
  type: string;
  origin: string;
  appellation: string;
  grapes: string;
  winery: string;
  tasting: { colour: string; nose: string; palate: string };
  pairing: string;
  /** 1–5 scales (0 = unknown). */
  body: number;
  tannin: number;
  acidity: number;
  sweetness: number;
  serving: string;
  decanting: string;
  ageing: string;
  vineyards: string;
  soils: string;
  climate: string;
  winemaking: string;
  /** "yes" / "no" / "" when unknown. */
  vegan: string;
  styles: string[];
}

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const scale = (v: unknown) => {
  const n = typeof v === "number" ? Math.round(v) : Number.NaN;
  return n >= 1 && n <= 5 ? n : 0;
};

/** Validates what the model returned (unknown fields stay empty). */
export function cleanProfile(raw: unknown): WineProfile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const t = (r.tasting ?? {}) as Record<string, unknown>;
  const short = (r.short ?? {}) as Record<string, unknown>;
  const vegan = text(r.vegan, 8).toLowerCase();
  const p: WineProfile = {
    summary: text(r.summary, 400),
    short: {
      taste: text(short.taste, 90),
      pairing: text(short.pairing, 90),
      highlight: text(short.highlight, 90),
    },
    type: text(r.type, 60),
    origin: text(r.origin, 120),
    appellation: text(r.appellation, 120),
    grapes: text(r.grapes, 160),
    winery: text(r.winery, 200),
    tasting: {
      colour: text(t.colour, 200),
      nose: text(t.nose, 400),
      palate: text(t.palate, 400),
    },
    pairing: text(r.pairing, 400),
    body: scale(r.body),
    tannin: scale(r.tannin),
    acidity: scale(r.acidity),
    sweetness: scale(r.sweetness),
    serving: text(r.serving, 60),
    decanting: text(r.decanting, 120),
    ageing: text(r.ageing, 160),
    vineyards: text(r.vineyards, 300),
    soils: text(r.soils, 300),
    climate: text(r.climate, 300),
    winemaking: text(r.winemaking, 400),
    vegan: vegan === "yes" || vegan === "no" ? vegan : "",
    styles: Array.isArray(r.styles)
      ? r.styles
          .map((s) => text(s, 30))
          .filter(Boolean)
          .slice(0, 5)
      : [],
  };
  return p.summary || p.tasting.nose || p.pairing ? p : null;
}

/** First JSON object in a model answer (tolerates code fences). */
export function parseProfile(answer: string): WineProfile | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return cleanProfile(JSON.parse(answer.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export const PROFILE_SYSTEM = `You write the technical sheet of one wine for a wine bar's guests, like the sheet a winery prints.
Answer with ONE JSON object only, no other text, with these keys:
summary, short {taste, pairing, highlight}, type, origin, appellation, grapes, winery, tasting {colour, nose, palate}, pairing,
body, tannin, acidity, sweetness (integers 1-5), serving, decanting, ageing,
vineyards, soils, climate, winemaking, vegan ("yes" | "no" | ""), styles (up to 5 short tags).
Rules:
- The house notes and facts given are true: use them first and never contradict them.
- Add what is well known about this wine, producer, grape and region. When you are not sure of a fact about this exact wine (blend percentages, oak months, soil, vegan certification), describe what is typical for the grape and region in general words, or leave the field "" — never invent precise numbers, awards or certifications.
- short is the quick view a guest reads in two seconds: taste = the main flavours (max 8 words), pairing = 2-3 foods (max 8 words), highlight = the one thing that makes this wine special (max 10 words). No full sentences, no wine name.
- Short, warm, concrete sentences a guest reads on a phone. serving like "16–18 °C".
- Write every text value in the requested language.`;

/** The user message for one wine. */
export function profilePrompt(w: SommelierWine, language: string) {
  const facts = [
    `Wine: ${w.name}`,
    w.producer && `Producer: ${w.producer}`,
    w.color && `Colour: ${w.color}`,
    w.grape && `Grape(s): ${w.grape}`,
    (w.region || w.country) &&
      `Origin: ${[w.region, w.country].filter(Boolean).join(", ")}`,
    w.vintage && `Vintage: ${w.vintage}`,
    w.abv && `Alcohol: ${w.abv}%`,
    w.story && `House story: ${w.story}`,
    w.notes && `House tasting notes: ${w.notes}`,
    w.pairing.length && `House pairings: ${w.pairing.join("; ")}`,
  ].filter(Boolean);
  return `${facts.join("\n")}\n\nLanguage: ${language}`;
}
