/**
 * How much to order, as pure functions (convex/orders.ts and tests).
 *
 * The bar should hold enough for the days until the delivery after next
 * (`coverDays`), plus its minimum as a safety stock, and never less than
 * its par level. What it already has and what is on order count; the rest
 * is rounded up to whole packs of the supplier (a case of 6).
 */

export interface ReorderInput {
  /** Balance now, base units. */
  onHand: number;
  /** In open purchase orders, base units. */
  onOrder: number;
  /** Average usage per day (sales + waste), base units. */
  perDay: number;
  /** Days the order must last (delivery cycle + lead time). */
  coverDays: number;
  min?: number;
  par?: number;
  /** Base units in one pack the supplier sells (case, bottle, kg). */
  pack: number;
}

export interface ReorderResult {
  /** Level to reach, base units. */
  target: number;
  /** Packs to order (0 = nothing). */
  packs: number;
  /** Base units the packs bring. */
  qty: number;
  /** Days the current stock lasts at this usage (null without usage). */
  daysLeft: number | null;
}

export function reorder(i: ReorderInput): ReorderResult {
  const perDay = Math.max(0, i.perDay);
  const target = Math.max(i.par ?? 0, perDay * Math.max(0, i.coverDays) + (i.min ?? 0));
  const have = Math.max(0, i.onHand) + Math.max(0, i.onOrder);
  const need = target - have;
  const pack = i.pack > 0 ? i.pack : 1;
  // Below a tenth of a pack is noise, not a reason to order
  const packs = need > pack * 0.1 ? Math.ceil(need / pack - 1e-9) : 0;
  return {
    target: round(target),
    packs,
    qty: round(packs * pack),
    daysLeft: perDay > 0 ? round(Math.max(0, i.onHand) / perDay, 10) : null,
  };
}

/**
 * A transfer between two bars of the group that helps both: the source
 * keeps at least its own target, the destination gets what it misses.
 * Whole containers only.
 */
export function transferSuggestion(
  from: { onHand: number; target: number },
  to: { onHand: number; target: number; onOrder: number },
  container: number
) {
  const surplus = from.onHand - from.target;
  const missing = to.target - to.onHand - to.onOrder;
  const size = container > 0 ? container : 1;
  const n = Math.floor(Math.min(surplus, missing) / size + 1e-9);
  return n > 0 ? round(n * size) : 0;
}

const round = (n: number, step = 1000) => Math.round(n * step) / step;

/** UTC day key (YYYY-MM-DD) of a time, for daily usage. */
export const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);
