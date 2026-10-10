/**
 * Wine catalog (adega) shaped after the restaurant's Notion wine database:
 * one record per wine with style, grapes, origin, prices with VAT, story,
 * tasting notes and the purchase cost that comes from supplier invoices.
 */

export type CellarStyle =
  | "Red"
  | "White"
  | "Rosé"
  | "Sparkling"
  | "Sweet"
  | "Orange"
  | "Other";

export const CELLAR_STYLES: { value: CellarStyle; label: string }[] = [
  { value: "Red", label: "Tinto" },
  { value: "White", label: "Branco" },
  { value: "Rosé", label: "Rosé" },
  { value: "Sparkling", label: "Espumante" },
  { value: "Sweet", label: "Sobremesa" },
  { value: "Orange", label: "Laranja" },
  { value: "Other", label: "Outro" },
];

export const styleLabel = (s: CellarStyle) =>
  CELLAR_STYLES.find((x) => x.value === s)?.label ?? s;

export interface CellarWine {
  id: string;
  /** "WINE-63" in Notion. */
  wineId: string;
  name: string;
  producer: string;
  style: CellarStyle;
  grapes: string[];
  /** Free text about the blend ("confirm blend on label"). */
  grapeNotes: string;
  country: string;
  region: string;
  vintage: number | null;
  abv: number | null;
  volumeMl: number;
  ean: string;
  /** Position in the cellar / tap ("D4.1#7"). */
  tapCode: string;
  /** Dine-in bottle price, VAT included. */
  priceDineIn: number | null;
  /** Glass or takeaway price, VAT included. */
  priceGlass: number | null;
  vatRate: number;
  /** Last purchase price per bottle without VAT (from invoices or Notion). */
  cost: number | null;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  lastSupplier: string;
  story: string;
  tastingNotes: string;
  foodPairing: string[];
  imageUrl: string;
  /** Bottle weights used by the bar to count open bottles. */
  wineWeightG: number | null;
  fullBottleG: number | null;
  addedOn: string;
  available: boolean;
  /** Where it was imported from ("notion:<page id>"). */
  origin: string;
}

export interface CellarData {
  wines: CellarWine[];
  currency: string;
  /** Default VAT used when a price has no explicit rate (Malta: 18%). */
  defaultVat: number;
  /** Alert when the dine-in margin falls below this (percent). */
  minMargin: number;
}

export const EMPTY_CELLAR: CellarData = {
  wines: [],
  currency: "EUR",
  defaultVat: 18,
  minMargin: 65,
};
