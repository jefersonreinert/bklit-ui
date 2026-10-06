"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/use-connectors";
import type { YtTranscript } from "@/lib/youtube-types";

const API = `${BASE_PATH}/api/youtube`;
const TRANSCRIPT_CACHE = "casa-brasa-yt-transcript:";

export async function ytGet<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "")
  );
  const res = await fetch(`${API}/${path}/?${query}`);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return body;
}

/** Loads `path` whenever params change; `null` params = don't load. */
export function useYt<T>(path: string, params: Record<string, string> | null) {
  const key = params ? JSON.stringify(params) : null;
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: Boolean(key), error: null });

  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    ytGet<T>(path, JSON.parse(key) as Record<string, string>)
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : "Erro",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  return state;
}

function readCache(id: string): YtTranscript | null {
  try {
    const raw = localStorage.getItem(`${TRANSCRIPT_CACHE}${id}`);
    return raw ? (JSON.parse(raw) as YtTranscript) : null;
  } catch {
    return null;
  }
}

function writeCache(t: YtTranscript) {
  try {
    localStorage.setItem(`${TRANSCRIPT_CACHE}${t.videoId}`, JSON.stringify(t));
  } catch {
    // storage full or unavailable — the transcript just won't be cached
  }
}

/** Gemini transcription, cached per video in this browser. */
export function useTranscript(videoId: string) {
  const [transcript, setTranscript] = useState<YtTranscript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTranscript(readCache(videoId));
    setError(null);
    setLoading(false);
  }, [videoId]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/transcript/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: videoId }),
      });
      const body = (await res.json().catch(() => ({}))) as YtTranscript & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      writeCache(body);
      setTranscript(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao transcrever");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  return { transcript, loading, error, run };
}

const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const shortNumber = (n: number | null) =>
  n === null ? "—" : compact.format(n);

export function relativeDate(iso: string) {
  if (!iso) {
    return "";
  }
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) {
    return "hoje";
  }
  if (days < 30) {
    return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function timestamp(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
