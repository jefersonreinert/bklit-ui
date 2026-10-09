"use client";

import { useSyncExternalStore } from "react";

/**
 * In-app browser: home screen apps (favorites), widgets and history, and
 * the news sources. Saved on the device and synced to every device through
 * the central database (see lib/sync/stores.ts).
 */

export interface WebApp {
  id: string;
  title: string;
  url: string;
  color: string;
}

export type WidgetId = "clock" | "weather" | "news" | "search";

export interface HistoryEntry {
  url: string;
  title: string;
  at: number;
}

export interface BrowserData {
  apps: WebApp[];
  widgets: WidgetId[];
  history: HistoryEntry[];
  weather?: { lat: number; lon: number; place: string };
}

export interface NewsFeed {
  id: string;
  name: string;
  url: string;
  on: boolean;
}

export const BROWSER_KEY = "cb:browser:v1";
export const NEWS_KEY = "cb:news:v3";

const COLORS = [
  "#c96442",
  "#3d7a5f",
  "#4a6fa5",
  "#8e5ea2",
  "#d4a27f",
  "#5c3d2e",
  "#b03a2e",
  "#111111",
];
export const APP_COLORS = COLORS;

const id = () => Math.random().toString(36).slice(2, 10);

const app = (title: string, url: string, color: string): WebApp => ({
  id: id(),
  title,
  url,
  color,
});

const DEFAULT_BROWSER: BrowserData = {
  apps: [
    app("Google", "https://www.google.com", "#4a6fa5"),
    app("Wikipedia", "https://pt.m.wikipedia.org", "#111111"),
    app("YouTube", "https://m.youtube.com", "#b03a2e"),
    app("Instagram", "https://www.instagram.com", "#8e5ea2"),
    app("WhatsApp", "https://web.whatsapp.com", "#3d7a5f"),
    app("Gmail", "https://mail.google.com", "#c96442"),
    app("Maps", "https://maps.google.com", "#3d7a5f"),
    app("TheFork", "https://www.thefork.pt", "#3d7a5f"),
    app("Uber Eats", "https://www.ubereats.com", "#111111"),
    app("Booking", "https://www.booking.com", "#4a6fa5"),
    app("Open Meteo", "https://open-meteo.com", "#d4a27f"),
    app("Claude", "https://claude.ai", "#c96442"),
  ],
  widgets: ["clock", "weather", "news"],
  history: [],
};

const feed = (
  fid: string,
  name: string,
  url: string,
  on: boolean
): NewsFeed => ({
  id: fid,
  name,
  url,
  on,
});

// Financial news: exactly the sources of the MarketNewsAPI project
const DEFAULT_FEEDS: NewsFeed[] = [
  feed(
    "marketwatch",
    "MarketWatch",
    "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    true
  ),
  feed(
    "bloomberg",
    "Bloomberg",
    "https://feeds.bloomberg.com/markets/news.rss",
    true
  ),
  feed(
    "investing",
    "Investing.com",
    "https://www.investing.com/rss/news.rss",
    true
  ),
];

function localStore<T>(key: string, fallback: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache) {
      return cache;
    }
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
    } catch {
      cache = fallback;
    }
    return cache as T;
  };
  const write = (next: T) => {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // private mode
    }
    for (const l of listeners) {
      l();
    }
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };
  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { read, write, use };
}

const browser = localStore<BrowserData>(BROWSER_KEY, DEFAULT_BROWSER);
const news = localStore<{ feeds: NewsFeed[] }>(NEWS_KEY, {
  feeds: DEFAULT_FEEDS,
});

export const useBrowser = browser.use;
export const useNewsFeeds = () => news.use().feeds;

export function updateBrowser(fn: (d: BrowserData) => BrowserData) {
  browser.write(fn(browser.read()));
}

export function addApp(title: string, url: string, color?: string) {
  updateBrowser((d) => ({
    ...d,
    apps: [
      ...d.apps,
      app(
        title,
        url,
        color ?? COLORS[d.apps.length % COLORS.length] ?? "#c96442"
      ),
    ],
  }));
}

export function removeApp(appId: string) {
  updateBrowser((d) => ({ ...d, apps: d.apps.filter((a) => a.id !== appId) }));
}

export function moveApp(from: number, to: number) {
  updateBrowser((d) => {
    const apps = [...d.apps];
    const [moved] = apps.splice(from, 1);
    if (moved) {
      apps.splice(to, 0, moved);
    }
    return { ...d, apps };
  });
}

export function addHistory(url: string, title: string) {
  updateBrowser((d) => ({
    ...d,
    history: [
      { url, title, at: Date.now() },
      ...d.history.filter((h) => h.url !== url),
    ].slice(0, 300),
  }));
}

export function saveFeeds(feeds: NewsFeed[]) {
  news.write({ feeds });
}

export const newFeedId = id;

const HAS_SCHEME = /^https?:\/\//i;
const LOOKS_LIKE_HOST = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/;
const WWW = /^www\./;

/** Typed text → URL (or a search). */
export function toUrl(input: string) {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (HAS_SCHEME.test(text)) {
    return text;
  }
  if (LOOKS_LIKE_HOST.test(text)) {
    return `https://${text}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(WWW, "");
  } catch {
    return url;
  }
};
