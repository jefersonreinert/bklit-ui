import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const CONFIG = {
  url: "https://mt5.example.com/mcp",
  transport: "streamable-http" as const,
  headers: "Authorization: Bearer super-secret-token\nCF-Access-Client-Id: abc",
  restUrl: "https://mt5-api.example.com/",
  quoteUrl: "wss://mt5-quotes.example.com",
};

describe("metatrader connector", () => {
  it("needs the panel token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.metatrader.status, {})).toBeNull();
    await expect(t.mutation(api.metatrader.saveConfig, CONFIG)).rejects.toThrow(
      "Unauthenticated"
    );
  });

  it("stores the endpoint but never returns header values", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    await t.mutation(api.metatrader.saveConfig, CONFIG);
    const s = await t.query(api.metatrader.status, {});
    expect(s?.configured).toBe(true);
    expect(s?.headerNames).toEqual(["Authorization", "CF-Access-Client-Id"]);
    expect(s?.restUrl).toBe("https://mt5-api.example.com");
    expect(JSON.stringify(s)).not.toContain("super-secret-token");
    // null keeps the saved headers
    await t.mutation(api.metatrader.saveConfig, { ...CONFIG, headers: null });
    expect(
      (await t.query(api.metatrader.status, {}))?.headerNames
    ).toHaveLength(2);
  });

  it("rejects bad URLs and headers", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    await expect(
      t.mutation(api.metatrader.saveConfig, { ...CONFIG, url: "ftp://x" })
    ).rejects.toThrow("Servidor MCP");
    await expect(
      t.mutation(api.metatrader.saveConfig, {
        ...CONFIG,
        quoteUrl: "https://not-a-socket",
      })
    ).rejects.toThrow("Cotações");
    await expect(
      t.mutation(api.metatrader.saveConfig, { ...CONFIG, headers: "no colon" })
    ).rejects.toThrow("Cabeçalho inválido");
  });

  it("refuses orders while trading is off, before calling the server", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    const unset = await t.action(api.metatrader.call, {
      name: "get_account_info",
    });
    expect(unset.ok).toBe(false);
    expect(unset.message).toContain("não está configurado");

    await t.mutation(api.metatrader.saveConfig, CONFIG);
    const order = await t.action(api.metatrader.call, {
      name: "place_market_order",
      args: { symbol: "EURUSD", volume: 0.01, type: "BUY" },
    });
    expect(order.ok).toBe(false);
    expect(order.message).toContain("Negociação desligada");

    await t.mutation(api.metatrader.setTrading, { allowTrading: true });
    const assistant = await t.action(api.metatrader.call, {
      name: "close_all_positions",
      source: "assistant",
    });
    expect(assistant.message).toContain("só pode consultar");

    const unknown = await t.action(api.metatrader.call, { name: "rm_rf" });
    expect(unknown.message).toContain("desconhecida");
  });
});
