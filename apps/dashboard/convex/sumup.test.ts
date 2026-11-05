import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckout } from "../lib/server/sumup";

const SUMUP_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const opts = {
  amount: 5.5,
  currency: "EUR",
  reference: "o1-abc",
  description: "Pedido 7",
};

describe("createCheckout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends valid_until without milliseconds and retries without it when refused", async () => {
    vi.stubEnv("SUMUP_API_KEY", "sk_test");
    const bodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/me")) {
        return Promise.resolve(
          json(200, { merchant_profile: { merchant_code: "M1" } })
        );
      }
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return Promise.resolve(
        body.valid_until
          ? json(400, [
              {
                message: "Validation error",
                error_code: "INVALID",
                param: "valid_until",
              },
            ])
          : json(200, { id: "c1", hosted_checkout_url: "https://pay/c1" })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCheckout(opts)).resolves.toEqual({
      id: "c1",
      url: "https://pay/c1",
    });
    expect(bodies[0].valid_until).toMatch(SUMUP_DATE);
    expect(bodies[1].valid_until).toBeUndefined();
  });

  it("names the bad field when SumUp refuses something else", async () => {
    vi.stubEnv("SUMUP_API_KEY", "sk_test");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/me")
            ? json(200, { merchant_profile: { merchant_code: "M1" } })
            : json(400, {
                message: "Validation error",
                error_code: "INVALID",
                param: "currency",
              })
        )
      )
    );
    await expect(createCheckout(opts)).rejects.toThrow(
      "Validation error · currency"
    );
  });
});
