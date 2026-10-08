"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_RECEIPT, seedData } from "./seed";
import type {
  FloorArea,
  OrderItem,
  Payment,
  PosData,
  PosOrder,
  PosProduct,
  PosSettings,
  PrinterConfig,
  ReceiptSettings,
  StockMove,
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
    cache = raw ? normalize(JSON.parse(raw) as Partial<PosData>) : seedData();
  } catch {
    cache = seedData();
  }
  return cache;
}

/** Older saves miss newer fields: fill them with defaults. */
function normalize(saved: Partial<PosData>): PosData {
  const base = seedData();
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...saved.settings },
    receipt: { ...DEFAULT_RECEIPT, ...saved.receipt },
    stockMoves: saved.stockMoves ?? [],
    printers: saved.printers ?? [],
  };
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

/** Current data outside React (event handlers, async work). */
export const readPos = () => read();

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
        cost: p.cost,
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

/** Marks the order paid and takes the sold items out of stock. */
export function payOrder(orderId: string, payment: Omit<Payment, "at">) {
  const now = Date.now();
  update((d) => {
    const order = d.orders.find((o) => o.id === orderId);
    if (!order || order.status === "paid") {
      return d;
    }
    const sold = new Map<string, number>();
    for (const i of order.items) {
      if (i.productId) {
        sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty);
      }
    }
    const moves: StockMove[] = [];
    const products = d.products.map((p) => {
      const qty = sold.get(p.id);
      if (!(qty && p.trackStock)) {
        return p;
      }
      moves.push({
        id: uid(),
        productId: p.id,
        qty: -qty,
        kind: "sale",
        orderId,
        at: now,
      });
      return { ...p, stock: (p.stock ?? 0) - qty };
    });
    return {
      ...d,
      products,
      stockMoves: [...moves, ...d.stockMoves].slice(0, 5000),
      orders: d.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "paid" as const,
              payment: { ...payment, at: now },
              updatedAt: now,
            }
          : o
      ),
    };
  });
}

/* --------------------------------- stock --------------------------------- */

/**
 * Stock entry, adjustment or loss. A purchase with a unit cost updates the
 * product cost by weighted average.
 */
export function moveStock(move: Omit<StockMove, "id" | "at">) {
  update((d) => ({
    ...d,
    products: d.products.map((p) => {
      if (p.id !== move.productId) {
        return p;
      }
      const before = Math.max(0, p.stock ?? 0);
      const stock = (p.stock ?? 0) + move.qty;
      let cost = p.cost;
      if (move.kind === "purchase" && move.unitCost !== undefined) {
        const total = before + move.qty;
        cost =
          total > 0
            ? (before * (p.cost ?? move.unitCost) + move.qty * move.unitCost) /
              total
            : move.unitCost;
        cost = Math.round(cost * 100) / 100;
      }
      return { ...p, stock, cost, trackStock: true };
    }),
    stockMoves: [{ ...move, id: uid(), at: Date.now() }, ...d.stockMoves].slice(
      0,
      5000
    ),
  }));
}

export const isLowStock = (p: PosProduct) =>
  Boolean(p.trackStock) && (p.stock ?? 0) <= (p.minStock ?? 0);

/** Margin over the price, in percent (null without a cost). */
export function marginOf(p: Pick<PosProduct, "price" | "cost">) {
  if (p.cost === undefined || p.price <= 0) {
    return null;
  }
  return ((p.price - p.cost) / p.price) * 100;
}

/* ------------------------------ receipt/print ---------------------------- */

export function saveReceipt(patch: Partial<ReceiptSettings>) {
  update((d) => ({ ...d, receipt: { ...d.receipt, ...patch } }));
}

export function savePrinter(printer: PrinterConfig) {
  update((d) => ({
    ...d,
    printers: d.printers.some((p) => p.id === printer.id)
      ? d.printers.map((p) => (p.id === printer.id ? printer : p))
      : [...d.printers, printer],
  }));
}

export function deletePrinter(id: string) {
  update((d) => ({ ...d, printers: d.printers.filter((p) => p.id !== id) }));
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

/** Back to the sample menu, keeping receipt design and printers. */
export function resetPos() {
  const d = read();
  write({ ...seedData(), receipt: d.receipt, printers: d.printers });
}
