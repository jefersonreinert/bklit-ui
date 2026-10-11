"use client";

import { createLocalStore } from "@/lib/local-store";
import type { Design, DesignData } from "./types";

/** Free-form designs, synced to Convex like the other menu stores. */
export const designStore = createLocalStore<DesignData>("cb:menu-designs:v1", {
  designs: [],
});

export const useDesigns = designStore.use;

export function saveDesign(d: Design) {
  const next = { ...d, updatedAt: Date.now() };
  designStore.update((s) => {
    const rest = s.designs.filter((x) => x.id !== d.id);
    return { designs: [next, ...rest] };
  });
  return next;
}

export function removeDesign(id: string) {
  designStore.update((s) => ({
    designs: s.designs.filter((x) => x.id !== id),
  }));
}
