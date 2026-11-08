import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { docStatus } from "../lib/hr/malta-documents";
import { easter, maltaHolidays, payFor } from "../lib/hr/pay";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SHA256 = /^[0-9a-f]{64}$/;
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

describe("Pay (Malta)", () => {
  const h = (day: string, hh: number, len: number) => {
    const t = Date.parse(`${day}T${String(hh).padStart(2, "0")}:00:00Z`);
    return { in: t, out: t + len * 3_600_000, date: day };
  };

  it("knows Good Friday and the fixed holidays", () => {
    expect(easter(2026)).toBe("2026-04-05");
    const hol = maltaHolidays(2026);
    expect(hol.get("2026-04-03")).toBe("Good Friday");
    expect(hol.get("2026-06-07")).toBe("Sette Giugno");
    expect(hol.size).toBe(14);
  });

  it("pays hourly with weekly overtime, Sundays and holidays", () => {
    // Mon 2 Nov 2026 … Sat 7: 6 × 8 h = 48 h → 8 h overtime on Saturday
    const punches = [2, 3, 4, 5, 6, 7].map((d) =>
      h(`2026-11-${String(d).padStart(2, "0")}`, 10, 8)
    );
    punches.push(h("2026-11-08", 10, 4)); // Sunday, still the same week
    const r = payFor(
      {
        month: "2026-11",
        punches,
        payType: "hourly",
        hourlyRate: 10,
        adjustHours: 0,
      },
      { weeklyHours: 40, overtime: 1.5, sunday: 1, holiday: 2 }
    );
    expect(r.hours).toBe(52);
    expect(r.overtime).toBe(12);
    expect(r.sunday).toBe(4);
    // 40 h × 10 + 12 h × 15
    expect(r.gross).toBe(580);
  });

  it("monthly salary pays only premiums and overtime on top", () => {
    const punches = [h("2026-12-08", 10, 8)]; // Immaculate Conception
    const r = payFor(
      {
        month: "2026-12",
        punches,
        payType: "monthly",
        monthlySalary: 1600,
        hourlyRate: 10,
        adjustHours: 1,
      },
      { weeklyHours: 40, overtime: 1.5, sunday: 1, holiday: 2 }
    );
    expect(r.holiday).toBe(8);
    // salary + 8 h × 10 × (2 − 1) + 1 h adjustment × 10
    expect(r.gross).toBe(1690);
    expect(r.extras).toBe(90);
  });

  it("ignores open punches and days of the previous month", () => {
    const r = payFor({
      month: "2026-11",
      punches: [
        h("2026-10-30", 10, 8),
        { in: 1, out: null, date: "2026-11-02" },
      ],
      payType: "hourly",
      hourlyRate: 10,
      adjustHours: 0,
    });
    expect(r.hours).toBe(0);
    expect(r.open).toBe(1);
  });
});

describe("Contracts", () => {
  it("is created from the HR file, signed by both and frozen", async () => {
    const { t, userId, p } = await setup();
    await expect(
      p.mutation(api.contracts.create, {
        userId,
        startDate: "2026-12-01",
        probationMonths: 6,
        weeklyHours: 40,
      })
    ).rejects.toThrow("ficha de RH");
    await p.mutation(api.hr.saveProfile, {
      userId,
      origin: "non-eu",
      nationality: "Brazilian",
      passportNumber: "FX123",
      address: "Sliema",
      payType: "hourly",
      hourlyRate: 9,
      jobTitle: "Bartender",
      workplace: "the-brew",
    });
    const id = await p.mutation(api.contracts.create, {
      userId,
      startDate: "2026-12-01",
      probationMonths: 6,
      weeklyHours: 40,
    });
    const [c] = (await p.query(api.contracts.list, { userId })) ?? [];
    expect(c?.status).toBe("draft");
    expect(c?.fields.employer.name).toBe("Tolok (Malta) Limited");
    expect(c?.hash).toMatch(SHA256);
    const token = c?.token ?? "";
    // Drafts are not reachable by link, and the company signs before sending
    expect(await t.query(api.contracts.forSigning, { token })).toBeNull();
    await expect(p.mutation(api.contracts.send, { id })).rejects.toThrow(
      "empresa assina"
    );
    const sig = "data:image/png;base64,iVBORw0KGgo=";
    await p.mutation(api.contracts.signAsEmployer, { id, signature: sig });
    await p.mutation(api.contracts.send, { id });
    const open = await t.query(api.contracts.forSigning, { token });
    expect(open?.status).toBe("sent");

    const post = (body: object) =>
      t.fetch("/hr/sign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.4",
        },
        body: JSON.stringify(body),
      });
    expect(
      (await post({ token, name: "Ana Silva", signature: sig })).status
    ).toBe(400);
    const ok = await post({
      token,
      name: "Ana Silva",
      signature: sig,
      agree: true,
    });
    expect(ok.status).toBe(200);
    const again = await post({
      token,
      name: "Ana Silva",
      signature: sig,
      agree: true,
    });
    expect((await again.json()).error).toContain("já foi assinado");
    const done = await t.query(api.contracts.forSigning, { token });
    expect(done).toMatchObject({
      status: "signed",
      employeeName: "Ana Silva",
      employeeIp: "1.2.3.4",
    });
    await expect(p.mutation(api.contracts.cancel, { id })).rejects.toThrow();
  });
});

describe("Payroll month", () => {
  it("adds corrections and locks them once approved", async () => {
    const { userId, p } = await setup();
    await p.mutation(api.payroll.addAdjustment, {
      userId,
      month: "2026-11",
      hours: 2,
      note: "Inventário",
    });
    let rows = await p.query(api.payroll.month, { month: "2026-11" });
    expect(rows?.[0]?.adjustments).toHaveLength(1);
    await p.mutation(api.payroll.approve, {
      userId,
      month: "2026-11",
      hours: 2,
      gross: 18,
    });
    await expect(
      p.mutation(api.payroll.addAdjustment, {
        userId,
        month: "2026-11",
        hours: 1,
        note: "x",
      })
    ).rejects.toThrow("aprovado");
    await p.mutation(api.payroll.reopen, { userId, month: "2026-11" });
    rows = await p.query(api.payroll.month, { month: "2026-11" });
    expect(rows?.[0]?.approvedAt).toBeUndefined();
  });
});
