/**
 * Google Fonts offered in the design editor, grouped like Canva's font
 * menu. Any other Google Font name the AI picks also works: fonts load
 * by name from fonts.googleapis.com.
 */

export interface FontOption {
  family: string;
  category: "serif" | "sans" | "display" | "script" | "mono";
}

export const DESIGN_FONTS: FontOption[] = [
  { family: "Playfair Display", category: "serif" },
  { family: "Cormorant Garamond", category: "serif" },
  { family: "EB Garamond", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "Libre Baskerville", category: "serif" },
  { family: "Crimson Pro", category: "serif" },
  { family: "DM Serif Display", category: "serif" },
  { family: "Cinzel", category: "serif" },
  { family: "Marcellus", category: "serif" },
  { family: "Prata", category: "serif" },
  { family: "Bodoni Moda", category: "serif" },
  { family: "Fraunces", category: "serif" },
  { family: "Inter", category: "sans" },
  { family: "Montserrat", category: "sans" },
  { family: "Poppins", category: "sans" },
  { family: "Raleway", category: "sans" },
  { family: "Jost", category: "sans" },
  { family: "Josefin Sans", category: "sans" },
  { family: "Work Sans", category: "sans" },
  { family: "Space Grotesk", category: "sans" },
  { family: "Nunito", category: "sans" },
  { family: "Quicksand", category: "sans" },
  { family: "Oswald", category: "display" },
  { family: "Bebas Neue", category: "display" },
  { family: "Abril Fatface", category: "display" },
  { family: "Anton", category: "display" },
  { family: "Alfa Slab One", category: "display" },
  { family: "Righteous", category: "display" },
  { family: "Lobster", category: "display" },
  { family: "Bungee", category: "display" },
  { family: "Great Vibes", category: "script" },
  { family: "Dancing Script", category: "script" },
  { family: "Pacifico", category: "script" },
  { family: "Caveat", category: "script" },
  { family: "Sacramento", category: "script" },
  { family: "Satisfy", category: "script" },
  { family: "Allura", category: "script" },
  { family: "Amatic SC", category: "script" },
  { family: "Permanent Marker", category: "script" },
  { family: "IBM Plex Mono", category: "mono" },
  { family: "Space Mono", category: "mono" },
];

export const FONT_CATEGORIES: Record<FontOption["category"], string> = {
  serif: "Serifadas",
  sans: "Sem serifa",
  display: "Títulos",
  script: "Manuscritas",
  mono: "Monoespaçadas",
};

const FONT_NAME = /^[A-Za-z0-9 ]{2,40}$/;

const FALLBACK: Record<string, string> = {
  serif: "Playfair Display",
  sans: "Montserrat",
  "sans-serif": "Montserrat",
  display: "Bebas Neue",
  script: "Great Vibes",
  handwriting: "Caveat",
  mono: "IBM Plex Mono",
};

/** The font to use for a name/category the AI suggested. */
export function resolveFont(name: string, category = ""): string {
  const clean = name.trim();
  const known = DESIGN_FONTS.find(
    (f) => f.family.toLowerCase() === clean.toLowerCase()
  );
  if (known) {
    return known.family;
  }
  if (FONT_NAME.test(clean)) {
    return clean;
  }
  return FALLBACK[category.toLowerCase()] ?? "Playfair Display";
}

const GENERIC: Record<FontOption["category"], string> = {
  serif: "serif",
  sans: "sans-serif",
  display: "sans-serif",
  script: "cursive",
  mono: "monospace",
};

/** CSS font stack with a generic fallback while the web font loads. */
export function fontStack(family: string) {
  const cat = DESIGN_FONTS.find((f) => f.family === family)?.category;
  return `"${family}", ${cat ? GENERIC[cat] : "serif"}`;
}

const SPACES = / /g;

/**
 * Google Fonts stylesheet URLs for the given families. Each family gets a
 * plain request (always valid) plus one with bold/italic, which Google
 * rejects for fonts that lack those styles — the plain one still loads.
 */
export function googleFontsUrls(families: Iterable<string>) {
  const urls: string[] = [];
  for (const f of new Set(families)) {
    if (!FONT_NAME.test(f)) {
      continue;
    }
    const name = f.replace(SPACES, "+");
    urls.push(`https://fonts.googleapis.com/css2?family=${name}&display=swap`);
    urls.push(
      `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,400;0,700;1,400;1,700&display=swap`
    );
  }
  return urls;
}

const loaded = new Set<string>();

/** Adds the stylesheets of these families to the document (once each). */
export function loadFonts(families: Iterable<string>) {
  if (typeof document === "undefined") {
    return;
  }
  for (const url of googleFontsUrls(families)) {
    if (loaded.has(url)) {
      continue;
    }
    loaded.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }
}
