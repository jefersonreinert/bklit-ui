"use client";

import { ConvexReactClient } from "convex/react";
import { useSyncExternalStore } from "react";

/**
 * One Convex client for the whole app, authenticated with the panel's own
 * short-lived token (only after the access code was entered on this
 * device). Exposes a tiny status store for the sidebar badge.
 */

const URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type SyncStatus = "off" | "connecting" | "locked" | "synced";

let client: ConvexReactClient | null = null;
let status: SyncStatus = URL ? "connecting" : "off";
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  if (status !== next) {
    status = next;
    for (const l of listeners) {
      l();
    }
  }
}

async function fetchToken() {
  try {
    const res = await fetch(`${BASE}/api/convex/token/`, { cache: "no-store" });
    if (!res.ok) {
      setStatus("locked");
      return null;
    }
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

function authenticate(c: ConvexReactClient) {
  c.setAuth(fetchToken, (ok) => setStatus(ok ? "synced" : "locked"));
}

export function convexClient() {
  if (!URL || typeof window === "undefined") {
    return null;
  }
  if (!client) {
    client = new ConvexReactClient(URL);
    authenticate(client);
    // Unlocking the panel elsewhere (WhatsApp, POS, Code) enables sync
    const retry = () => {
      if (client && status === "locked") {
        authenticate(client);
      }
    };
    window.addEventListener("focus", retry);
    setInterval(retry, 30_000);
  }
  return client;
}

/** Re-checks the token now (call right after the access code is accepted). */
export function refreshSyncAuth() {
  if (client) {
    authenticate(client);
  }
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => status,
    () => "off" as SyncStatus
  );
}
