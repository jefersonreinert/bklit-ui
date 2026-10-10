"use client";

import { useSyncExternalStore } from "react";

/**
 * A JSON document in localStorage shared by every component that reads
 * it. Keys listed in SYNCED_KEYS (lib/sync/stores.ts) are mirrored to
 * Convex, so the same data shows up on every device of the panel.
 */
export function createLocalStore<T>(key: string, empty: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();

  const read = (): T => {
    if (cache !== null) {
      return cache;
    }
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? ({ ...empty, ...JSON.parse(raw) } as T) : empty;
    } catch {
      cache = empty;
    }
    return cache;
  };

  const write = (next: T) => {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Quota or private mode: keep the data for this session only
    }
    for (const l of listeners) {
      l();
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return {
    key,
    get: read,
    set: write,
    update: (fn: (prev: T) => T) => write(fn(read())),
    use: () => useSyncExternalStore(subscribe, read, () => empty),
  };
}

export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
