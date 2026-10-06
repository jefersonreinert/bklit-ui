"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Per-device preferences: the user's name/role and the app typeface.
 * Stored in localStorage; the font is applied through `--app-font`.
 */

export interface FontOption {
  id: string;
  label: string;
  /** Short description shown in Configurações. */
  note: string;
  stack: string;
  /** Google Fonts family query (absent = already bundled or system). */
  google?: string;
}

export const FONTS: FontOption[] = [
  {
    id: "geist",
    label: "Geist",
    note: "Padrão do app — moderna e neutra",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "system",
    label: "Sistema (San Francisco)",
    note: "A fonte nativa do iPhone e do Mac",
    stack:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "inter",
    label: "Inter",
    note: "Ótima leitura em telas e números",
    stack: "'Inter', ui-sans-serif, system-ui, sans-serif",
    google: "Inter:wght@400;500;600;700",
  },
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    note: "Geométrica e elegante",
    stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    google: "Plus+Jakarta+Sans:wght@400;500;600;700",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    note: "Suave, ótima para painéis",
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    google: "DM+Sans:wght@400;500;600;700",
  },
  {
    id: "manrope",
    label: "Manrope",
    note: "Contemporânea e compacta",
    stack: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    google: "Manrope:wght@400;500;600;700",
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Sans",
    note: "Técnica, com personalidade",
    stack: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    google: "IBM+Plex+Sans:wght@400;500;600;700",
  },
  {
    id: "source-serif",
    label: "Source Serif 4",
    note: "Serifada, estilo editorial",
    stack: "'Source Serif 4', ui-serif, Georgia, serif",
    google: "Source+Serif+4:wght@400;500;600;700",
  },
  {
    id: "lora",
    label: "Lora",
    note: "Serifada clássica, calorosa",
    stack: "'Lora', ui-serif, Georgia, serif",
    google: "Lora:wght@400;500;600;700",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    note: "Monoespaçada, visual técnico",
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    google: "JetBrains+Mono:wght@400;500;600;700",
  },
];

export interface Preferences {
  name: string;
  role: string;
  font: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  name: "Gabriela",
  role: "Gerente",
  font: "geist",
};

const KEY = "casa-brasa-preferences";
const WORDS = /\s+/;
const listeners = new Set<() => void>();
let current: Preferences | null = null;

function read(): Preferences {
  if (current) {
    return current;
  }
  try {
    const raw = localStorage.getItem(KEY);
    current = raw
      ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) }
      : DEFAULT_PREFERENCES;
  } catch {
    current = DEFAULT_PREFERENCES;
  }
  return current;
}

/** Current preferences outside React (e.g. for sample data). */
export const getPreferences = () => read();

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable — applies for this visit only
  }
  applyFont(current.font);
  for (const l of listeners) {
    l();
  }
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULT_PREFERENCES
  );
}

export const firstName = (name: string) =>
  name.trim().split(WORDS)[0] || DEFAULT_PREFERENCES.name;

export function initialsOf(name: string) {
  const parts = name.trim().split(WORDS).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export const googleFontsUrl = (fonts: FontOption[]) =>
  `https://fonts.googleapis.com/css2?${fonts
    .filter((f) => f.google)
    .map((f) => `family=${f.google}`)
    .join("&")}&display=swap`;

/** Loads a Google font once (a stylesheet link with a stable id). */
export function loadFonts(fonts: FontOption[], id: string) {
  if (fonts.every((f) => !f.google) || document.getElementById(id)) {
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontsUrl(fonts);
  document.head.append(link);
}

export function applyFont(fontId: string) {
  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  if (!font) {
    return;
  }
  loadFonts([font], `app-font-${font.id}`);
  const root = document.documentElement.style;
  root.setProperty("--app-font", font.stack);
  // The assistant keeps its serif look with the default font only
  if (font.id === "geist") {
    root.removeProperty("--ai-font");
  } else {
    root.setProperty("--ai-font", font.stack);
  }
}

/** Applies the saved typeface on first load (mounted once in the layout). */
export function PreferencesBoot() {
  useEffect(() => {
    applyFont(read().font);
  }, []);
  return null;
}
