"use client";

import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import { convexClient } from "@/lib/sync/convex-client";
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
 * The POS is shared by every device through Convex: one document per
 * product and order, and each action is a server transaction, so several
 * iPads and phones can sell at the same time. Writes show up instantly
 * (optimistic) and are confirmed by the server; printers stay per device.
 */

type Catalog = NonNullable<typeof api.pos.catalog._returnType>;
type ServerOrder = NonNullable<typeof api.pos.openOrders._returnType>[number];

const SESSION_KEY = "cb:pos:session";
const PRINTERS_KEY = "cb:pos:printers";
const LEGACY_KEY = "cb:pos:v1";

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* --------------------------------- state --------------------------------- */

interface State {
  catalog: Catalog | null | undefined;
  open: ServerOrder[] | null | undefined;
  closed: ServerOrder[] | null | undefined;
  /** Orders paid on this device, until the closed list has them. */
  paidHere: Map<string, PosOrder>;
  printers: PrinterConfig[];
  error: string | null;
}

const state: State = {
  catalog: undefined,
  open: undefined,
  closed: undefined,
  paidHere: new Map(),
  printers: [],
  error: null,
};

const listeners = new Set<() => void>();
let snapshot: PosData | null = null;
/** Receipt edits not saved yet (typing in the designer). */
let receiptDraft: ReceiptSettings | null = null;

function emit() {
  snapshot = null;
  for (const l of listeners) {
    l();
  }
}

const SERVER: PosData = seedData();

/** Start of yesterday: the orders list shows today and yesterday. */
function closedSince() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

function build(): PosData {
  const base = seedData();
  const c = state.catalog;
  const m = c?.meta;
  const open = (state.open ?? []) as PosOrder[];
  const closed = (state.closed ?? []) as PosOrder[];
  const seen = new Set([...open, ...closed].map((o) => o.id));
  const extra = [...state.paidHere.values()].filter((o) => !seen.has(o.id));
  const orders = [...open, ...extra, ...closed].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
  return {
    products: (c?.products ?? []) as PosProduct[],
    areas: (m?.areas as FloorArea[] | undefined) ?? base.areas,
    settings: { ...base.settings, ...(m?.settings as Partial<PosSettings>) },
    receipt: {
      ...DEFAULT_RECEIPT,
      ...(m?.receipt as Partial<ReceiptSettings>),
      ...receiptDraft,
    },
    orders,
    nextOrderNumber: 0,
    stockMoves: [] as StockMove[],
    printers: state.printers,
  };
}

function read(): PosData {
  if (!snapshot) {
    snapshot = build();
  }
  return snapshot;
}

/* ------------------------------ subscriptions ---------------------------- */

let started = false;
let closedRefs = 0;
let stopClosed: (() => void) | null = null;

function watch<Q extends FunctionReference<"query">>(
  query: Q,
  args: Q["_args"],
  set: (v: Q["_returnType"] | undefined) => void
) {
  const client = convexClient();
  if (!client) {
    return () => undefined;
  }
  const w = client.watchQuery(query, args);
  const push = () => {
    try {
      const next = w.localQueryResult();
      if (next !== undefined) {
        set(next);
      }
    } catch {
      // Query error (e.g. offline auth): keep the last value
    }
    emit();
  };
  push();
  return w.onUpdate(push);
}

function start() {
  if (started || typeof window === "undefined") {
    return;
  }
  started = true;
  try {
    state.printers = JSON.parse(localStorage.getItem(PRINTERS_KEY) ?? "[]");
  } catch {
    state.printers = [];
  }
  watch(api.pos.catalog, {}, (v) => {
    state.catalog = v;
  });
  watch(api.pos.openOrders, {}, (v) => {
    state.open = v;
  });
}

/** The orders list and receipts need closed orders: watch only while used. */
export function useClosedOrders() {
  useEffect(() => {
    closedRefs++;
    if (!stopClosed) {
      stopClosed = watch(
        api.pos.closedOrders,
        { since: closedSince() },
        (v) => {
          state.closed = v;
        }
      );
    }
    return () => {
      closedRefs--;
      if (closedRefs === 0 && stopClosed) {
        stopClosed();
        stopClosed = null;
        state.closed = undefined;
      }
    };
  }, []);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePos() {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

/** Loading (undefined), needs setup (false) or ready (true). */
export function usePosReady() {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (state.catalog === undefined || state.open === undefined) {
        return undefined;
      }
      return Boolean(state.catalog?.meta);
    },
    () => undefined
  );
}

/**
 * A live server query with this device's POS session (undefined while
 * loading, null when not allowed or offline).
 */
export function usePosQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: Omit<Q["_args"], "session">
): Q["_returnType"] | null | undefined {
  const key = JSON.stringify(args);
  const token = useSession();
  const [value, setValue] = useState<Q["_returnType"] | null | undefined>(
    undefined
  );
  useEffect(() => {
    const client = convexClient();
    if (!client) {
      setValue(null);
      return;
    }
    const w = client.watchQuery(query, {
      ...JSON.parse(key),
      session: token ?? undefined,
    } as Q["_args"]);
    const push = () => {
      try {
        const next = w.localQueryResult();
        // Re-authenticating briefly empties results: keep the last value
        setValue((prev: Q["_returnType"] | null | undefined) =>
          next === undefined && prev !== undefined ? prev : next
        );
      } catch {
        setValue(null);
      }
    };
    push();
    return w.onUpdate(push);
  }, [query, key, token]);
  return value;
}

/** Current data outside React (event handlers, async work). */
export const readPos = () => read();

/* --------------------------------- errors -------------------------------- */

const ERRORS: Record<string, string> = {
  POS_LOCKED: "Sua sessão terminou. Entre de novo com o PIN.",
  POS_FORBIDDEN: "Seu usuário não tem permissão para isso.",
};

export function errorText(err: unknown) {
  if (err instanceof ConvexError) {
    const code = String(err.data);
    return ERRORS[code] ?? code;
  }
  return "Sem conexão com o servidor. Tente de novo.";
}

export function usePosError() {
  return useSyncExternalStore(
    subscribe,
    () => state.error,
    () => null
  );
}

export function clearPosError() {
  state.error = null;
  emit();
}

type Optimistic = (store: OptimisticLocalStore) => void;

/** Runs a mutation with an optional instant local change. */
function send<M extends FunctionReference<"mutation">>(
  fn: M,
  args: Omit<M["_args"], "session">,
  optimistic?: Optimistic
) {
  const client = convexClient();
  if (!client) {
    state.error = "Banco de dados não configurado.";
    emit();
    return Promise.resolve(undefined);
  }
  const full = { ...args, session: getSession() ?? "" } as M["_args"];
  return client
    .mutation(
      fn,
      full,
      optimistic ? { optimisticUpdate: optimistic } : undefined
    )
    .catch((err: unknown) => {
      if (err instanceof ConvexError && err.data === "POS_LOCKED") {
        setSession(null);
      }
      state.error = errorText(err);
      emit();
      return undefined;
    });
}

/* -------------------------------- session -------------------------------- */

let session: string | null | undefined;
const sessionListeners = new Set<() => void>();

export function getSession() {
  if (session === undefined) {
    try {
      session = localStorage.getItem(SESSION_KEY);
    } catch {
      session = null;
    }
  }
  return session;
}

export function setSession(token: string | null) {
  session = token;
  try {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // private mode
  }
  for (const l of sessionListeners) {
    l();
  }
}

export function useSession() {
  return useSyncExternalStore(
    (l) => {
      sessionListeners.add(l);
      return () => {
        sessionListeners.delete(l);
      };
    },
    () => getSession(),
    () => null
  );
}

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

export const isLowStock = (p: PosProduct) =>
  Boolean(p.trackStock) && (p.stock ?? 0) <= (p.minStock ?? 0);

/** Margin over the price, in percent (null without a cost). */
export function marginOf(p: Pick<PosProduct, "price" | "cost">) {
  if (p.cost === undefined || p.price <= 0) {
    return null;
  }
  return ((p.price - p.cost) / p.price) * 100;
}

/* ------------------------- optimistic order helpers ---------------------- */

function editOpen(
  store: OptimisticLocalStore,
  fn: (orders: ServerOrder[]) => ServerOrder[]
) {
  const cur = store.getQuery(api.pos.openOrders, {});
  if (cur) {
    store.setQuery(api.pos.openOrders, {}, fn(cur));
  }
}

function editOrder(
  store: OptimisticLocalStore,
  id: string,
  fn: (o: ServerOrder) => ServerOrder
) {
  editOpen(store, (orders) =>
    orders.map((o) => (o.id === id ? { ...fn(o), updatedAt: Date.now() } : o))
  );
}

function editCatalog(store: OptimisticLocalStore, fn: (c: Catalog) => Catalog) {
  const cur = store.getQuery(api.pos.catalog, {});
  if (cur) {
    store.setQuery(api.pos.catalog, {}, fn(cur));
  }
}

/* --------------------------------- orders -------------------------------- */

export function createOrder(init: { tableId?: string | null; name?: string }) {
  const now = Date.now();
  const order: PosOrder = {
    id: uid(),
    number: 0,
    tableId: init.tableId ?? null,
    name: init.name ?? "",
    items: [],
    taxRate: 0,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  send(
    api.pos.createOrder,
    { cid: order.id, tableId: order.tableId, name: order.name },
    (store) => editOpen(store, (orders) => [order as ServerOrder, ...orders])
  );
  return order;
}

export function updateOrder(id: string, patch: Partial<PosOrder>) {
  if (
    patch.status === "open" ||
    patch.status === "paying" ||
    patch.status === "void"
  ) {
    const status = patch.status;
    send(
      api.pos.setStatus,
      {
        orderId: id,
        status,
        payment: patch.payment
          ? {
              method: patch.payment.method,
              amount: patch.payment.amount,
              tip: patch.payment.tip,
              at: patch.payment.at,
            }
          : undefined,
      },
      (store) =>
        status === "void"
          ? editOpen(store, (orders) => orders.filter((o) => o.id !== id))
          : editOrder(store, id, (o) => ({
              ...o,
              status,
              payment: patch.payment ?? o.payment,
            }))
    );
    return;
  }
  const fields = {
    name: patch.name,
    taxRate: patch.taxRate,
    tableId: patch.tableId,
  };
  send(api.pos.patchOrder, { orderId: id, ...fields }, (store) =>
    editOrder(store, id, (o) => ({
      ...o,
      ...Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      ),
    }))
  );
}

function addLine(orderId: string, line: OrderItem) {
  send(api.pos.addItem, { orderId, item: line }, (store) =>
    editOrder(store, orderId, (o) => {
      const same = line.productId
        ? o.items.find((i) => i.productId === line.productId && !i.sent)
        : undefined;
      return {
        ...o,
        items: same
          ? o.items.map((i) =>
              i === same ? { ...i, qty: i.qty + line.qty } : i
            )
          : [...o.items, line],
      };
    })
  );
}

/** Adds a product (merging with an unsent line of the same product). */
export function addProduct(orderId: string, p: PosProduct) {
  addLine(orderId, {
    id: uid(),
    productId: p.id,
    name: p.name,
    price: p.price,
    cost: p.cost,
    qty: 1,
    sent: false,
  });
}

/** A typed amount from the keypad ("Valor avulso"). */
export function addCustomAmount(orderId: string, amount: number, name: string) {
  addLine(orderId, {
    id: uid(),
    productId: null,
    name,
    price: amount,
    qty: 1,
    sent: false,
  });
}

export function changeQty(orderId: string, itemId: string, delta: number) {
  send(api.pos.changeQty, { orderId, itemId, delta }, (store) =>
    editOrder(store, orderId, (o) => ({
      ...o,
      items: o.items
        .map((i) => (i.id === itemId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    }))
  );
}

export function sendToKitchen(orderId: string) {
  send(api.pos.sendToKitchen, { orderId }, (store) =>
    editOrder(store, orderId, (o) => ({
      ...o,
      items: o.items.map((i) => ({ ...i, sent: true })),
    }))
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Marks the order paid; the server takes the items out of stock. */
export function payOrder(orderId: string, payment: Omit<Payment, "at">) {
  const now = new Date();
  const order = read().orders.find((o) => o.id === orderId);
  if (order) {
    state.paidHere.set(orderId, {
      ...order,
      status: "paid",
      payment: { ...payment, at: now.getTime() },
      updatedAt: now.getTime(),
    });
  }
  return send(
    api.pos.pay,
    {
      orderId,
      payment: {
        method: payment.method,
        amount: payment.amount,
        tip: payment.tip,
        ref: payment.ref,
      },
      day: dayKey(now),
      hour: pad(now.getHours()),
    },
    (store) =>
      editOpen(store, (orders) => orders.filter((o) => o.id !== orderId))
  );
}

export function deleteOrder(orderId: string) {
  state.paidHere.delete(orderId);
  send(api.pos.deleteOrder, { orderId }, (store) =>
    editOpen(store, (orders) => orders.filter((o) => o.id !== orderId))
  );
}

/** Open (unpaid) order on a table, if any. */
export function openOrderFor(d: PosData, tableId: string) {
  return d.orders.find(
    (o) =>
      o.tableId === tableId && (o.status === "open" || o.status === "paying")
  );
}

/* ------------------------------ catalog/meta ----------------------------- */

export function saveProduct(p: PosProduct) {
  send(api.pos.saveProduct, { product: p }, (store) =>
    editCatalog(store, (c) => ({
      ...c,
      products: c.products.some((x) => x.id === p.id)
        ? c.products.map((x) => (x.id === p.id ? { ...p, stock: x.stock } : x))
        : [...c.products, p],
    }))
  );
}

export function deleteProduct(id: string) {
  send(api.pos.deleteProduct, { id }, (store) =>
    editCatalog(store, (c) => ({
      ...c,
      products: c.products.filter((p) => p.id !== id),
    }))
  );
}

/** Stock entry, count or loss (purchase updates the average cost). */
export function moveStock(move: Omit<StockMove, "id" | "at">) {
  if (move.kind === "sale") {
    return;
  }
  send(
    api.pos.moveStock,
    {
      productId: move.productId,
      qty: move.qty,
      kind: move.kind,
      unitCost: move.unitCost,
      note: move.note,
    },
    (store) =>
      editCatalog(store, (c) => ({
        ...c,
        products: c.products.map((p) =>
          p.id === move.productId
            ? { ...p, stock: (p.stock ?? 0) + move.qty, trackStock: true }
            : p
        ),
      }))
  );
}

function saveMetaField(
  field: "areas" | "settings" | "receipt",
  value: unknown
) {
  return send(api.pos.saveMeta, { [field]: value }, (store) =>
    editCatalog(store, (c) =>
      c.meta ? { ...c, meta: { ...c.meta, [field]: value } } : c
    )
  );
}

export function saveAreas(areas: FloorArea[]) {
  saveMetaField("areas", areas);
}

export function saveSettings(patch: Partial<PosSettings>) {
  saveMetaField("settings", { ...read().settings, ...patch });
}

/* Receipt design changes on every keystroke: shown at once, saved shortly after */
let receiptTimer: ReturnType<typeof setTimeout> | null = null;

export function saveReceipt(patch: Partial<ReceiptSettings>) {
  const next = { ...(receiptDraft ?? read().receipt), ...patch };
  receiptDraft = next;
  emit();
  if (receiptTimer) {
    clearTimeout(receiptTimer);
  }
  receiptTimer = setTimeout(() => {
    const value = receiptDraft;
    receiptDraft = null;
    receiptTimer = null;
    if (value) {
      saveMetaField("receipt", value);
    }
  }, 700);
}

/* ------------------------- printers (this device) ------------------------ */

function writePrinters(printers: PrinterConfig[]) {
  state.printers = printers;
  try {
    localStorage.setItem(PRINTERS_KEY, JSON.stringify(printers));
  } catch {
    // private mode
  }
  emit();
}

export function savePrinter(printer: PrinterConfig) {
  const list = state.printers;
  writePrinters(
    list.some((p) => p.id === printer.id)
      ? list.map((p) => (p.id === printer.id ? printer : p))
      : [...list, printer]
  );
}

export function deletePrinter(id: string) {
  writePrinters(state.printers.filter((p) => p.id !== id));
}

/* --------------------------------- setup --------------------------------- */

/**
 * First run: imports this device's old local POS (products, tables,
 * settings, receipt) or the sample menu into the shared database.
 */
export function bootstrapPos() {
  const base = seedData();
  let local: Partial<PosData> = {};
  try {
    local = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}");
  } catch {
    local = {};
  }
  const products = (
    local.products?.length ? local.products : base.products
  ).map(
    (p): PosProduct => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      color: p.color,
      available: p.available,
      cost: p.cost,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit ?? "un",
      trackStock: p.trackStock ?? false,
      stock: p.stock ?? 0,
      minStock: p.minStock ?? 0,
      description: p.description,
    })
  );
  return send(api.pos.bootstrap, {
    products,
    areas: local.areas ?? base.areas,
    settings: { ...base.settings, ...local.settings },
    receipt: { ...DEFAULT_RECEIPT, ...local.receipt },
    nextOrderNumber: local.nextOrderNumber ?? 1,
  });
}

/** For the "users" area: run an authenticated POS mutation. */
export function sendPos<M extends FunctionReference<"mutation">>(
  fn: M,
  args: Omit<M["_args"], "session">
) {
  return send(fn, args);
}
