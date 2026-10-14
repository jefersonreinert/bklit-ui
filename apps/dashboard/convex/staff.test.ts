import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { lockFor } from "./staff";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** A POS with its administrator (PIN 1234), created from the panel. */
async function setupPos() {
  const t = convexTest(schema, modules);
  await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "test" });
  return t;
}

describe("POS with PIN only", () => {
  it("signs in with the PIN, without the panel access code", async () => {
    const t = await setupPos();
    expect(await t.query(api.staff.status, {})).toMatchObject({
      hasUsers: true,
    });
    const res = await t.mutation(api.staff.login, {
      pin: "1234",
      device: "iPhone",
    });
    expect(res.token).toBeTruthy();
    const me = await t.query(api.staff.me, { session: res.token });
    expect(me?.name).toBe("Admin");
  });

  it("shows POS data only to a signed-in user", async () => {
    const t = await setupPos();
    expect(await t.query(api.pos.openOrders, {})).toBeNull();
    expect(await t.query(api.pos.catalog, { session: "nope" })).toBeNull();
    const { token } = await t.mutation(api.staff.login, {
      pin: "1234",
      device: "iPhone",
    });
    expect(await t.query(api.pos.openOrders, { session: token })).toEqual([]);
  });

  it("still needs the panel to create the first administrator", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.staff.setup, { name: "X", pin: "1111", device: "x" })
    ).rejects.toThrow();
  });

  it("locks for longer after each round of wrong PINs", () => {
    expect(lockFor(4)).toBe(0);
    expect(lockFor(5)).toBe(60_000);
    expect(lockFor(10)).toBe(120_000);
    expect(lockFor(15)).toBe(240_000);
    expect(lockFor(100)).toBe(60 * 60_000);
  });
});
