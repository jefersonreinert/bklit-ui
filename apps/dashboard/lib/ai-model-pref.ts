"use client";

import { useSyncExternalStore } from "react";
import { type ChatModelId, DEFAULT_MODEL, isChatModel } from "./ai-models";

/**
 * The model picked for the whole panel (assistant, notes, voice), saved on
 * this device and shared by every page.
 */

const KEY = "cb:ai:model";
const listeners = new Set<() => void>();

function read(): ChatModelId {
  try {
    const v = localStorage.getItem(KEY);
    return isChatModel(v) ? v : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setPreferredModel(id: ChatModelId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts for this page only
  }
  for (const l of listeners) {
    l();
  }
}

export const preferredModel = read;

export function usePreferredModel() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => e.key === KEY && l();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => DEFAULT_MODEL
  );
}
