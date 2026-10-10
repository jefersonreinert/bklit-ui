import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * The Inner Circle Trader monitor. Runs every 5 minutes on the Convex
 * servers; `tick` itself decides whether a sync is due (interval set in
 * the panel, rate-limit resets, error backoff) so most runs cost nothing.
 */
crons.interval("ict monitor", { minutes: 5 }, internal.ict.tick, {});

export default crons;
