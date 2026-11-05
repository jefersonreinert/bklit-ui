/**
 * SumUp REST API (server only — SUMUP_API_KEY is a secret key). Creates
 * hosted checkouts the customer pays on their own phone (card, Apple Pay,
 * Google Pay) by scanning a QR code, and reads their status.
 */

const API = "https://api.sumup.com/v0.1";

export const sumupKey = () => process.env.SUMUP_API_KEY?.trim() || null;

let merchantCode: string | null = null;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = sumupKey();
  if (!key) {
    throw new Error("SumUp não configurada no servidor.");
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & SumupError;
  if (!res.ok) {
    throw new SumupFailure(res.status, body);
  }
  return body;
}

interface SumupError {
  message?: string;
  error_code?: string;
  param?: string;
}

/** A SumUp error, with the field it complains about (e.g. "Validation error · valid_until"). */
export class SumupFailure extends Error {
  status: number;
  param: string | null;
  constructor(status: number, body: SumupError | SumupError[]) {
    // Validation errors come as a list: one entry per bad field
    const list = Array.isArray(body) ? body : [body];
    const first = list[0] ?? {};
    const params = list
      .map((e) => e.param)
      .filter(Boolean)
      .join(", ");
    const text = first.message ?? first.error_code ?? `SumUp ${status}`;
    super(params ? `${text} · ${params}` : text);
    this.status = status;
    this.param = params || null;
  }
}

/** ISO date without milliseconds, as SumUp documents it (…T10:56:56+00:00). */
const sumupDate = (ms: number) =>
  `${new Date(ms).toISOString().slice(0, 19)}+00:00`;

async function merchant() {
  if (!merchantCode) {
    const me = await call<{ merchant_profile?: { merchant_code?: string } }>(
      "/me"
    );
    merchantCode = me.merchant_profile?.merchant_code ?? null;
    if (!merchantCode) {
      throw new Error("Conta SumUp sem merchant code.");
    }
  }
  return merchantCode;
}

interface Checkout {
  id: string;
  status: "PENDING" | "FAILED" | "PAID" | "EXPIRED";
  hosted_checkout_url?: string;
  transactions?: { transaction_code?: string; status?: string }[];
}

export async function createCheckout(opts: {
  amount: number;
  currency: string;
  reference: string;
  description: string;
}) {
  const base = {
    checkout_reference: opts.reference,
    amount: Math.round(opts.amount * 100) / 100,
    currency: opts.currency,
    merchant_code: await merchant(),
    description: opts.description,
    hosted_checkout: { enabled: true },
  };
  const post = (body: object) =>
    call<Checkout>("/checkouts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  let checkout: Checkout;
  try {
    // Unpaid QR codes stop working after 30 minutes
    checkout = await post({
      ...base,
      valid_until: sumupDate(Date.now() + 30 * 60_000),
    });
  } catch (err) {
    // Some accounts refuse the expiry: create it without one
    const bad = err instanceof SumupFailure ? err.param : null;
    if (
      !(err instanceof SumupFailure && err.status === 400) ||
      (bad && !bad.includes("valid_until"))
    ) {
      throw err;
    }
    checkout = await post({
      ...base,
      checkout_reference: `${opts.reference}-b`.slice(0, 90),
    });
  }
  if (!checkout.hosted_checkout_url) {
    throw new Error("A SumUp não devolveu a página de pagamento.");
  }
  return { id: checkout.id, url: checkout.hosted_checkout_url };
}

export async function checkoutStatus(id: string) {
  const c = await call<Checkout>(`/checkouts/${encodeURIComponent(id)}`);
  const paid = c.transactions?.find((t) => t.status === "SUCCESSFUL");
  return {
    status: c.status,
    txCode:
      paid?.transaction_code ?? c.transactions?.[0]?.transaction_code ?? null,
  };
}
