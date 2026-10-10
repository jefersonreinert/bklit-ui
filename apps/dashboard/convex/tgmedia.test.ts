import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

async function seed(
  t: ReturnType<typeof convexTest>,
  messageId: number,
  kind: string,
  day: string,
  chatId = "100"
) {
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["x".repeat(10)], { type: "image/jpeg" }))
  );
  const [year, m] = day.split("-");
  return await t.mutation(internal.tgmedia.add, {
    chatId,
    chatName: `Chat ${chatId}`,
    messageId,
    kind,
    mime: "image/jpeg",
    fileName: `${kind}-${messageId}.jpg`,
    size: 10,
    storageId,
    date: Date.parse(`${day}T12:00:00Z`) + messageId,
    day,
    month: `${year}-${m}`,
    year: year ?? "",
  });
}

const page = { numItems: 50, cursor: null };

describe("telegram gallery", () => {
  it("needs the panel token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.tgmedia.summary, {})).toBeNull();
    const r = await t.query(api.tgmedia.list, { paginationOpts: page });
    expect(r.page).toEqual([]);
  });

  it("never saves the same message twice", async () => {
    const t = convexTest(schema, modules);
    const a = await seed(t, 1, "photo", "2026-10-05");
    const b = await seed(t, 1, "photo", "2026-10-05");
    expect(b.id).toBe(a.id);
    const s = await t.withIdentity(panel).query(api.tgmedia.summary, {});
    expect(s?.total).toBe(1);
  });

  it("filters by year, month, day, kind and chat, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 1, "photo", "2025-12-31");
    await seed(t, 2, "video", "2026-10-05");
    await seed(t, 3, "pdf", "2026-10-05", "200");
    await seed(t, 4, "photo", "2026-10-06");
    const p = t.withIdentity(panel);
    const list = async (args: Record<string, unknown>) =>
      (
        await p.query(api.tgmedia.list, { paginationOpts: page, ...args })
      ).page.map((i) => i.messageId);
    expect(await list({})).toEqual([4, 3, 2, 1]);
    expect(await list({ year: "2025" })).toEqual([1]);
    expect(await list({ month: "2026-10" })).toEqual([4, 3, 2]);
    expect(await list({ day: "2026-10-05" })).toEqual([3, 2]);
    expect(await list({ month: "2026-10", kinds: ["photo", "pdf"] })).toEqual([
      4, 3,
    ]);
    expect(await list({ chatId: "200" })).toEqual([3]);
    const s = await p.query(api.tgmedia.summary, {});
    expect(s?.calendar["2026"]?.["2026-10"]).toEqual({
      "2026-10-05": 2,
      "2026-10-06": 1,
    });
    expect(s?.kinds).toEqual({ photo: 2, video: 1, pdf: 1 });
    const ids = await p.query(api.tgmedia.allIds, {
      month: "2026-10",
      kinds: ["video"],
    });
    expect(ids).toHaveLength(1);
    const urls = await p.query(api.tgmedia.urls, { ids: ids.map((i) => i.id) });
    expect(urls[0]?.url).toBeTruthy();
  });

  it("deletes the file with the entry", async () => {
    const t = convexTest(schema, modules);
    const a = await seed(t, 1, "photo", "2026-10-05");
    await t.withIdentity(panel).mutation(api.tgmedia.remove, { ids: [a.id] });
    const s = await t.withIdentity(panel).query(api.tgmedia.summary, {});
    expect(s?.total).toBe(0);
    const files = await t.run((ctx) =>
      ctx.db.system.query("_storage").collect()
    );
    expect(files).toHaveLength(0);
  });
});
