"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Mirrors each module's localStorage store (POS, agents, finances, AI
 * chats…) to Convex as one JSON document, newest write wins. Writes made
 * by the modules are caught at localStorage.setItem; remote changes are
 * written back and announced with a "storage" event so the modules reload.
 */

export const SYNCED_KEYS = [
  "cb:agents:v1",
  "cb:browser:v1",
  "cb:news:v3",
  "cb:trading:v1",
  "cb:personal-finance:v1",
  "cb:code:repos",
  "cb:code:fired",
  "cb:notes:logo-favorites",
  "cb:cellar:v1",
  "cb:menus:v1",
  "cb:invoices:v1",
  "casa-brasa-ai-conversations",
  "casa-brasa-ai-connectors",
] as const;

const TRACKED = new Set<string>(SYNCED_KEYS);
const META_KEY = "cb:sync:stores";
const DEVICE_KEY = "cb:sync:device";
/** Convex documents max out at 1 MB. */
const MAX_CHARS = 900_000;
const UPLOAD_DELAY_MS = 600;

type Meta = Record<string, number>;

let originalSetItem: Storage["setItem"] | null = null;
let applyingRemote = false;
const dirty = new Set<string>();
let onDirty: (() => void) | null = null;

function readMeta(): Meta {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Meta;
  } catch {
    return {};
  }
}

function writeMeta(meta: Meta) {
  try {
    (originalSetItem ?? localStorage.setItem).call(
      localStorage,
      META_KEY,
      JSON.stringify(meta)
    );
  } catch {
    // Storage full: the next write retries
  }
}

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Notices every write a module makes to a synced key. */
function watchLocalWrites() {
  if (originalSetItem) {
    return;
  }
  originalSetItem = Storage.prototype.setItem;
  const original = originalSetItem;
  Storage.prototype.setItem = function setItem(key: string, value: string) {
    original.call(this, key, value);
    if (this === localStorage && TRACKED.has(key) && !applyingRemote) {
      const meta = readMeta();
      meta[key] = Date.now();
      writeMeta(meta);
      dirty.add(key);
      onDirty?.();
    }
  };
}

function applyValue(key: string, value: string, updatedAt: number) {
  applyingRemote = true;
  try {
    localStorage.setItem(key, value);
  } finally {
    applyingRemote = false;
  }
  const meta = readMeta();
  meta[key] = updatedAt;
  writeMeta(meta);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
}

interface StoreDoc {
  key: string;
  value: string;
  updatedAt: number;
}

function applyNewer(remote: StoreDoc[]) {
  const meta = readMeta();
  for (const doc of remote) {
    if (TRACKED.has(doc.key) && doc.updatedAt > (meta[doc.key] ?? 0)) {
      applyValue(doc.key, doc.value, doc.updatedAt);
    }
  }
}

/** Keys this device has newer (or the server lacks) get queued for upload. */
function markLocalOnly(remote: StoreDoc[]) {
  const meta = readMeta();
  const server = new Map(remote.map((r) => [r.key, r]));
  for (const key of SYNCED_KEYS) {
    const doc = server.get(key);
    const localAt = meta[key] ?? 0;
    if (localStorage.getItem(key) === null) {
      continue;
    }
    if (!doc || localAt > doc.updatedAt) {
      dirty.add(key);
      meta[key] = localAt || Date.now();
    }
  }
  writeMeta(meta);
  onDirty?.();
}

export function useStoresSync() {
  const remote = useQuery(api.stores.list);
  const set = useMutation(api.stores.set);
  const merged = useRef(false);
  const online = useRef(false);
  online.current = Array.isArray(remote);

  // Upload local writes (debounced)
  useEffect(() => {
    watchLocalWrites();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (!online.current) {
        return;
      }
      const meta = readMeta();
      for (const key of dirty) {
        const value = localStorage.getItem(key);
        if (value !== null && value.length < MAX_CHARS) {
          set({
            key,
            value,
            updatedAt: meta[key] ?? Date.now(),
            device: deviceId(),
          }).catch(() => null);
        }
      }
      dirty.clear();
    };
    onDirty = () => {
      if (!timer) {
        timer = setTimeout(flush, UPLOAD_DELAY_MS);
      }
    };
    return () => {
      onDirty = null;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [set]);

  // Apply newer server values; on first contact upload what only we have
  useEffect(() => {
    if (!remote) {
      merged.current = false;
      return;
    }
    applyNewer(remote);
    if (!merged.current) {
      merged.current = true;
      markLocalOnly(remote);
    }
  }, [remote]);
}
