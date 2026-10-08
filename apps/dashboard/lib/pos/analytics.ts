import { METHOD_LABEL } from "./receipt";
import { orderTotals } from "./store";
import type { PaymentMethod, PosData, PosOrder } from "./types";

/** Sales numbers for reports and product metrics (paid orders only). */

export interface Period {
  from: number;
  to: number;
}

const DAY = 86_400_000;

export function periodFor(
  id: "today" | "7d" | "30d" | "month",
  now = new Date()
) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (id === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (id === "30d") {
    start.setDate(start.getDate() - 29);
  } else if (id === "month") {
    start.setDate(1);
  }
  return { from: start.getTime(), to: now.getTime() };
}

export const paidIn = (data: PosData, p: Period) =>
  data.orders.filter(
    (o) =>
      o.status === "paid" &&
      (o.payment?.at ?? o.updatedAt) >= p.from &&
      (o.payment?.at ?? o.updatedAt) <= p.to
  );

function lineCost(data: PosData, productId: string | null, cost?: number) {
  if (cost !== undefined) {
    return cost;
  }
  return productId
    ? (data.products.find((p) => p.id === productId)?.cost ?? 0)
    : 0;
}

export function orderCost(data: PosData, o: PosOrder) {
  return o.items.reduce(
    (a, i) => a + lineCost(data, i.productId, i.cost) * i.qty,
    0
  );
}

export function summary(data: PosData, p: Period) {
  const orders = paidIn(data, p);
  let sales = 0;
  let subtotal = 0;
  let tips = 0;
  let cost = 0;
  let items = 0;
  for (const o of orders) {
    const t = orderTotals(o);
    sales += t.total;
    subtotal += t.subtotal;
    tips += o.payment?.tip ?? 0;
    cost += orderCost(data, o);
    items += o.items.reduce((a, i) => a + i.qty, 0);
  }
  const profit = subtotal - cost;
  return {
    orders: orders.length,
    sales,
    tips,
    cost,
    profit,
    margin: subtotal > 0 ? (profit / subtotal) * 100 : 0,
    ticket: orders.length ? sales / orders.length : 0,
    items,
  };
}

/** Sales and profit per day (or per hour for a single day). */
export function series(data: PosData, p: Period) {
  const hourly = p.to - p.from <= DAY;
  const buckets = new Map<number, { sales: number; profit: number }>();
  const keyOf = (t: number) => {
    const d = new Date(t);
    if (hourly) {
      d.setMinutes(0, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d.getTime();
  };
  const step = hourly ? DAY / 24 : DAY;
  for (let t = keyOf(p.from); t <= p.to; t += step) {
    buckets.set(keyOf(t), { sales: 0, profit: 0 });
  }
  for (const o of paidIn(data, p)) {
    const k = keyOf(o.payment?.at ?? o.updatedAt);
    const b = buckets.get(k) ?? { sales: 0, profit: 0 };
    const t = orderTotals(o);
    b.sales += t.total;
    b.profit += t.subtotal - orderCost(data, o);
    buckets.set(k, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ date: new Date(t), ...v }));
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

export function productStats(data: PosData, p: Period) {
  const map = new Map<string, ProductStat>();
  for (const o of paidIn(data, p)) {
    for (const i of o.items) {
      const id = i.productId ?? `avulso:${i.name}`;
      const product = i.productId
        ? data.products.find((x) => x.id === i.productId)
        : undefined;
      const s = map.get(id) ?? {
        id,
        name: product?.name ?? i.name,
        category: product?.category ?? "Avulso",
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      const c = lineCost(data, i.productId, i.cost) * i.qty;
      s.qty += i.qty;
      s.revenue += i.price * i.qty;
      s.cost += c;
      s.profit += i.price * i.qty - c;
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

export function byMethod(data: PosData, p: Period) {
  const map = new Map<PaymentMethod, number>();
  for (const o of paidIn(data, p)) {
    if (o.payment) {
      map.set(
        o.payment.method,
        (map.get(o.payment.method) ?? 0) + o.payment.amount
      );
    }
  }
  return [...map.entries()]
    .map(([m, value]) => ({ label: METHOD_LABEL[m], value }))
    .sort((a, b) => b.value - a.value);
}

/** Sales per hour of the day (when the bar is busiest). */
export function byHour(data: PosData, p: Period) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}h`,
    sales: 0,
  }));
  for (const o of paidIn(data, p)) {
    const h = new Date(o.payment?.at ?? o.updatedAt).getHours();
    const slot = hours[h];
    if (slot) {
      slot.sales += orderTotals(o).total;
    }
  }
  const first = hours.findIndex((h) => h.sales > 0);
  let last = hours.length - 1;
  while (last > 0 && !hours[last]?.sales) {
    last--;
  }
  return first < 0 ? [] : hours.slice(first, last + 1);
}
