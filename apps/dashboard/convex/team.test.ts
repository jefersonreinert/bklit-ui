import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { addDays } from "./team";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Admin (1234), a waiter of "bar" (5555) and the business "bar". */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "bar",
    currency: "EUR",
    profile: { name: "Bar", color: "#000" },
    products: [],
  });
  const waiterId = await t.mutation(api.staff.save, {
    session: token,
    name: "Ana",
    role: "waiter",
    perms: [],
    color: "#111",
    active: true,
    pin: "5555",
    companies: ["bar"],
    jobTitle: "Garçom",
    hourlyRate: 9.5,
  });
  const waiter = await t.mutation(api.staff.login, {
    pin: "5555",
    device: "t",
  });
  if (!waiter.token) {
    throw new Error("login");
  }
  return { t, admin: token, waiter: waiter.token, waiterId };
}

describe("team rota and time clock", () => {
  it("plans shifts and copies a week", async () => {
    const { t, admin, waiterId } = await setup();
    await t.mutation(api.team.saveShift, {
      session: admin,
      company: "bar",
      userId: waiterId,
      date: "2026-11-02",
      start: "18:00",
      end: "02:00",
    });
    const copied = await t.mutation(api.team.copyWeek, {
      session: admin,
      company: "bar",
      from: "2026-11-02",
      to: "2026-11-09",
    });
    expect(copied).toBe(1);
    const week = await t.query(api.team.week, {
      session: admin,
      company: "bar",
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(week.shifts).toMatchObject([
      { date: "2026-11-09", start: "18:00", end: "02:00" },
    ]);
    expect(week.staff.find((s) => s.name === "Ana")).toMatchObject({
      jobTitle: "Garçom",
      hourlyRate: 9.5,
    });
  });

  it("lets staff see the rota and clock in, but not plan or see pay", async () => {
    const { t, waiter, waiterId } = await setup();
    await expect(
      t.mutation(api.team.saveShift, {
        session: waiter,
        company: "bar",
        userId: waiterId,
        date: "2026-11-02",
        start: "18:00",
        end: "23:00",
      })
    ).rejects.toThrow("POS_FORBIDDEN");
    await t.mutation(api.team.clockIn, {
      session: waiter,
      company: "bar",
      date: "2026-11-02",
    });
    await expect(
      t.mutation(api.team.clockIn, {
        session: waiter,
        company: "bar",
        date: "2026-11-02",
      })
    ).rejects.toThrow("ponto aberto");
    expect(await t.query(api.team.clock, { session: waiter })).toMatchObject({
      company: "bar",
    });
    await t.mutation(api.team.clockOut, { session: waiter });
    expect(await t.query(api.team.clock, { session: waiter })).toBeNull();
    const week = await t.query(api.team.week, {
      session: waiter,
      company: "bar",
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(week.manager).toBe(false);
    expect(week.punches).toHaveLength(1);
    expect(week.staff.every((s) => s.hourlyRate === null)).toBe(true);
  });

  it("keeps people out of businesses they don't work in", async () => {
    const { t, waiter } = await setup();
    await expect(
      t.mutation(api.team.clockIn, {
        session: waiter,
        company: "main",
        date: "2026-11-02",
      })
    ).rejects.toThrow("POS_FORBIDDEN");
  });

  it("adds days across months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-11-09", -7)).toBe("2026-11-02");
  });
});
