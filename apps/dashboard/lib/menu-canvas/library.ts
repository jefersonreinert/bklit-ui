"use client";

import { createLocalStore } from "@/lib/local-store";

/** Drawings extracted from menus, reusable in every design. */

export interface LibraryAsset {
  id: string;
  name: string;
  kind: string;
  src: string;
  width: number;
  height: number;
  /** One-color drawing: the editor can recolor it. */
  monochrome: boolean;
  source: string;
  createdAt: number;
}

export const libraryStore = createLocalStore<{ assets: LibraryAsset[] }>(
  "cb:design-library:v1",
  { assets: [] }
);

export const useLibrary = libraryStore.use;

export function addAssets(list: LibraryAsset[]) {
  libraryStore.update((s) => ({ assets: [...list, ...s.assets] }));
}

export function removeAsset(id: string) {
  libraryStore.update((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
}

export function renameAsset(id: string, name: string) {
  libraryStore.update((s) => ({
    assets: s.assets.map((a) => (a.id === id ? { ...a, name } : a)),
  }));
}
