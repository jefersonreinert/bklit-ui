"use client";

import { useEffect, useState } from "react";

/**
 * Brand logos from svgl (github.com/pheralb/svgl) through its public API.
 * The list is cached for a day; the SVGs themselves load from svgl.app.
 * A logo is stored on a page as "logo:<light url>|<dark url>".
 */

const API = "https://api.svgl.app";
const CACHE_KEY = "cb:svgl:v1";
const TTL = 24 * 60 * 60 * 1000;

type Route = string | { light: string; dark: string };

interface ApiLogo {
  id: number;
  title: string;
  category: string | string[];
  route: Route;
}

export interface Logo {
  title: string;
  categories: string[];
  light: string;
  dark: string | null;
}

function normalize(list: ApiLogo[]): Logo[] {
  return list
    .map((l) => ({
      title: l.title,
      categories: Array.isArray(l.category) ? l.category : [l.category],
      light: typeof l.route === "string" ? l.route : l.route.light,
      dark: typeof l.route === "string" ? null : l.route.dark,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

let memory: Logo[] | null = null;
let pending: Promise<Logo[]> | null = null;

function readCache(): Logo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const { at, logos } = JSON.parse(raw) as { at: number; logos: Logo[] };
    return Date.now() - at < TTL ? logos : null;
  } catch {
    return null;
  }
}

export function loadLogos(): Promise<Logo[]> {
  if (memory) {
    return Promise.resolve(memory);
  }
  const cached = readCache();
  if (cached) {
    memory = cached;
    return Promise.resolve(cached);
  }
  pending ??= fetch(API)
    .then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`svgl ${r.status}`))
    )
    .then((list: ApiLogo[]) => {
      memory = normalize(list);
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), logos: memory })
        );
      } catch {
        // Storage full: keep it in memory only
      }
      return memory;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useLogos(enabled: boolean) {
  const [logos, setLogos] = useState<Logo[] | null>(memory);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled || logos) {
      return;
    }
    loadLogos()
      .then(setLogos)
      .catch(() => setError(true));
  }, [enabled, logos]);
  return { logos, error };
}

/* ------------------------------ page values ------------------------------ */

export const LOGO_PREFIX = "logo:";

export const logoValue = (l: Pick<Logo, "light" | "dark">) =>
  `${LOGO_PREFIX}${l.light}${l.dark ? `|${l.dark}` : ""}`;

export const isLogo = (v: string | undefined): v is string =>
  Boolean(v?.startsWith(LOGO_PREFIX));

/** The logo URL for the current theme. */
export function logoUrl(value: string, dark: boolean) {
  const [light, darkUrl] = value.slice(LOGO_PREFIX.length).split("|");
  return (dark && darkUrl) || light || "";
}

/** True while the app shows a dark theme (follows theme switches). */
export function useDarkTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
