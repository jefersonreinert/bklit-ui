import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

describe("home wallpaper", () => {
  it("keeps only the latest wallpaper file", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    const first = await t.run((ctx) => ctx.storage.store(new Blob(["a"])));
    const second = await t.run((ctx) => ctx.storage.store(new Blob(["b"])));

    const a = await t.mutation(api.home.setWallpaper, {
      storageId: first,
      kind: "image",
    });
    expect(a.url).toBeTruthy();
    await t.mutation(api.home.setWallpaper, {
      storageId: second,
      kind: "video",
    });

    const exists = (id: typeof first) =>
      t.run(async (ctx) => (await ctx.storage.get(id)) !== null);
    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query("homeWallpapers").collect());
    expect(rows.map((r) => r.kind)).toEqual(["video"]);

    await t.mutation(api.home.removeWallpaper, {});
    expect(await exists(second)).toBe(false);
  });

  it("needs the panel", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.home.generateUploadUrl, {})).rejects.toThrow();
  });
});
