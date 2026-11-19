import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * The Inner Circle Trader monitor. Runs every 5 minutes on the Convex
 * servers; `tick` itself decides whether a sync is due (interval set in
 * the panel, rate-limit resets, error backoff) so most runs cost nothing.
 */
crons.interval("ict monitor", { minutes: 5 }, internal.ict.tick, {});

/**
 * OHLC feed (convex/ohlc.ts): candles beyond OHLC_KEEP_BARS and ticks older
 * than OHLC_TICK_WINDOW_MS move to the gzip history files.
 */
crons.interval("ohlc compact", { minutes: 10 }, internal.ohlc.compact, {});

/**
 * Lightspeed mode (convex/lightspeed.ts): menu, floor plans, open checks
 * and sales of the linked locations. Does nothing until connected.
 */
crons.interval(
  "lightspeed sync",
  { minutes: 10 },
  internal.lightspeed.syncAll,
  {}
);

/**
 * Stock (convex/sales.ts): new sales of the POS, Lightspeed and the wine
 * dispensers become stock usage through the technical sheets.
 */
crons.interval("stock from sales", { minutes: 5 }, internal.sales.runAll, {});

/**
 * Tableo (convex/tableo.ts): webhooks bring bookings at once; this re-reads
 * yesterday→tomorrow every 10 minutes and the next 60 days every night
 * (03:30 UTC) in case a delivery was lost. Does nothing until connected.
 */
crons.interval(
  "tableo recent",
  { minutes: 10 },
  internal.tableo.pullRecent,
  {}
);
crons.daily(
  "tableo full",
  { hourUTC: 3, minuteUTC: 30 },
  internal.tableo.pullFull,
  {}
);

export default crons;
