"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  FONTS,
  type FontOption,
  type Preferences,
} from "./preferences-fonts";
import type { StoredSettings } from "./settings-types";

/**
 * The user's name/role, the app typeface and the app icon.
 * Saved on the server (/api/settings, a private Blob store) so it survives
 * reinstalling the Home Screen app, with a localStorage copy for instant
 * loads and offline use. The font is applied through `--app-font`.
 */

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

function apply(next: Preferences) {
  current = next;
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

/** Changes preferences on this device only (see savePreferences). */
export function setPreferences(patch: Partial<Preferences>) {
  apply({ ...read(), ...patch });
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

/* ---------------------------- server sync ---------------------------- */

/** "cloud" = saved on the server; "device" = only here (no server store). */
export type SaveResult = "cloud" | "device" | "error";

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/`;

/** Brings a server copy into the local store. */
function adopt(server: StoredSettings) {
  const local = read();
  apply({
    ...local,
    name: server.name,
    role: server.role,
    font: server.font,
    icon: server.icon,
    // The local preview belongs to the icon it was made from
    iconData: server.icon === local.icon ? local.iconData : undefined,
    updatedAt: server.updatedAt,
  });
}

async function send(
  url: string,
  init: RequestInit
): Promise<{ result: SaveResult; settings?: StoredSettings }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    // Static build (no API) or no Blob store configured
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      return { result: "device" };
    }
    if (!res.ok) {
      return { result: "error" };
    }
    const { settings } = (await res.json()) as { settings: StoredSettings };
    return { result: "cloud", settings };
  } catch {
    return { result: "error" };
  }
}

/** Saves on this device right away, then on the server. */
export async function savePreferences(
  patch: Partial<Pick<Preferences, "name" | "role" | "font">>
): Promise<SaveResult> {
  setPreferences({ ...patch, updatedAt: Date.now() });
  const { name, role, font } = read();
  const { result, settings } = await send(API, {
    method: "POST",
    body: JSON.stringify({ name, role, font }),
  });
  if (settings) {
    adopt(settings);
  }
  return result;
}

/** Uploads the icon (PNG data URLs keyed by size) or, with null, resets it. */
export async function saveIcon(
  pngs: Record<number, string> | null
): Promise<SaveResult> {
  const body = pngs
    ? Object.fromEntries(
        Object.entries(pngs).map(([size, url]) => [size, url.split(",")[1]])
      )
    : undefined;
  const { result, settings } = await send(`${API}icon/`, {
    method: pngs ? "POST" : "DELETE",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (settings) {
    adopt(settings);
  }
  if (result !== "error") {
    // Keep a preview so the new icon shows immediately (and offline)
    setPreferences({
      iconData: pngs?.[192],
      ...(result === "device"
        ? { icon: undefined, updatedAt: Date.now() }
        : {}),
    });
  }
  return result;
}

/** On load: take the server copy when newer, or upload newer local edits. */
async function pull() {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const { available, settings } = (await res.json()) as {
      available: boolean;
      settings: StoredSettings | null;
    };
    const local = read();
    if (settings && settings.updatedAt >= (local.updatedAt ?? 0)) {
      adopt(settings);
    } else if (available && (local.updatedAt || !settings)) {
      // Edits made before the server store existed (or offline) go up now
      await savePreferences({});
    }
  } catch {
    // offline — keep the local copy
  }
}

/** URL of the current app icon, or null for the default mark. */
export function appIconSrc(prefs: Preferences, size = 192) {
  if (prefs.iconData) {
    return prefs.iconData;
  }
  return prefs.icon
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/brand/icon/?size=${size}&v=${prefs.icon}`
    : null;
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
  const { icon } = usePreferences();
  useEffect(() => {
    applyFont(read().font);
    pull();
  }, []);
  // "Adicionar à Tela de Início" reads this link: point it at the newest icon
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]'
    );
    if (link && icon) {
      link.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/brand/icon/?size=180&v=${icon}`;
    }
  }, [icon]);
  return null;
}
