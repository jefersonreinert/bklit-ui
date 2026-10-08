"use client";

import { useSyncExternalStore } from "react";
import { seedData } from "./seed";
import type {
  FloorArea,
  OrderItem,
  Payment,
  PosData,
  PosOrder,
  PosProduct,
  PosSettings,
} from "./types";

/**
 * POS data lives on this device (localStorage), like a standalone register.
 * All writes go through the actions below so every open tab stays in sync.
 */

const KEY = "cb:pos:v1";
let cache: PosData | null = null;

// Another tab or the Convex sync rewrote the store: drop the cached copy
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
    }
  });
}
const listeners = new Set<() => void>();

function read(): PosData {
  if (cache) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw
      ? { ...seedData(), ...(JSON.parse(raw) as PosData) }
      : seedData();
  } catch {
    cache = seedData();
  }
  return cache;
}

function write(next: PosData) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or private mode: keep working in memory
  }
  for (const l of listeners) {
    l();
  }
}

function update(fn: (d: PosData) => PosData) {
  write(fn(read()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const SERVER: PosData = seedData();

export function usePos() {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* --------------------------------- totals -------------------------------- */

export function orderTotals(order: Pick<PosOrder, "items" | "taxRate">) {
  const subtotal = order.items.reduce((a, i) => a + i.price * i.qty, 0);
  const tax = Math.round(subtotal * order.taxRate) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export const itemCount = (order: Pick<PosOrder, "items">) =>
  order.items.reduce((a, i) => a + i.qty, 0);

const formatters = new Map<string, Intl.NumberFormat>();
export function money(value: number, currency = "EUR") {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f.format(value);
}

/* --------------------------------- orders -------------------------------- */

export function createOrder(init: { tableId?: string | null; name?: string }) {
  const d = read();
  const now = Date.now();
  const order: PosOrder = {
    id: uid(),
    number: d.nextOrderNumber,
    tableId: init.tableId ?? null,
    name: init.name ?? "",
    items: [],
    taxRate: 0,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  write({
    ...d,
    orders: [order, ...d.orders],
    nextOrderNumber: d.nextOrderNumber + 1,
  });
  return order;
}

export function updateOrder(id: string, patch: Partial<PosOrder>) {
  update((d) => ({
    ...d,
    orders: d.orders.map((o) =>
      o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o
    ),
  }));
}

function mapItems(id: string, fn: (items: OrderItem[]) => OrderItem[]) {
  const order = read().orders.find((o) => o.id === id);
  if (order) {
    updateOrder(id, { items: fn(order.items) });
  }
}

/** Adds a product (merging with an unsent line of the same product). */
export function addProduct(orderId: string, p: PosProduct) {
  mapItems(orderId, (items) => {
    const line = items.find((i) => i.productId === p.id && !i.sent);
    if (line) {
      return items.map((i) => (i === line ? { ...i, qty: i.qty + 1 } : i));
    }
    return [
      ...items,
      {
        id: uid(),
        productId: p.id,
        name: p.name,
        price: p.price,
        qty: 1,
        sent: false,
      },
    ];
  });
}

/** A typed amount from the keypad ("Valor avulso"). */
export function addCustomAmount(orderId: string, amount: number, name: string) {
  mapItems(orderId, (items) => [
    ...items,
    { id: uid(), productId: null, name, price: amount, qty: 1, sent: false },
  ]);
}

export function changeQty(orderId: string, itemId: string, delta: number) {
  mapItems(orderId, (items) =>
    items
      .map((i) => (i.id === itemId ? { ...i, qty: i.qty + delta } : i))
      .filter((i) => i.qty > 0)
  );
}

export function sendToKitchen(orderId: string) {
  mapItems(orderId, (items) => items.map((i) => ({ ...i, sent: true })));
}

export function payOrder(orderId: string, payment: Omit<Payment, "at">) {
  updateOrder(orderId, {
    status: "paid",
    payment: { ...payment, at: Date.now() },
  });
}

export function deleteOrder(orderId: string) {
  update((d) => ({ ...d, orders: d.orders.filter((o) => o.id !== orderId) }));
}

/** Open (unpaid) order on a table, if any. */
export function openOrderFor(d: PosData, tableId: string) {
  return d.orders.find(
    (o) =>
      o.tableId === tableId && (o.status === "open" || o.status === "paying")
  );
}

/* ------------------------------ floor / menu ----------------------------- */

export function saveAreas(areas: FloorArea[]) {
  update((d) => ({ ...d, areas }));
}

export function saveProduct(p: PosProduct) {
  update((d) => ({
    ...d,
    products: d.products.some((x) => x.id === p.id)
      ? d.products.map((x) => (x.id === p.id ? p : x))
      : [...d.products, p],
  }));
}

export function deleteProduct(id: string) {
  update((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
}

export function saveSettings(patch: Partial<PosSettings>) {
  update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function resetPos() {
  write(seedData());
}
