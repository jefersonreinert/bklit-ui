import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "jarvis-test-token-123";

async function setup() {
  vi.stubEnv("JARVIS_TOKEN", TOKEN);
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("posMeta", {
      key: "vinomad",
      profile: { name: "Vinomad", wine: true },
      areas: [],
      settings: { currency: "EUR" },
      receipt: {},
      nextOrderNumber: 2,
    });
    await ctx.db.insert("posOrders", {
      cid: "o1",
      number: 1,
      tableId: "t3",
      name: "Mesa 3",
      items: [
        {
          id: "i1",
          productId: null,
          name: "Olives",
          price: 5.5,
          qty: 2,
          sent: true,
        },
      ],
      taxRate: 0,
      status: "open",
      createdAt: now - 600_000,
      updatedAt: now,
      closedAt: 0,
      company: "vinomad",
    });
  });
  await t.mutation(internal.winemonitor.ingest, {
    company: "vinomad",
    takenAt: now,
    ms: 1,
    node: {},
    dispensers: [{ code: "1", name: "Disp 1", lastSeen: now }],
    positions: [
      { dispenser: "Disp 1", position: 4, wine: "TA BETTA", residueMl: 90 },
      { dispenser: "Disp 1", position: 5, wine: "GIRGENTINA", residueMl: 600 },
    ],
    wines: [],
    cards: [
      { cardId: "A", kind: "credit", balance: 20 },
      { cardId: "B", kind: "debit", balance: 50 },
    ],
    sales: [],
    salesFrom: now - 3_600_000,
    credits: [],
    changes: [],
  });
  return t;
}

describe("jarvis.context", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a wrong or missing token", async () => {
    const t = await setup();
    expect(await t.query(api.jarvis.context, { token: "nope" })).toBeNull();
    vi.stubEnv("JARVIS_TOKEN", "");
    expect(await t.query(api.jarvis.context, { token: "" })).toBeNull();
  });

  it("returns open orders, low bottles and prepaid cards", async () => {
    const t = await setup();
    const data = await t.query(api.jarvis.context, { token: TOKEN });
    const vinomad = data?.businesses.find((b) => b.key === "vinomad");
    expect(vinomad?.name).toBe("Vinomad");
    expect(vinomad?.openOrders).toEqual([
      expect.objectContaining({ name: "Mesa 3", total: 11, items: 2 }),
    ]);
    expect(vinomad?.wineMonitor?.lowBottles).toEqual([
      { machine: "Disp 1", position: 4, wine: "TA BETTA", ml: 90 },
    ]);
    expect(vinomad?.wineMonitor?.prepaidCards).toEqual({
      count: 1,
      balance: 20,
    });
    expect(vinomad?.wineMonitor?.offlineMachines).toEqual([]);
  });
});
