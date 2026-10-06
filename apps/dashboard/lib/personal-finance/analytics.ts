import { CATEGORIES } from "./categorize";
import type { CategoryId, Txn } from "./types";

export type PfRange = "mes" | "3m" | "6m" | "12m" | "tudo";

export const RANGE_LABELS: Record<PfRange, string> = {
  mes: "Último mês",
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
  tudo: "Tudo",
};

const RANGE_MONTHS: Record<PfRange, number> = {
  mes: 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
  tudo: 0,
};

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const MERCHANT_NOISE = /^(to|transfer to|payment to|pagamento a?|pix para)\s+/i;
const SPACES = /\s+/g;

/** Money in / out of a line; fees always count as money out. */
export function flows(t: Txn) {
  return {
    in: t.amount > 0 ? t.amount : 0,
    out: (t.amount < 0 ? -t.amount : 0) + t.fee,
  };
}

/** Lines in range, anchored on the newest line (not today). */
export function inRange(txns: Txn[], range: PfRange) {
  const months = RANGE_MONTHS[range];
  if (!months || txns.length === 0) {
    return txns;
  }
  const last = txns.reduce((a, t) => (t.date > a ? t.date : a), "");
  const d = new Date(`${last}T12:00:00`);
  d.setMonth(d.getMonth() - months);
  const from = d.toISOString().slice(0, 10);
  return txns.filter((t) => t.date > from);
}

/** Excludes moves between the person's own accounts. */
export const external = (txns: Txn[]) => txns.filter((t) => !t.internal);

/** Latest known balance of an account (statement order = time order). */
function lastBalance(txns: Txn[], account: Txn["account"]) {
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i];
    if (t && t.account === account && t.balance !== null && !t.pending) {
      return t.balance;
    }
  }
  return null;
}

/** Statement order, oldest first (stable within a day). */
export function chronological(txns: Txn[]) {
  return txns
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i)
    .map((x) => x.t);
}

export function summarize(all: Txn[], range: Txn[]) {
  const sorted = chronological(all);
  let entradas = 0;
  let saidas = 0;
  for (const t of external(range)) {
    const f = flows(t);
    entradas += f.in;
    saidas += f.out;
  }
  const days = new Set(range.map((t) => t.date)).size || 1;
  const dates = range.map((t) => t.date).sort();
  return {
    entradas,
    saidas,
    resultado: entradas - saidas,
    conta: lastBalance(sorted, "main"),
    cofrinhos: lastBalance(sorted, "pocket"),
    mediaDiaria: saidas / days,
    count: range.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m}/${y?.slice(2)}`;
}

export function monthly(txns: Txn[]) {
  const map = new Map<string, { entradas: number; saidas: number }>();
  for (const t of external(txns)) {
    const key = t.date.slice(0, 7);
    const row = map.get(key) ?? { entradas: 0, saidas: 0 };
    const f = flows(t);
    row.entradas += f.in;
    row.saidas += f.out;
    map.set(key, row);
  }
  const keys = [...map.keys()].sort();
  const first = keys[0];
  const last = keys.at(-1);
  if (!(first && last)) {
    return [];
  }
  // Every month in between, so quiet months show as zero
  const rows: {
    month: string;
    key: string;
    entradas: number;
    saidas: number;
  }[] = [];
  const cursor = new Date(
    Number(first.slice(0, 4)),
    Number(first.slice(5)) - 1,
    1
  );
  for (let key = first; key <= last; ) {
    const v = map.get(key) ?? { entradas: 0, saidas: 0 };
    rows.push({
      month: monthLabel(key),
      key,
      entradas: Math.round(v.entradas * 100) / 100,
      saidas: Math.round(v.saidas * 100) / 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
    key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  }
  return rows;
}

/** End-of-day balances, forward-filled, for the main account and pockets. */
export function balanceSeries(txns: Txn[]) {
  const byDay = new Map<string, { conta?: number; cofrinhos?: number }>();
  for (const t of chronological(txns)) {
    if (t.balance === null || t.pending) {
      continue;
    }
    const day = byDay.get(t.date) ?? {};
    if (t.account === "main") {
      day.conta = t.balance;
    } else {
      day.cofrinhos = t.balance;
    }
    byDay.set(t.date, day);
  }
  const days = [...byDay.keys()].sort();
  const first = days[0];
  const last = days.at(-1);
  if (!(first && last)) {
    return [];
  }
  const out: { date: Date; conta: number; cofrinhos: number }[] = [];
  let conta = 0;
  let cofrinhos = 0;
  const cursor = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const day = byDay.get(key);
    conta = day?.conta ?? conta;
    cofrinhos = day?.cofrinhos ?? cofrinhos;
    out.push({ date: new Date(cursor), conta, cofrinhos });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface CategorySlice {
  id: CategoryId;
  label: string;
  value: number;
  color: string;
  count: number;
}

/** Spending by category (money out, internal moves excluded). */
export function byCategory(txns: Txn[]): CategorySlice[] {
  const map = new Map<CategoryId, { value: number; count: number }>();
  for (const t of external(txns)) {
    const f = flows(t);
    if (f.out <= 0) {
      continue;
    }
    // A fee on incoming money (e.g. currency exchange) is a fee expense
    const id: CategoryId = t.amount > 0 ? "taxas" : t.category;
    const row = map.get(id) ?? { value: 0, count: 0 };
    row.value += f.out;
    row.count += 1;
    map.set(id, row);
  }
  return [...map.entries()]
    .map(([id, v]) => ({
      id,
      label: CATEGORIES[id].label,
      color: CATEGORIES[id].color,
      value: Math.round(v.value * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.value - a.value);
}

export function merchantName(description: string) {
  return description.replace(MERCHANT_NOISE, "").replace(SPACES, " ").trim();
}

/** Where the money goes most: top payees by money out. */
export function topMerchants(txns: Txn[], limit = 8) {
  const map = new Map<
    string,
    { label: string; value: number; count: number }
  >();
  for (const t of external(txns)) {
    // Cash and currency exchange aren't places the money went
    if (t.amount >= 0 || t.kind === "atm" || t.kind === "exchange") {
      continue;
    }
    const label = merchantName(t.description);
    const key = label.toLowerCase();
    const row = map.get(key) ?? { label, value: 0, count: 0 };
    row.value += flows(t).out;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((m) => ({
      ...m,
      label: m.label.length > 24 ? `${m.label.slice(0, 23)}…` : m.label,
      value: Math.round(m.value * 100) / 100,
    }));
}

/** Spending per weekday (average per week). */
export function byWeekday(txns: Txn[]) {
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const totals = names.map(() => 0);
  for (const t of external(txns)) {
    const day = new Date(`${t.date}T12:00:00`).getDay();
    if (t.amount < 0) {
      totals[day] = (totals[day] ?? 0) + flows(t).out;
    }
  }
  const dates = txns.map((t) => t.date).sort();
  const weeks = Math.max(
    1,
    (new Date(`${dates.at(-1)}T12:00:00`).getTime() -
      new Date(`${dates[0]}T12:00:00`).getTime()) /
      (7 * 86_400_000)
  );
  // Monday first
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    dia: names[d] ?? "",
    valor: Math.round(((totals[d] ?? 0) / weeks) * 100) / 100,
  }));
}
