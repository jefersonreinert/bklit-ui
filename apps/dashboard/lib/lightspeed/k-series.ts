/**
 * Lightspeed Restaurant K-Series API: environments, scopes and parsers
 * that turn its responses (OpenAPI at api-docs.lsk.lightspeed.app) into
 * the app's own shapes. Pure: used by the Convex sync and the tests.
 */

export type LskEnv = "trial" | "prod";

export const LSK_ENVS: Record<
  LskEnv,
  { label: string; api: string; auth: string; portal: string }
> = {
  trial: {
    label: "Trial (demo)",
    api: "https://api.trial.lsk.lightspeed.app",
    auth: "https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect",
    portal: "https://developer-portal.lsk-demo.app",
  },
  prod: {
    label: "Produção",
    api: "https://api.lsk.lightspeed.app",
    auth: "https://auth.lsk-prod.app/realms/k-series/protocol/openid-connect",
    portal: "https://developer-portal.lsk-prod.app",
  },
};

/** Read menus/floors/checks, sales, items and staff; 40-day refresh. */
export const LSK_SCOPES = [
  "orders-api",
  "financial-api",
  "items",
  "staff-api",
  "offline_access",
];

export const isLskEnv = (v: unknown): v is LskEnv => v === "trial" || v === "prod";

export function authorizeUrl(
  env: LskEnv,
  clientId: string,
  redirectUri: string,
  state: string
) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: LSK_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
  });
  return `${LSK_ENVS[env].auth}/auth?${q}`;
}

/* --------------------------------- tokens -------------------------------- */

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** ms epoch */
  accessExpiresAt: number;
  /** ms epoch; 0 = unknown */
  refreshExpiresAt: number;
  scope: string;
}

export function parseTokens(raw: unknown, now: number): TokenSet {
  const r = (raw ?? {}) as Record<string, unknown>;
  const access = String(r.access_token ?? "");
  const refresh = String(r.refresh_token ?? "");
  if (!(access && refresh)) {
    throw new Error("Resposta de token sem access/refresh token.");
  }
  const exp = Number(r.expires_in ?? 1500);
  // offline_access tokens report 0 (valid while used every 30 days)
  const rexp = Number(r.refresh_expires_in ?? 0);
  return {
    accessToken: access,
    refreshToken: refresh,
    accessExpiresAt: now + Math.max(60, exp) * 1000,
    refreshExpiresAt: rexp > 0 ? now + rexp * 1000 : 0,
    scope: String(r.scope ?? ""),
  };
}

/* ---------------------------- businesses/locations ------------------------ */

export interface LskLocation {
  businessId: number;
  businessName: string;
  locationId: number;
  name: string;
}

export function parseBusinesses(raw: unknown): LskLocation[] {
  const list = Array.isArray(raw)
    ? raw
    : ((raw as { businesses?: unknown[] })?.businesses ?? []);
  const out: LskLocation[] = [];
  for (const b of list as Record<string, unknown>[]) {
    const locs = (b.businessLocations ?? []) as Record<string, unknown>[];
    for (const l of locs) {
      const id = Number(l.id);
      if (Number.isFinite(id)) {
        out.push({
          businessId: Number(b.id),
          businessName: String(b.name ?? ""),
          locationId: id,
          name: String(l.name ?? `Local ${id}`),
        });
      }
    }
  }
  return out;
}

/* ---------------------------------- menus --------------------------------- */

export interface LskMenuItem {
  sku: string;
  name: string;
  price: number;
  /** Top screen › sub-screen path in the menu. */
  group: string;
  subgroup?: string;
  color?: string;
  taxPct?: number;
  menu: string;
  modifierGroups: number;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Flattens a menu (GET /o/op/2/menu/load/{id}): top-level groups are POS
 * screens, nested groups sub-screens; items and deals become rows. The
 * same SKU on several screens keeps its first place.
 */
export function flattenMenu(raw: unknown): LskMenuItem[] {
  const m = (raw ?? {}) as {
    menuName?: string;
    menuEntryGroups?: Record<string, unknown>[];
  };
  const menu = String(m.menuName ?? "Menu");
  const seen = new Set<string>();
  const out: LskMenuItem[] = [];
  const walk = (entries: unknown, group: string, subgroup: string | undefined) => {
    for (const e of (Array.isArray(entries) ? entries : []) as Record<string, unknown>[]) {
      const type = String(e["@type"] ?? "");
      if (type === "group") {
        walk(e.menuEntry, group, subgroup ?? String(e.name ?? ""));
        continue;
      }
      if (type !== "menuItem" && type !== "menuDeal") {
        continue;
      }
      const sku = String(e.sku ?? "");
      const name = String(e.productName ?? "").trim();
      const key = sku || name;
      if (!(name && key) || seen.has(key) || e.asSubItem === true) {
        continue;
      }
      seen.add(key);
      out.push({
        sku,
        name,
        price: num(e.productPrice),
        group,
        subgroup: subgroup || undefined,
        color: typeof e.color === "string" ? e.color : undefined,
        taxPct: e.defaultTaxPercentage === undefined ? undefined : num(e.defaultTaxPercentage),
        menu,
        modifierGroups: Array.isArray(e.menuModifierGroups) ? e.menuModifierGroups.length : 0,
      });
    }
  };
  for (const g of m.menuEntryGroups ?? []) {
    walk(g.menuEntry, String(g.name ?? "Outros"), undefined);
  }
  return out;
}

/* ------------------------------ floors/tables ----------------------------- */

export interface LskFloor {
  id: string;
  name: string;
  tables: { id: string; number: number; name: string; seats: number }[];
}

export function parseFloors(raw: unknown): LskFloor[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    name: String(f.name ?? "Salão"),
    tables: ((f.tables ?? []) as Record<string, unknown>[])
      .filter((t) => t.active !== false)
      .map((t) => ({
        id: String(t.id ?? t.number),
        number: num(t.number),
        name: String(t.description || t.reference || t.number || ""),
        seats: Math.max(1, Math.round(num(t.defaultClientCount)) || 2),
      })),
  }));
}

/* ------------------------------- open checks ------------------------------ */

export interface LskCheck {
  id: string;
  /** Account identifier ("A1234.56"): adds items and payments to it. */
  identifier: string;
  number: number;
  table: number | null;
  name: string;
  covers: number;
  total: number;
  paid: number;
  staff: string;
  openedAt: number;
  items: { name: string; qty: number; amount: number }[];
}

export function parseChecks(raw: unknown): LskCheck[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.uuid ?? c.id ?? c.identifier ?? c.number),
    identifier: String(c.identifier ?? ""),
    number: num(c.number),
    table: c.tableNumber === undefined || c.tableNumber === null ? null : num(c.tableNumber),
    name: String(c.name ?? ""),
    covers: num(c.clientCount),
    total: num(c.currentAmount),
    paid: num(c.paidAmount),
    staff: String(c.staffName ?? ""),
    openedAt: Date.parse(String(c.openDate ?? "")) || 0,
    items: ((c.salesEntries ?? []) as Record<string, unknown>[])
      .filter((s) => s.active !== false)
      .map((s) => ({
        name: String(s.itemName ?? ""),
        qty: num(s.quantity),
        amount: num(s.amountWithTax),
      })),
  }));
}

/* ---------------------------------- sales --------------------------------- */

export interface LskSale {
  receiptId: string;
  closedAt: number;
  openedAt: number;
  cancelled: boolean;
  table: string;
  covers: number;
  staff: string;
  total: number;
  tax: number;
  tips: number;
  payments: { code: string; name: string; amount: number; tip: number }[];
  lines: { sku: string; name: string; qty: number; total: number; group: string }[];
}

/** One sale of GET /f/v2/business-location/{id}/sales (amounts are strings). */
export function parseSale(raw: unknown): LskSale | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  const receiptId = String(s.receiptId ?? s.accountReference ?? "");
  const closed = Date.parse(String(s.timeClosed ?? s.timeofCloseAndPaid ?? ""));
  if (!(receiptId && Number.isFinite(closed))) {
    return null;
  }
  // Child lines (modifiers) are already inside the parent's total
  const lines = ((s.salesLines ?? []) as Record<string, unknown>[])
    .filter((l) => !l.parentLineId)
    .map((l) => ({
      sku: String(l.sku ?? ""),
      name: String(l.nameOverride || l.name || ""),
      qty: num(l.quantity),
      total: num(l.totalNetAmountWithTax),
      tax: num(l.taxAmount),
      group: String(
        (l.accountingGroup as { name?: string } | undefined)?.name ?? l.statisticGroup ?? ""
      ),
    }));
  const payments = ((s.payments ?? []) as Record<string, unknown>[]).map((p) => ({
    code: String(p.code ?? ""),
    name: String(p.description ?? p.code ?? ""),
    amount: num(p.netAmountWithTax),
    tip: num(p.tip),
  }));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    receiptId,
    closedAt: closed,
    openedAt: Date.parse(String(s.timeOfOpening ?? s.timeofOpening ?? "")) || closed,
    cancelled: s.cancelled === true,
    table: String(s.tableName || s.tableNumber || ""),
    covers: num(s.nbCovers),
    staff: String(s.ownerName ?? ""),
    total: r2(lines.reduce((a, l) => a + l.total, 0)),
    tax: r2(lines.reduce((a, l) => a + l.tax, 0)),
    tips: r2(payments.reduce((a, p) => a + p.tip, 0)),
    payments,
    lines: lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      total: l.total,
      group: l.group,
    })),
  };
}

/* ------------------------- back-office items (Items API) ------------------ */

export interface LskCatalogItem {
  itemId: number;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  cost?: number;
  active: boolean;
  groupId?: number;
  group?: string;
  itemType?: string;
}

/** GET /items/v1/items: sellable items only (no modifiers or groups). */
export function parseCatalog(raw: unknown): LskCatalogItem[] {
  const list = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
  return list
    .filter((i) => {
      const t = String(i.itemType ?? "ITEM");
      return (t === "ITEM" || t === "SEQUENCE") && Number.isFinite(Number(i.id));
    })
    .map((i) => {
      const group = i.accountingGroup as { id?: number; name?: string } | undefined;
      const prices = (i.prices ?? []) as { amount?: number }[];
      return {
        itemId: Number(i.id),
        name: String(i.name ?? ""),
        sku: String(i.sku ?? ""),
        barcode: i.barcode ? String(i.barcode) : undefined,
        price: num(prices[0]?.amount),
        cost: i.costPrice === undefined || i.costPrice === null ? undefined : num(i.costPrice),
        active: i.active !== false && i.disabled !== true,
        groupId: group?.id === undefined ? undefined : Number(group.id),
        group: group?.name,
        itemType: i.itemType ? String(i.itemType) : undefined,
      };
    });
}

/** GET /f/finance/{id}/paymentMethods */
export function parseMethods(raw: unknown): { code: string; name: string }[] {
  const list = (Array.isArray(raw)
    ? raw
    : ((raw as { _embedded?: { paymentMethodList?: unknown[] } })?._embedded?.paymentMethodList ??
      [])) as Record<string, unknown>[];
  return list
    .map((m) => ({ code: String(m.code ?? ""), name: String(m.name ?? m.description ?? m.code ?? "") }))
    .filter((m) => m.code);
}

/** GET /f/finance/{id}/accountingGroups */
export function parseGroups(raw: unknown): { id: number; name: string }[] {
  const list = (Array.isArray(raw)
    ? raw
    : ((raw as { _embedded?: { accountingGroupList?: unknown[] } })?._embedded?.accountingGroupList ??
      (raw as { accountingGroups?: unknown[] })?.accountingGroups ??
      [])) as Record<string, unknown>[];
  return list
    .map((g) => ({ id: Number(g.accountingGroupId ?? g.id), name: String(g.name ?? "") }))
    .filter((g) => Number.isFinite(g.id) && g.name);
}

/* ------------------------- import into the own POS ------------------------ */

/** Lightspeed button colors are names; the POS uses hex tiles. */
const COLORS: Record<string, string> = {
  red: "#d9534f",
  orange: "#e8833a",
  yellow: "#e8c33a",
  green: "#5cb85c",
  blue: "#4a90d9",
  purple: "#8e6cc9",
  pink: "#e86ca6",
  brown: "#9c6b4a",
  grey: "#9aa0a6",
  gray: "#9aa0a6",
  black: "#444444",
};

export function tileColor(c: string | undefined, fallback: string) {
  if (!c) {
    return fallback;
  }
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    return c;
  }
  return COLORS[c.toLowerCase()] ?? fallback;
}

/**
 * Lays Lightspeed tables (no coordinates in the API) on the 1000 × 700
 * floor in a tidy grid, numbered in order.
 */
export function gridTables(
  tables: LskFloor["tables"],
  prefix: string
): { id: string; name: string; seats: number; x: number; y: number; w: number; h: number; shape: "square"; color: string }[] {
  const sorted = [...tables].sort((a, b) => a.number - b.number);
  const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(sorted.length * 1.4))));
  const rows = Math.max(1, Math.ceil(sorted.length / cols));
  const cellW = 1000 / cols;
  const cellH = Math.min(175, 700 / rows);
  const size = Math.max(50, Math.min(90, Math.min(cellW, cellH) - 24));
  return sorted.map((t, i) => ({
    id: `${prefix}-${t.id}`,
    name: String(t.number || t.name).slice(0, 12),
    seats: t.seats,
    x: Math.round((i % cols) * cellW + (cellW - size) / 2),
    y: Math.round(Math.floor(i / cols) * cellH + (cellH - size) / 2),
    w: Math.round(size),
    h: Math.round(size),
    shape: "square",
    color: "#e8dccb",
  }));
}
