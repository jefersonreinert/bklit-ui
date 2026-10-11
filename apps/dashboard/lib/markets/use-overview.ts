"use client";

import { useEffect, useState } from "react";
import type { Spark } from "./explore";
import type { History, RangeId } from "./history";

/** Data for the symbol overview sheet (history per range, news). */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;

interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useHistory(symbol: string | null, range: RangeId) {
  const [state, setState] = useState<Loaded<History>>({
    data: null,
    error: null,
    loading: false,
  });
  useEffect(() => {
    if (!symbol) {
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const load = async () => {
      try {
        const res = await fetch(
          `${API}/markets/history/?symbol=${encodeURIComponent(symbol)}&range=${range}`,
          { cache: "no-store" }
        );
        const body = (await res.json()) as History & { error?: string };
        if (!alive) {
          return;
        }
        if (res.ok) {
          setState({ data: body, error: null, loading: false });
        } else {
          setState({
            data: null,
            error: body.error ?? "Sem dados.",
            loading: false,
          });
        }
      } catch {
        if (alive) {
          setState({ data: null, error: "Sem conexão.", loading: false });
        }
      }
    };
    load();
    // Today's chart follows the market
    const t = range === "1D" ? setInterval(load, 30_000) : null;
    return () => {
      alive = false;
      if (t) {
        clearInterval(t);
      }
    };
  }, [symbol, range]);
  return state;
}

export interface NewsItem {
  title: string;
  link: string;
  summary: string;
  image: string;
  source: string;
  date: number;
}

/** Yahoo Finance headlines for one symbol (RSS through the news route). */
export function useSymbolNews(symbol: string | null, enabled: boolean) {
  const [state, setState] = useState<Loaded<NewsItem[]>>({
    data: null,
    error: null,
    loading: false,
  });
  useEffect(() => {
    if (!(symbol && enabled)) {
      return;
    }
    let alive = true;
    setState({ data: null, error: null, loading: true });
    const feed = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    fetch(`${API}/news/?feeds=${encodeURIComponent(feed)}`)
      .then((r) => r.json() as Promise<{ items?: NewsItem[] }>)
      .then((b) => {
        if (alive) {
          setState({ data: b.items ?? [], error: null, loading: false });
        }
      })
      .catch(() => {
        if (alive) {
          setState({
            data: null,
            error: "Sem notícias agora.",
            loading: false,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [symbol, enabled]);
  return state;
}

/** Intraday spark lines for a set of symbols (refreshed every minute). */
export function useSparks(symbols: string[]) {
  const key = symbols.join(",");
  const [sparks, setSparks] = useState<Record<string, Spark>>({});
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!key) {
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(
          `${API}/markets/spark/?symbols=${encodeURIComponent(key)}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          setLocked(true);
          return;
        }
        const body = (await res.json()) as { sparks: Spark[] };
        if (alive) {
          setSparks((prev) => {
            const next = { ...prev };
            for (const s of body.sparks) {
              next[s.symbol] = s;
            }
            return next;
          });
        }
      } catch {
        // keep the last lines
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);
  return { sparks, locked };
}
