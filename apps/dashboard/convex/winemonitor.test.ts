import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const H = 3_600_000;
const POS_LOCKED = /POS_LOCKED/;
const T0 = Date.UTC(2026, 10, 4, 20);

const pour = (at: number, wine = "TA BETTA", ml = 125, price = 12) => ({
  dispenser: "Disp 1 TM16",
  wine,
  sku: "201",
  ml,
  price,
  discount: 0,
  at,
  cardId: "7EAFEBFE",
});

const snapshot = (takenAt: number, extra: object = {}) => ({
  company: "vinomad",
  takenAt,
  ms: 1000,
  node: { version: "1.8.43.0" },
  dispensers: [{ code: "10260796", name: "Disp 1 TM16", positions: 16 }],
  positions: [{ dispenser: "Disp 1 TM16", position: 1, residueMl: 275 }],
  wines: [{ name: "TA BETTA", sku: "201", prices: [2.8, 12, 16] }],
  cards: [{ cardId: "7EAFEBFE", kind: "credit", balance: 9.5 }],
  sales: [],
  salesFrom: takenAt - 24 * H,
  credits: [],
  changes: [],
  ...extra,
});

async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  return { t, session: token as string };
}

describe("wine monitor mirror", () => {
  it("stores the state and keeps pours after the portal's 24 h window", async () => {
    const { t, session } = await setup();
    await t.mutation(
      internal.winemonitor.ingest,
      snapshot(T0, { sales: [pour(T0 - 2 * H), pour(T0 - 1 * H)] })
    );
    // 15 minutes later the same two pours plus a new one: no duplicates
    await t.mutation(
      internal.winemonitor.ingest,
      snapshot(T0 + 0.25 * H, {
        sales: [pour(T0 - 2 * H), pour(T0 - 1 * H), pour(T0 + 0.1 * H)],
      })
    );
    // Two days later the portal no longer shows them: they stay in the app
    await t.mutation(
      internal.winemonitor.ingest,
      snapshot(T0 + 48 * H, { sales: [pour(T0 + 47 * H, "TRENEL", 25, 1.6)] })
    );
    const all = await t.query(api.winemonitor.sales, {
      session,
      company: "vinomad",
      from: 0,
    });
    expect(all.map((s) => s.wine)).toEqual([
      "TRENEL",
      "TA BETTA",
      "TA BETTA",
      "TA BETTA",
    ]);
    const state = await t.query(api.winemonitor.state, {
      session,
      company: "vinomad",
    });
    expect(state?.positions).toHaveLength(1);
    expect(state?.takenAt).toBe(T0 + 48 * H);
  });

  it("adds top-ups and bottle changes once and ignores older snapshots", async () => {
    const { t, session } = await setup();
    const credit = {
      record: "2094915",
      cardId: "7EAFEBFE",
      at: T0,
      oldValue: -48.1,
      newValue: 0,
      diff: 48.1,
    };
    const change = {
      kind: "change" as const,
      wine: "PICPOUL",
      dispenser: "Disp 4.1 DS",
      position: 17,
      oldMl: 180,
      newMl: 750,
      at: T0,
    };
    const snap = snapshot(T0, { credits: [credit], changes: [change] });
    const first = await t.mutation(internal.winemonitor.ingest, snap);
    const again = await t.mutation(
      internal.winemonitor.ingest,
      snapshot(T0 + H, { credits: [credit], changes: [change] })
    );
    expect(first).toMatchObject({ newCredits: 1, newChanges: 1 });
    expect(again).toMatchObject({ newCredits: 0, newChanges: 0 });
    const old = await t.mutation(internal.winemonitor.ingest, snapshot(T0));
    expect(old).toEqual({ skipped: "older snapshot" });

    const act = await t.query(api.winemonitor.activity, {
      session,
      company: "vinomad",
    });
    expect(act.credits).toHaveLength(1);
    expect(act.changes).toHaveLength(1);
    const cards = await t.query(api.winemonitor.cards, {
      session,
      company: "vinomad",
    });
    expect(cards?.cards).toHaveLength(1);
  });

  it("is closed to callers without a POS session", async () => {
    const { t } = await setup();
    await expect(
      t.query(api.winemonitor.state, { company: "vinomad" })
    ).rejects.toThrow(POS_LOCKED);
  });
});
