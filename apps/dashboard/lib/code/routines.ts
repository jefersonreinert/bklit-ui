"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Subscription mode of the Code page: routines (claude.ai/code/routines)
 * fired through the server, plus a local history of the sessions they
 * started (synced across devices by the Convex store sync).
 */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/code/routines/`;
const FIRED_KEY = "cb:code:fired";

export interface RoutineInfo {
  id: string;
  name: string;
  addedAt: number;
  /** Configured on the server for every device; can't be removed here. */
  server?: boolean;
}

export interface FiredSession {
  sessionId: string;
  url: string;
  title: string;
  routine: string;
  createdAt: number;
}

async function call<T>(body?: unknown): Promise<T> {
  const res = await fetch(API, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
  }
  return data as T;
}

export function useRoutines() {
  const [routines, setRoutines] = useState<RoutineInfo[] | null>(null);
  const reload = useCallback(() => {
    call<RoutineInfo[]>()
      .then(setRoutines)
      .catch(() => setRoutines([]));
  }, []);
  useEffect(reload, []);
  const add = async (name: string, url: string, token: string) =>
    setRoutines(await call<RoutineInfo[]>({ action: "add", name, url, token }));
  const remove = async (id: string) =>
    setRoutines(await call<RoutineInfo[]>({ action: "remove", id }));
  return { routines, add, remove, reload };
}

/* ------------------------------ fired history ---------------------------- */

const listeners = new Set<() => void>();
let cache: FiredSession[] | null = null;

function readFired(): FiredSession[] {
  if (cache) {
    return cache;
  }
  try {
    cache = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache ?? [];
}

function writeFired(list: FiredSession[]) {
  cache = list;
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(list));
  } catch {
    // Storage full: keep in memory
  }
  for (const l of listeners) {
    l();
  }
}

const EMPTY: FiredSession[] = [];

export function useFiredSessions() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (e.key === FIRED_KEY) {
          cache = null;
          l();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", onStorage);
      };
    },
    readFired,
    () => EMPTY
  );
}

export function forgetFired(sessionId: string) {
  writeFired(readFired().filter((s) => s.sessionId !== sessionId));
}

/** Starts a real Claude Code cloud session from a routine. */
export async function fireRoutine(routine: RoutineInfo, text: string) {
  const result = await call<{ sessionId: string; url: string }>({
    action: "fire",
    id: routine.id,
    text,
  });
  const fired: FiredSession = {
    sessionId: result.sessionId,
    url: result.url,
    title: text.split("\n")[0]?.slice(0, 80) || "Tarefa",
    routine: routine.name,
    createdAt: Date.now(),
  };
  writeFired([fired, ...readFired()].slice(0, 100));
  return fired;
}
