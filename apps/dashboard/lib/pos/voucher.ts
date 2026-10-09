"use client";

import { encode } from "uqr";
import { money } from "./store";

export interface VoucherInfo {
  code: string;
  kind: "amount" | "percent";
  value: number;
  label: string;
  maxUses: number;
  uses: number;
  expiresAt: number;
  active: boolean;
}

/** What the QR holds (also accepted typed, without the prefix). */
export const voucherQr = (code: string) => `CBV-${code}`;

export const voucherValue = (
  v: Pick<VoucherInfo, "kind" | "value">,
  currency: string
) =>
  v.kind === "percent" ? `${v.value}% de desconto` : money(v.value, currency);

export function voucherStatus(v: VoucherInfo, now = Date.now()) {
  if (!v.active) {
    return { label: "Desativado", ok: false };
  }
  if (v.expiresAt && v.expiresAt < now) {
    return { label: "Expirado", ok: false };
  }
  if (v.uses >= v.maxUses) {
    return { label: "Usado", ok: false };
  }
  return {
    label: v.maxUses > 1 ? `Válido · ${v.maxUses - v.uses} usos` : "Válido",
    ok: true,
  };
}

const FIRST4 = /(.{4})/;
const FONT = '"Inter", -apple-system, "Helvetica Neue", Arial, sans-serif';

/** Printable voucher: business, value, big QR, code and validity. */
export function renderVoucher(
  v: VoucherInfo,
  opts: { business: string; currency: string; width: number }
) {
  const w = opts.width;
  const u = w / 300;
  const qr = encode(voucherQr(v.code), { ecc: "M", border: 2 });
  const qrPx = Math.round(w * 0.62);
  const lines: { text: string; size: number; weight: number }[] = [
    { text: opts.business.toUpperCase(), size: 12, weight: 700 },
    { text: v.label, size: 15, weight: 600 },
    { text: voucherValue(v, opts.currency), size: 26, weight: 800 },
  ];
  const after: { text: string; size: number; weight: number }[] = [
    { text: v.code.replace(FIRST4, "$1 "), size: 18, weight: 800 },
    {
      text: v.expiresAt
        ? `Válido até ${new Date(v.expiresAt).toLocaleDateString("pt-BR")}`
        : "Sem data de validade",
      size: 10,
      weight: 500,
    },
    {
      text: v.maxUses > 1 ? `Pode ser usado ${v.maxUses} vezes` : "Uso único",
      size: 10,
      weight: 500,
    },
  ];
  const lh = (s: number) => s * u * 1.4;
  const height =
    20 * u +
    lines.reduce((a, l) => a + lh(l.size), 0) +
    10 * u +
    qrPx +
    10 * u +
    after.reduce((a, l) => a + lh(l.size), 0) +
    24 * u;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = Math.ceil(height);
  const c = canvas.getContext("2d");
  if (!c) {
    throw new Error("Canvas indisponível");
  }
  c.fillStyle = "#fff";
  c.fillRect(0, 0, w, canvas.height);
  c.fillStyle = "#000";
  c.textAlign = "center";
  let y = 20 * u;
  const draw = (l: { text: string; size: number; weight: number }) => {
    y += lh(l.size);
    c.font = `${l.weight} ${Math.round(l.size * u)}px ${FONT}`;
    c.fillText(l.text, w / 2, y - lh(l.size) * 0.25);
  };
  lines.forEach(draw);
  y += 10 * u;
  const cell = qrPx / qr.size;
  const left = (w - qrPx) / 2;
  qr.data.forEach((row, j) => {
    row.forEach((on, i) => {
      if (on) {
        c.fillRect(left + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
      }
    });
  });
  y += qrPx + 10 * u;
  after.forEach(draw);
  return canvas;
}
