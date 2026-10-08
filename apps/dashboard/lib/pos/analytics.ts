"use client";

import { api } from "@/convex/_generated/api";
import { METHOD_LABEL } from "./receipt";
import { dayKey, usePosQuery } from "./store";
import type { PaymentMethod } from "./types";

/**
 * Reports read the per-day totals the server keeps on every payment (one
 * small document per day), so they are instant and cheap at any volume.
 */

export type Daily = NonNullable<typeof api.pos.daily._returnType>[number];
export type PeriodId = "today" | "7d" | "30d" | "month";

export interface Period {
  from: Date;
  to: Date;
}

export function periodFor(id: PeriodId, now = new Date()): Period {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (id === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (id === "30d") {
    start.setDate(start.getDate() - 29);
  } else if (id === "month") {
    start.setDate(1);
  }
  return { from: start, to: now };
}

/** Live day totals for a period (undefined while loading, null: no access). */
export function usePosDaily(period: Period) {
  return usePosQuery(api.pos.daily, {
    from: dayKey(period.from),
    to: dayKey(period.to),
  }) as Daily[] | null | undefined;
}

export function summary(days: Daily[]) {
  const t = days.reduce(
    (a, d) => ({
      orders: a.orders + d.orders,
      sales: a.sales + d.sales,
      subtotal: a.subtotal + d.subtotal,
      tips: a.tips + d.tips,
      cost: a.cost + d.cost,
      items: a.items + d.items,
    }),
    { orders: 0, sales: 0, subtotal: 0, tips: 0, cost: 0, items: 0 }
  );
  const profit = t.subtotal - t.cost;
  return {
    ...t,
    profit,
    margin: t.subtotal > 0 ? (profit / t.subtotal) * 100 : 0,
    ticket: t.orders ? t.sales / t.orders : 0,
  };
}

const dayProfit = (d: Pick<Daily, "subtotal" | "cost">) => d.subtotal - d.cost;

/** Sales and profit per day (or per hour for a single day). */
export function series(days: Daily[], p: Period) {
  const single = dayKey(p.from) === dayKey(p.to);
  if (single) {
    const d = days[0];
    const ratio = d && d.sales > 0 ? dayProfit(d) / d.sales : 0;
    return Array.from({ length: 24 }, (_, h) => {
      const date = new Date(p.from);
      date.setHours(h);
      const sales = d?.hours[String(h).padStart(2, "0")] ?? 0;
      return { date, sales, profit: sales * ratio };
    }).filter((x) => x.date <= p.to);
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  const out: { date: Date; sales: number; profit: number }[] = [];
  for (
    const date = new Date(p.from);
    date <= p.to;
    date.setDate(date.getDate() + 1)
  ) {
    const d = byDay.get(dayKey(date));
    out.push({
      date: new Date(date),
      sales: d?.sales ?? 0,
      profit: d ? dayProfit(d) : 0,
    });
  }
  return out;
}

export interface ProductStat {
  id: string;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
}

export function productStats(days: Daily[]) {
  const map = new Map<string, ProductStat>();
  for (const d of days) {
    for (const [id, p] of Object.entries(d.products)) {
      const s = map.get(id) ?? {
        id,
        name: p.name,
        category: p.category,
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      s.qty += p.qty;
      s.revenue += p.revenue;
      s.cost += p.cost;
      s.profit += p.revenue - p.cost;
      map.set(id, s);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function byCategory(stats: ProductStat[]) {
  const map = new Map<string, number>();
  for (const s of stats) {
    map.set(s.category, (map.get(s.category) ?? 0) + s.revenue);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function byMethod(days: Daily[]) {
  const map = new Map<string, number>();
  for (const d of days) {
    for (const [m, v] of Object.entries(d.methods)) {
      map.set(m, (map.get(m) ?? 0) + v);
    }
  }
  return [...map.entries()]
    .map(([m, value]) => ({
      label: METHOD_LABEL[m as PaymentMethod] ?? m,
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Sales per hour of the day (when the bar is busiest). */
export function byHour(days: Daily[]) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}h`,
    sales: 0,
  }));
  for (const d of days) {
    for (const [h, v] of Object.entries(d.hours)) {
      const slot = hours[Number(h)];
      if (slot) {
        slot.sales += v;
      }
    }
  }
  const first = hours.findIndex((h) => h.sales > 0);
  if (first < 0) {
    return [];
  }
  let last = hours.length - 1;
  while (last > first && !hours[last]?.sales) {
    last--;
  }
  return hours.slice(first, last + 1);
}
