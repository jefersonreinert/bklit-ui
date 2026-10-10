import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

describe("telegram state", () => {
  it("needs the panel token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.telegram.status, {})).toBeNull();
    await expect(
      t.mutation(api.telegram.updateSettings, { assistantWrites: true })
    ).rejects.toThrow("Unauthenticated");
  });

  it("never returns the api_hash or the session", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.telegram.storeCredentials, {
      apiId: 123_456,
      apiHash: "f".repeat(32),
    });
    await t.mutation(internal.telegram.setSession, {
      session: "1BVtsOK-secret-session",
      me: { id: "42", name: "Casa Brasa", username: "casabrasa" },
    });
    const s = await t.withIdentity(panel).query(api.telegram.status, {});
    expect(s?.connected).toBe(true);
    expect(s?.credentials).toBe(true);
    expect(s?.me?.username).toBe("casabrasa");
    const text = JSON.stringify(s);
    expect(text).not.toContain("ffffffff");
    expect(text).not.toContain("secret-session");
  });

  it("masks the phone of a login in progress", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.telegram.setPending, {
      pending: {
        kind: "phone",
        session: "temp",
        startedAt: 1,
        phone: "+5511999990000",
        phoneCodeHash: "hash",
        codeVia: "app",
      },
    });
    const s = await t.withIdentity(panel).query(api.telegram.status, {});
    expect(s?.pending?.phone).toBe("+55 •••• 0000");
    expect(JSON.stringify(s)).not.toContain("hash");
    await t.withIdentity(panel).mutation(api.telegram.cancelLogin, {});
    const after = await t.withIdentity(panel).query(api.telegram.status, {});
    expect(after?.pending).toBeNull();
  });

  it("drops the session when the app credentials change", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.telegram.storeCredentials, {
      apiId: 1,
      apiHash: "a".repeat(32),
    });
    await t.mutation(internal.telegram.setSession, {
      session: "s",
      me: { id: "1", name: "x" },
    });
    // Same credentials keep it
    await t.mutation(internal.telegram.storeCredentials, {
      apiId: 1,
      apiHash: "a".repeat(32),
    });
    expect((await t.query(internal.telegram.secrets, {})).session).toBe("s");
    await t.mutation(internal.telegram.storeCredentials, {
      apiId: 2,
      apiHash: "a".repeat(32),
    });
    expect((await t.query(internal.telegram.secrets, {})).session).toBeNull();
  });

  it("keeps a revoked session out after a call", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.telegram.setSession, {
      session: "s",
      me: { id: "1", name: "x" },
    });
    await t.mutation(internal.telegram.afterCall, {
      session: null,
      error: "SESSION_REVOKED",
    });
    const s = await t.withIdentity(panel).query(api.telegram.status, {});
    expect(s?.connected).toBe(false);
    expect(s?.lastError).toBe("SESSION_REVOKED");
  });

  it("lets one call use the session at a time", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.telegram.acquire, {})).toBe(true);
    expect(await t.mutation(internal.telegram.acquire, {})).toBe(false);
    await t.mutation(internal.telegram.release, {});
    expect(await t.mutation(internal.telegram.acquire, {})).toBe(true);
  });

  it("filters opt-in groups and logs calls", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    await t.mutation(api.telegram.updateSettings, {
      assistantWrites: true,
      optIn: ["stars", "hack", "stars"],
    });
    await t.mutation(internal.telegram.logCall, {
      tool: "telegram-list-chats",
      source: "assistant",
      ok: true,
      ms: 900,
    });
    const s = await t.query(api.telegram.status, {});
    expect(s?.assistantWrites).toBe(true);
    expect(s?.optIn).toEqual(["stars"]);
    expect(s?.recent[0]?.tool).toBe("telegram-list-chats");
  });
});
