import type { PosOrder, PosSettings } from "./types";

/**
 * Card payments on the phone. Browsers cannot read bank cards (Web NFC only
 * reads NDEF tags), so a tap-to-pay charge is handed to the SumUp app via its
 * Payment Switch URL scheme (github.com/sumup/sumup-ios-url-scheme): the app
 * takes the contactless card (Tap to Pay on iPhone / Android) and opens our
 * callback URL with the result.
 */

export const SUMUP_STATUS_PARAM = "smp-status";

export function sumupPayUrl(opts: {
  order: Pick<PosOrder, "id" | "number" | "name">;
  amount: number;
  settings: PosSettings;
  callbackBase: string;
}) {
  const { order, amount, settings, callbackBase } = opts;
  const callback = `${callbackBase}?order=${encodeURIComponent(order.id)}`;
  const params = new URLSearchParams({
    amount: amount.toFixed(2),
    currency: settings.currency,
    "affiliate-key": settings.sumupAffiliateKey,
    title: order.name
      ? `Pedido ${order.number} · ${order.name}`
      : `Pedido ${order.number}`,
    "foreign-tx-id": `${order.id}-${Date.now().toString(36)}`,
    callbacksuccess: callback,
    callbackfail: callback,
    "skip-screen-success": "true",
  });
  return `sumupmerchant://pay/1.0?${params.toString()}`;
}

export interface SumupResult {
  orderId: string;
  status: "success" | "failed" | "invalidstate";
  txCode: string | null;
}

/** Reads the result SumUp appends to our callback URL. */
export function readSumupResult(search: string): SumupResult | null {
  const q = new URLSearchParams(search);
  const status = q.get(SUMUP_STATUS_PARAM);
  const orderId = q.get("order");
  if (!(status && orderId)) {
    return null;
  }
  return {
    orderId,
    status:
      status === "success" || status === "failed" ? status : "invalidstate",
    txCode: q.get("smp-tx-code"),
  };
}

/** A payment link template with {amount} and {ref} filled in. */
export function paymentLinkUrl(
  template: string,
  amount: number,
  order: Pick<PosOrder, "number">
) {
  return template
    .replaceAll("{amount}", amount.toFixed(2))
    .replaceAll("{ref}", `pedido-${order.number}`);
}
