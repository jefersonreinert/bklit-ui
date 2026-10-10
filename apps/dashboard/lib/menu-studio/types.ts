/**
 * Menus built in the menu editor: content (sections and items, or wine
 * lists generated live from the cellar) plus a visual style. One renderer
 * (render.ts) turns a menu into the preview, the PDF and the editable
 * HTML, so all three always look the same.
 */

export type TemplateId =
  | "classic"
  | "modern"
  | "bistro"
  | "minimal"
  | "elegant";
export type Ornament = "none" | "line" | "dots" | "double";
export type PriceStyle = "right" | "inline" | "below";
export type Paper = "A4" | "A3" | "A5" | "Letter";
export type WineGrouping = "style" | "grape" | "country" | "price";

export interface MenuStyle {
  template: TemplateId;
  background: string;
  text: string;
  accent: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  columns: 1 | 2 | 3;
  ornament: Ornament;
  uppercaseHeadings: boolean;
  priceStyle: PriceStyle;
  paper: Paper;
  landscape: boolean;
  /** Logo as a data URL (cropped from a photo or uploaded). */
  logo: string;
  logoHeight: number;
  showCurrency: boolean;
  decimals: 0 | 2;
  baseSize: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number | null;
  secondaryPrice: number | null;
  secondaryLabel: string;
  tags: string[];
  hidden: boolean;
  /** Extra wine details shown under the name. */
  details: string;
}

export interface WineSource {
  groupBy: WineGrouping;
  /** Styles to include; empty = all. */
  styles: string[];
  /** Show "glass" price next to the bottle price. */
  showGlass: boolean;
  glassLabel: string;
  bottleLabel: string;
  showGrapes: boolean;
  showNotes: boolean;
}

export interface MenuSection {
  id: string;
  title: string;
  note: string;
  kind: "food" | "wine" | "drinks" | "other";
  items: MenuItem[];
  /** Wine list generated from the cellar instead of fixed items. */
  wineSource: WineSource | null;
  breakBefore: boolean;
}

export interface MenuDoc {
  id: string;
  name: string;
  restaurantName: string;
  tagline: string;
  footer: string;
  currency: string;
  language: string;
  style: MenuStyle;
  sections: MenuSection[];
  updatedAt: number;
}

export interface MenuData {
  menus: MenuDoc[];
}

/** What Claude returns for a photographed menu (lib/server/extract.ts). */
export interface ExtractedMenu {
  restaurantName: string;
  tagline: string;
  currency: string;
  language: string;
  style: {
    background: string;
    text: string;
    accent: string;
    muted: string;
    headingFont: { category: string; closestGoogleFont: string };
    bodyFont: { category: string; closestGoogleFont: string };
    columns: number;
    layout: string;
    ornament: string;
    uppercaseHeadings: boolean;
    priceStyle: string;
  };
  logo: {
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  sections: {
    title: string;
    note: string;
    kind: string;
    items: {
      name: string;
      description: string;
      price: number | null;
      secondaryPrice: number | null;
      secondaryLabel: string;
      tags: string[];
      grapes: string[];
      country: string;
      region: string;
      vintage: number | null;
      style: string;
    }[];
  }[];
}
