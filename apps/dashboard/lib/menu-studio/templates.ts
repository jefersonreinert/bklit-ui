import type { MenuStyle, TemplateId } from "./types";

export const TEMPLATES: {
  id: TemplateId;
  name: string;
  description: string;
  style: Omit<MenuStyle, "logo" | "paper" | "landscape">;
}[] = [
  {
    id: "classic",
    name: "Clássico",
    description: "Papel creme, serifa e preços alinhados com pontilhado",
    style: {
      template: "classic",
      background: "#fbf7ef",
      text: "#2b2118",
      accent: "#8a2d1c",
      muted: "#6f6253",
      headingFont: "Playfair Display",
      bodyFont: "EB Garamond",
      columns: 1,
      ornament: "dots",
      uppercaseHeadings: true,
      priceStyle: "right",
      logoHeight: 90,
      showCurrency: false,
      decimals: 2,
      baseSize: 15,
    },
  },
  {
    id: "modern",
    name: "Moderno",
    description: "Fundo branco, sem serifa, duas colunas",
    style: {
      template: "modern",
      background: "#ffffff",
      text: "#111111",
      accent: "#e4572e",
      muted: "#6b6b6b",
      headingFont: "Space Grotesk",
      bodyFont: "Inter",
      columns: 2,
      ornament: "line",
      uppercaseHeadings: true,
      priceStyle: "inline",
      logoHeight: 70,
      showCurrency: false,
      decimals: 0,
      baseSize: 14,
    },
  },
  {
    id: "bistro",
    name: "Bistrô",
    description: "Quadro escuro com títulos manuscritos",
    style: {
      template: "bistro",
      background: "#1f2421",
      text: "#f2efe6",
      accent: "#e8c872",
      muted: "#b7b3a6",
      headingFont: "Caveat",
      bodyFont: "Lora",
      columns: 2,
      ornament: "none",
      uppercaseHeadings: false,
      priceStyle: "right",
      logoHeight: 80,
      showCurrency: false,
      decimals: 0,
      baseSize: 15,
    },
  },
  {
    id: "minimal",
    name: "Minimalista",
    description: "Muito espaço, tipografia fina e preço abaixo",
    style: {
      template: "minimal",
      background: "#f6f6f4",
      text: "#1c1c1c",
      accent: "#1c1c1c",
      muted: "#8a8a8a",
      headingFont: "Jost",
      bodyFont: "Jost",
      columns: 1,
      ornament: "none",
      uppercaseHeadings: true,
      priceStyle: "below",
      logoHeight: 60,
      showCurrency: false,
      decimals: 0,
      baseSize: 14,
    },
  },
  {
    id: "elegant",
    name: "Elegante",
    description: "Verde profundo e dourado, ideal para carta de vinhos",
    style: {
      template: "elegant",
      background: "#14281f",
      text: "#f3ead3",
      accent: "#c9a45c",
      muted: "#b8b29c",
      headingFont: "Cormorant Garamond",
      bodyFont: "Cormorant Garamond",
      columns: 1,
      ornament: "double",
      uppercaseHeadings: true,
      priceStyle: "right",
      logoHeight: 100,
      showCurrency: false,
      decimals: 2,
      baseSize: 16,
    },
  },
];

export const FONTS = [
  "Playfair Display",
  "Cormorant Garamond",
  "EB Garamond",
  "Lora",
  "Libre Baskerville",
  "Crimson Pro",
  "DM Serif Display",
  "Abril Fatface",
  "Cinzel",
  "Inter",
  "Space Grotesk",
  "Jost",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Oswald",
  "Bebas Neue",
  "Josefin Sans",
  "Work Sans",
  "Caveat",
  "Dancing Script",
  "Great Vibes",
  "Amatic SC",
  "Pacifico",
  "IBM Plex Mono",
];

const FONT_NAME = /^[\w\s]+$/;

/** Closest font of the list for a name or category the AI suggested. */
export function closestFont(name: string, category: string): string {
  const exact = FONTS.find((f) => f.toLowerCase() === name.toLowerCase());
  if (exact) {
    return exact;
  }
  if (name && FONT_NAME.test(name)) {
    return name; // any Google Font works; keep what the AI chose
  }
  switch (category.toLowerCase()) {
    case "sans":
    case "sans-serif":
      return "Inter";
    case "script":
      return "Great Vibes";
    case "display":
      return "Abril Fatface";
    case "mono":
      return "IBM Plex Mono";
    default:
      return "Playfair Display";
  }
}

export const PAPER_SIZES = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A5: { w: 148, h: 210 },
  Letter: { w: 216, h: 279 },
} as const;
