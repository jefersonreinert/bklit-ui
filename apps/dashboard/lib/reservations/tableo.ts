/**
 * Tableo Restaurant API (https://tableo-public-docs.pages.dev): pure
 * helpers shared by the Convex sync (convex/tableo.ts), the screens and
 * the tests. Bookings flow both ways: Tableo → app through signed
 * webhooks plus a periodic pull, app → Tableo through the REST API.
 */

import {
  openWindow,
  type Source,
  type Status,
  toMin,
  type VenueSettings,
} from "./engine";

export type TableoEnv = "sandbox" | "production";

export const TABLEO_ENVS: Record<TableoEnv, { label: string; url: string }> = {
  production: { label: "Produção", url: "https://app.tableo.com" },
  sandbox: { label: "Sandbox (testes)", url: "https://devrms.tabdevx.com" },
};

export const isTableoEnv = (e: string): e is TableoEnv => e in TABLEO_ENVS;

/** Booking events we subscribe to (webhook.ping is sent by the test only). */
export const TABLEO_EVENTS = [
  "booking.created",
  "booking.updated",
  "booking.confirmed",
  "booking.accepted",
  "booking.cancelled",
  "booking.rejected",
  "booking.noshow",
  "booking.seated",
] as const;

/** Per token: 120 requests per minute and 3000 per hour. */
export const TABLEO_RATE = { perMinute: 120, perHour: 3000 };

export interface TableoTable {
  id: number;
  name: string;
  min: number;
  max: number;
}

export interface TableoArea {
  id: number;
  name: string;
  tables: TableoTable[];
}

/** A Tableo booking reduced to what the app stores. */
export interface TableoBooking {
  id: number;
  ref: string;
  /** Raw Tableo status (confirmed, accepted, cancelled, blocked…). */
  raw: string;
  status: Status;
  blocked: boolean;
  /** Venue-local service date and start time. */
  date: string;
  time: string;
  duration: number;
  adults: number;
  children: number;
  party: number;
  name: string;
  phone?: string;
  email?: string;
  comment?: string;
  privateComment?: string;
  areaId?: number;
  areaName?: string;
  tables: { id: number; name: string }[];
  channel?: string;
  tags: string[];
  patronId?: number;
  vip: boolean;
}

/* --------------------------------- parsing -------------------------------- */

type Json = Record<string, unknown>;

const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => {
  if (typeof v === "string") {
    return v.trim();
  }
  return typeof v === "number" ? String(v) : "";
};
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

const WALL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;
const OFFSET = /[zZ]|[+-]\d{2}:?\d{2}$/;
const DIGITS = /^\d+$/;
const SPACES = /\s+/;

/**
 * Venue-local date and time of a Tableo timestamp. Uses the restaurant's
 * time zone when the runtime knows it, otherwise the wall clock written in
 * the timestamp (Tableo writes it with the restaurant's own offset).
 */
export function localParts(stamp: string, timeZone?: string) {
  const wall = WALL.exec(stamp);
  if (!wall) {
    return null;
  }
  const fallback = { date: wall[1] as string, time: `${wall[2]}:${wall[3]}` };
  const at = Date.parse(stamp);
  if (!(timeZone && Number.isFinite(at) && OFFSET.test(stamp))) {
    return fallback;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
    const date = `${p("year")}-${p("month")}-${p("day")}`;
    const time = `${p("hour")}:${p("minute")}`;
    return WALL.test(`${date}T${time}`) ? { date, time } : fallback;
  } catch {
    return fallback;
  }
}

/** The day before YYYY-MM-DD. */
export function prevDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Service date of a start time: 00:30 belongs to the evening before when
 * that day's opening hours run past midnight (engine.ts keeps it there).
 */
export function serviceDate(s: VenueSettings, date: string, time: string) {
  const before = prevDay(date);
  const w = openWindow(s, before);
  const t = toMin(time);
  return w && w.close > 1440 && t + 1440 < w.close ? before : date;
}

/** Our status for a Tableo status (bookings, fsm_status and stats names). */
export function statusFromTableo(raw: string): Status {
  const s = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (s.includes("cancel") || s.includes("reject") || s === "declined") {
    return "cancelled";
  }
  if (s.includes("noshow") || s.includes("no_show")) {
    return "no_show";
  }
  if (s.includes("arrived") || s.includes("seated") || s === "checked_in") {
    return "seated";
  }
  if (s.includes("complet") || s.includes("left") || s.includes("finish")) {
    return "completed";
  }
  if (s.includes("pending") || s.includes("request") || s.includes("waiting")) {
    return "pending";
  }
  return "confirmed";
}

const RANK: Record<Status, number> = {
  pending: 0,
  confirmed: 1,
  seated: 2,
  completed: 3,
  cancelled: 4,
  no_show: 4,
};

/** The further along of two statuses (cancelled/no-show end a booking). */
export function furthest(a: Status, b: Status): Status {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Status to keep when Tableo reports one: a cancellation or no-show at
 * Tableo always wins, but Tableo never moves a booking backwards from
 * seated/completed (the POS seats and closes tables on its own).
 */
export function mergeStatus(local: Status, incoming: Status): Status {
  if (RANK[incoming] === 4 || RANK[incoming] >= RANK[local]) {
    return incoming;
  }
  return local === "seated" || local === "completed" ? local : incoming;
}

/** Status a webhook event announces (null when it carries no change). */
export function statusFromEvent(event: string): Status | null {
  switch (event) {
    case "booking.confirmed":
    case "booking.accepted":
      return "confirmed";
    case "booking.cancelled":
    case "booking.rejected":
      return "cancelled";
    case "booking.noshow":
      return "no_show";
    case "booking.seated":
      return "seated";
    default:
      return null;
  }
}

/** Our channel for Tableo's booking source name ("Online Widget"…). */
export function sourceFromTableo(channel: string | undefined): Source {
  const c = (channel ?? "").toLowerCase();
  const pairs: [string, Source][] = [
    ["google", "google"],
    ["instagram", "instagram"],
    ["facebook", "facebook"],
    ["whatsapp", "whatsapp"],
    ["walk", "walkin"],
    ["phone", "phone"],
    ["telef", "phone"],
  ];
  return pairs.find(([k]) => c.includes(k))?.[1] ?? "tableo";
}

const minutesBetween = (a: string, b: string) => {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y)
    ? Math.round((y - x) / 60_000)
    : 0;
};

/** A booking of any Tableo response or webhook snapshot. */
export function parseBooking(
  raw: unknown,
  opts: { timeZone?: string; defaultDuration?: number } = {}
): TableoBooking | null {
  const b = obj(raw);
  const id = num(b.id);
  const start = str(b.date);
  const when = localParts(start, opts.timeZone);
  if (id === undefined || !when) {
    return null;
  }
  const status = str(b.status) || str(b.fsm_status);
  const blocked = [str(b.status), str(b.fsm_status)].some(
    (x) => x.toLowerCase() === "blocked"
  );
  const adults = num(b.adults) ?? num(b.no_of_adults) ?? 0;
  const children = num(b.children) ?? num(b.no_of_children) ?? 0;
  const patron = obj(b.patron);
  const tags = obj(patron.tags);
  const end = str(b.end_time);
  const span = end ? minutesBetween(start, end) : 0;
  const area = obj(b.dining_area);
  const name =
    str(patron.name) ||
    [str(patron.first_name), str(patron.last_name)].filter(Boolean).join(" ");
  const phone = str(patron.mobile_number) || undefined;
  return {
    id,
    ref: str(b.reference) || String(id),
    raw: status,
    status: furthest(
      statusFromTableo(status),
      str(b.fsm_status) ? statusFromTableo(str(b.fsm_status)) : "pending"
    ),
    blocked,
    date: when.date,
    time: when.time,
    duration:
      span >= 15 && span <= 24 * 60 ? span : (opts.defaultDuration ?? 120),
    adults,
    children,
    party: Math.max(1, adults + children),
    name,
    phone,
    email: str(patron.email).toLowerCase() || undefined,
    comment: str(b.comment) || undefined,
    privateComment: str(b.private_comment) || undefined,
    areaId: num(area.id),
    areaName: str(area.name) || undefined,
    tables: arr(b.tables)
      .map((t) => ({ id: num(obj(t).id), name: str(obj(t).name) }))
      .filter((t): t is { id: number; name: string } => t.id !== undefined),
    channel: str(obj(b.booking_source).name) || undefined,
    tags: arr(b.booking_tags)
      .map((t) => str(obj(t).name))
      .filter(Boolean),
    patronId: num(patron.id),
    vip: tags.is_vip === true,
  };
}

/** Dining areas with their tables (GET /dining-areas-with-tables). */
export function parseAreas(raw: unknown): TableoArea[] {
  return arr(obj(raw).data ?? raw)
    .map((a) => {
      const area = obj(a);
      return {
        id: num(area.id) ?? -1,
        name: str(area.name),
        tables: arr(area.tables)
          .map((t) => {
            const x = obj(t);
            return {
              id: num(x.id) ?? -1,
              name: str(x.name),
              min: num(x.min_covers) ?? 1,
              max: num(x.max_covers) ?? num(x.covers) ?? 2,
            };
          })
          .filter((t) => t.id >= 0),
      };
    })
    .filter((a) => a.id >= 0);
}

const STATUS_HINT: Record<number, string> = {
  401: " (token inválido ou revogado)",
  403: " (token sem permissão restaurant-api, API desligada ou IP não liberado)",
  429: " (limite de 120 pedidos/min)",
};

/** Error text of a Tableo response body (standard or validation format). */
export function errorOf(status: number, body: unknown): string {
  const b = obj(body);
  const e = obj(b.error);
  const fields = obj(b.errors ?? e.details);
  const first = Object.values(fields)
    .flatMap((v) => arr(v).map(str))
    .find(Boolean);
  const msg = str(e.message) || str(b.message) || `HTTP ${status}`;
  const code = str(e.code);
  const hint = STATUS_HINT[status] ?? "";
  return `${code ? `${code}: ` : ""}${first && first !== msg ? `${msg} ${first}` : msg}${hint}`.slice(
    0,
    300
  );
}

/* --------------------------------- tables --------------------------------- */

const LABEL = /^(table|mesa|tavolo|t|m)\s*[-#.]?\s*/i;

/** "T1", "Table 1", "Mesa 01" and "1" all become "1". */
export function tableKey(name: string) {
  const s = name.trim().toLowerCase().replace(LABEL, "");
  const n = s.replace(/[^a-z0-9]/g, "");
  return DIGITS.test(n) ? String(Number(n)) : n;
}

/**
 * Tableo table id → POS table id by name, keeping the links already set.
 * A POS table is used only once.
 */
export function autoMap(
  areas: TableoArea[],
  pos: { id: string; name: string; area?: string }[],
  current: Record<string, string> = {}
): Record<string, string> {
  const ids = new Set(pos.map((t) => t.id));
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const [k, v] of Object.entries(current)) {
    if (ids.has(v) && !used.has(v)) {
      out[k] = v;
      used.add(v);
    }
  }
  for (const a of areas) {
    for (const t of a.tables) {
      if (out[String(t.id)]) {
        continue;
      }
      const key = tableKey(t.name);
      const same = pos.filter(
        (p) => !used.has(p.id) && tableKey(p.name) === key
      );
      const hit =
        same.find((p) => p.area && tableKey(p.area) === tableKey(a.name)) ??
        same[0];
      if (key && hit) {
        out[String(t.id)] = hit.id;
        used.add(hit.id);
      }
    }
  }
  return out;
}

/** POS table ids of a Tableo booking's tables. */
export function posTablesOf(
  tables: { id: number }[],
  map: Record<string, string>
): string[] {
  return [
    ...new Set(
      tables
        .map((t) => map[String(t.id)])
        .filter((x): x is string => Boolean(x))
    ),
  ];
}

/** Tableo table ids of POS tables (reverse of the mapping). */
export function tableoTablesOf(
  tables: string[],
  map: Record<string, string>
): number[] {
  const back = new Map(Object.entries(map).map(([k, v]) => [v, Number(k)]));
  return tables
    .map((t) => back.get(t))
    .filter((x): x is number => x !== undefined && Number.isFinite(x));
}

/** Dining area of the first mapped table, else the default one. */
export function areaFor(
  tableIds: number[],
  areas: TableoArea[],
  fallback?: number
): number | undefined {
  for (const id of tableIds) {
    const a = areas.find((x) => x.tables.some((t) => t.id === id));
    if (a) {
      return a.id;
    }
  }
  return fallback ?? areas[0]?.id;
}

/* ------------------------------ outgoing data ----------------------------- */

const PREFIXES = [
  "+356",
  "+351",
  "+353",
  "+380",
  "+44",
  "+55",
  "+39",
  "+33",
  "+34",
  "+49",
  "+31",
  "+32",
  "+41",
  "+43",
  "+46",
  "+47",
  "+48",
  "+61",
  "+65",
  "+91",
  "+1",
  "+7",
];

/** Tableo phone fields of a stored number ("+35612345678"). */
export function phoneParts(phone: string | undefined) {
  if (!phone) {
    return {};
  }
  const p = phone.startsWith("00") ? `+${phone.slice(2)}` : phone;
  const prefix = p.startsWith("+")
    ? PREFIXES.find((x) => p.startsWith(x))
    : undefined;
  return {
    mobile_number: p.slice(0, 20),
    ...(prefix ? { mobile_prefix: prefix } : {}),
  };
}

export function nameParts(name: string) {
  const parts = name.trim().split(SPACES);
  const first = parts.shift() ?? name;
  return {
    first_name: first.slice(0, 100),
    last_name: (parts.join(" ") || "-").slice(0, 100),
  };
}

export interface LocalBooking {
  name: string;
  phone?: string;
  email?: string;
  date: string;
  time: string;
  duration: number;
  party: number;
  requests?: string;
  notes?: string;
}

/** Body of POST /bookings. */
export function createBody(b: LocalBooking, diningArea: number) {
  return {
    date: `${b.date}T${b.time}:00`,
    adults: Math.max(1, b.party),
    children: 0,
    dining_area_id: diningArea,
    ...(b.requests ? { comment: b.requests.slice(0, 500) } : {}),
    patron: {
      ...nameParts(b.name),
      ...(b.email ? { email: b.email } : {}),
      ...phoneParts(b.phone),
    },
  };
}

/** Body of PATCH /bookings/{booking} (every field we keep in step). */
export function patchBody(
  b: LocalBooking,
  extra: { tableIds?: number[]; diningArea?: number } = {}
) {
  return {
    booking_date: b.date,
    booking_time: b.time,
    duration: Math.max(15, Math.round(b.duration)),
    adults: Math.max(1, b.party),
    children: 0,
    comment: (b.requests ?? "").slice(0, 500),
    private_comment: (b.notes ?? "").slice(0, 500),
    ...nameParts(b.name),
    ...(b.email ? { email: b.email.slice(0, 255) } : {}),
    ...phoneParts(b.phone),
    ...(extra.tableIds?.length ? { table_ids: extra.tableIds } : {}),
    ...(extra.diningArea !== undefined
      ? { dining_area_id: extra.diningArea }
      : {}),
  };
}

/** Tableo call that moves a booking to our status (null: none exists). */
export function statusCall(
  next: Status,
  prev: Status
): { path: string; body?: Json } | null {
  switch (next) {
    case "cancelled":
      return { path: "cancel" };
    case "no_show":
      return { path: "no-show" };
    case "seated":
      return { path: "check-in" };
    case "confirmed":
      return prev === "pending"
        ? { path: "status", body: { status: "accepted" } }
        : null;
    default:
      return null;
  }
}

/* -------------------------------- webhooks -------------------------------- */

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  // Constant time: always compares every character
  let same = true;
  for (let i = 0; i < a.length; i++) {
    same = a.charCodeAt(i) === b.charCodeAt(i) && same;
  }
  return same;
}

/** Deliveries older than this are refused (replays). */
export const SIGNATURE_TOLERANCE_S = 300;

/**
 * Checks a delivery: the "Tableo-Signature: t=…,v1=…" header (HMAC of
 * "{t}.{raw body}", within 5 minutes), else the legacy
 * "X-Webhook-Signature: sha256=…" header over the raw body.
 */
export async function verifyTableoSignature(opts: {
  body: string;
  secret: string;
  header?: string | null;
  legacy?: string | null;
  nowSec?: number;
}): Promise<boolean> {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (opts.header) {
    const parts = Object.fromEntries(
      opts.header.split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      })
    );
    const t = Number(parts.t);
    const v1 = String(parts.v1 ?? "").toLowerCase();
    if (!(Number.isFinite(t) && v1)) {
      return false;
    }
    if (Math.abs(now - t) > SIGNATURE_TOLERANCE_S) {
      return false;
    }
    return sameText(await hmacHex(opts.secret, `${t}.${opts.body}`), v1);
  }
  if (opts.legacy) {
    const want = `sha256=${await hmacHex(opts.secret, opts.body)}`;
    return sameText(want, opts.legacy.trim().toLowerCase());
  }
  return false;
}

/** HMAC helper for tests and the Settings "simulate" check. */
export const signTableo = hmacHex;
