"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsFeed } from "./store";

export interface NewsItem {
  title: string;
  link: string;
  summary: string;
  image: string;
  source: string;
  feed?: string;
  date: number;
}

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;

/** Headlines of the active feeds (refreshes every 10 minutes). */
export function useNews(feeds: NewsFeed[]) {
  const urls = feeds
    .filter((f) => f.on)
    .map((f) => f.url)
    .join("|");
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!urls) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/news/?feeds=${encodeURIComponent(urls)}`,
        {
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        setError("locked");
        return;
      }
      const data = (await res.json()) as { items: NewsItem[] };
      // Show the source name as configured (feeds call themselves "All News"…)
      const norm = (u: string) => {
        try {
          return new URL(u).toString();
        } catch {
          return u;
        }
      };
      const names = new Map(feeds.map((f) => [norm(f.url), f.name]));
      setItems(
        data.items.map((i) => {
          const name = i.feed ? names.get(i.feed) : undefined;
          // Aggregators (Google News) keep each article's own source
          return name && !i.feed?.includes("news.google.")
            ? { ...i, source: name }
            : i;
        })
      );
      setError(null);
    } catch {
      setError("Sem conexão.");
    } finally {
      setLoading(false);
    }
  }, [urls, feeds]);
  useEffect(() => {
    load();
    const t = setInterval(load, 600_000);
    return () => clearInterval(t);
  }, [load]);
  return { items, error, loading, reload: load };
}

export function timeAgo(t: number) {
  if (!t) {
    return "";
  }
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) {
    return "agora";
  }
  if (min < 60) {
    return `há ${min} min`;
  }
  const h = Math.round(min / 60);
  if (h < 24) {
    return `há ${h} h`;
  }
  return new Date(t).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

/** Opens a link in the in-app browser. */
export const browserHref = (url: string) =>
  `/navegador/?url=${encodeURIComponent(url)}`;
