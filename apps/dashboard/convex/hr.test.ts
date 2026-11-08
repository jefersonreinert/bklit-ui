import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { docStatus } from "../lib/hr/malta-documents";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

async function setup() {
  const t = convexTest(schema, modules);
  await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Ana", pin: "1234", device: "t" });
  const userId = await t.run(async (ctx) => {
    const u = await ctx.db.query("posUsers").first();
    if (!u) {
      throw new Error("no user");
    }
    return u._id;
  });
  return { t, userId, p: t.withIdentity(panel) };
}

describe("HR documents", () => {
  it("is hidden without the panel and saves a profile and a document", async () => {
    const { t, userId, p } = await setup();
    expect(await t.query(api.hr.employees, {})).toBeNull();
    await expect(
      t.mutation(api.hr.saveProfile, {
        userId,
        origin: "eu",
        payType: "hourly",
      })
    ).rejects.toThrow();

    await p.mutation(api.hr.saveProfile, {
      userId,
      origin: "non-eu",
      nationality: "Brasileira",
      iban: "mt84 malt 0110 0001",
      payType: "monthly",
      monthlySalary: 1600,
      hourlyRate: 9,
      jobTitle: "Bartender",
    });
    await p.mutation(api.hr.saveDocument, {
      userId,
      kind: "single-permit",
      number: "SP-1",
      expiresAt: "2027-01-01",
    });
    await expect(
      p.mutation(api.hr.saveDocument, { userId, kind: "nope" })
    ).rejects.toThrow("Tipo de documento inválido");

    const one = await p.query(api.hr.employee, { userId });
    expect(one?.profile).toMatchObject({
      origin: "non-eu",
      iban: "MT84MALT01100001",
      monthlySalary: 1600,
    });
    expect(one?.hourlyRate).toBe(9);
    expect(one?.docs).toHaveLength(1);
    const list = await p.query(api.hr.employees, {});
    expect(list?.[0]).toMatchObject({ origin: "non-eu", payType: "monthly" });
  });

  it("tells missing, expiring and expired apart", () => {
    const now = "2026-11-08";
    expect(docStatus(undefined, now)).toBe("missing");
    expect(docStatus({ hasFile: true }, now)).toBe("ok");
    expect(docStatus({ hasFile: true, expiresAt: "2026-11-01" }, now)).toBe(
      "expired"
    );
    expect(docStatus({ hasFile: true, expiresAt: "2026-12-01" }, now)).toBe(
      "expiring"
    );
    expect(docStatus({ hasFile: true, expiresAt: "2027-06-01" }, now)).toBe(
      "ok"
    );
  });
});
