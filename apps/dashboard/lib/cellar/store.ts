"use client";

import { createLocalStore, uid } from "@/lib/local-store";
import { round2 } from "@/lib/money";
import { type CellarData, type CellarWine, EMPTY_CELLAR } from "./types";

export const cellarStore = createLocalStore<CellarData>(
  "cb:cellar:v1",
  EMPTY_CELLAR
);

export const useCellar = cellarStore.use;

export function blankWine(patch: Partial<CellarWine> = {}): CellarWine {
  return {
    id: uid("wine"),
    wineId: "",
    name: "",
    producer: "",
    style: "Red",
    grapes: [],
    grapeNotes: "",
    country: "",
    region: "",
    vintage: null,
    abv: null,
    volumeMl: 750,
    ean: "",
    tapCode: "",
    priceDineIn: null,
    priceGlass: null,
    vatRate: cellarStore.get().defaultVat,
    cost: null,
    purchaseCount: 0,
    lastPurchaseAt: null,
    lastSupplier: "",
    story: "",
    tastingNotes: "",
    foodPairing: [],
    imageUrl: "",
    wineWeightG: null,
    fullBottleG: null,
    addedOn: new Date().toISOString().slice(0, 10),
    available: true,
    origin: "",
    ...patch,
  };
}

const sameWine = (a: CellarWine, b: CellarWine) =>
  (a.origin && a.origin === b.origin) ||
  (a.wineId && a.wineId === b.wineId) ||
  (a.ean && a.ean === b.ean) ||
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

export interface UpsertResult {
  added: number;
  updated: number;
}

/** Adds new wines and refreshes the ones already in the catalog. */
export function upsertWines(incoming: CellarWine[]): UpsertResult {
  let added = 0;
  let updated = 0;
  cellarStore.update((prev) => {
    const wines = [...prev.wines];
    for (const w of incoming) {
      const i = wines.findIndex((x) => sameWine(x, w));
      if (i === -1) {
        wines.push(w);
        added++;
      } else {
        const old = wines[i] as CellarWine;
        wines[i] = {
          ...old,
          ...w,
          id: old.id,
          // Costs learned from invoices win over an empty Notion value
          cost: w.cost ?? old.cost,
          purchaseCount: Math.max(old.purchaseCount, w.purchaseCount),
          lastPurchaseAt: old.lastPurchaseAt ?? w.lastPurchaseAt,
          lastSupplier: old.lastSupplier || w.lastSupplier,
          imageUrl: w.imageUrl || old.imageUrl,
        };
        updated++;
      }
    }
    return { ...prev, wines };
  });
  return { added, updated };
}

export function updateWine(id: string, patch: Partial<CellarWine>) {
  cellarStore.update((prev) => ({
    ...prev,
    wines: prev.wines.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  }));
}

export function removeWine(id: string) {
  cellarStore.update((prev) => ({
    ...prev,
    wines: prev.wines.filter((w) => w.id !== id),
  }));
}

export function setCellarSettings(patch: Partial<Omit<CellarData, "wines">>) {
  cellarStore.update((prev) => ({ ...prev, ...patch }));
}

/** An invoice line bought this wine: record the new bottle cost. */
export function recordWinePurchase(
  wineId: string,
  unitCostExVat: number,
  date: string,
  supplier: string
) {
  cellarStore.update((prev) => ({
    ...prev,
    wines: prev.wines.map((w) => {
      if (w.id !== wineId) {
        return w;
      }
      const newer = !w.lastPurchaseAt || date >= w.lastPurchaseAt;
      return {
        ...w,
        cost: newer ? round2(unitCostExVat) : w.cost,
        lastPurchaseAt: newer ? date : w.lastPurchaseAt,
        lastSupplier: newer ? supplier : w.lastSupplier,
        purchaseCount: w.purchaseCount + 1,
      };
    }),
  }));
}
