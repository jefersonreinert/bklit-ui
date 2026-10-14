import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("home wallpaper", () => {
  it("keeps only the latest wallpaper file, without the access code", async () => {
    const t = convexTest(schema, modules);
    const store = (type: string) =>
      t.run((ctx) => ctx.storage.store(new Blob(["x"], { type })));
    const exists = (id: Awaited<ReturnType<typeof store>>) =>
      t.run(async (ctx) => (await ctx.storage.get(id)) !== null);
    const first = await store("image/jpeg");
    const second = await store("video/mp4");

    const a = await t.mutation(api.home.setWallpaper, {
      storageId: first,
      kind: "image",
    });
    expect(a.ok).toBe(true);
    await t.mutation(api.home.setWallpaper, {
      storageId: second,
      kind: "video",
    });

    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query("homeWallpapers").collect());
    expect(rows.map((r) => r.kind)).toEqual(["video"]);

    await t.mutation(api.home.removeWallpaper, {});
    expect(await exists(second)).toBe(false);
  });

  it("refuses and deletes files over the size limit", async () => {
    const t = convexTest(schema, modules);
    const big = new Uint8Array(31 * 1024 * 1024);
    const id = await t.run((ctx) => ctx.storage.store(new Blob([big])));
    const res = await t.mutation(api.home.setWallpaper, {
      storageId: id,
      kind: "image",
    });
    expect(res.ok).toBe(false);
    expect(
      await t.run(async (ctx) => (await ctx.storage.get(id)) !== null)
    ).toBe(false);
  });
});
