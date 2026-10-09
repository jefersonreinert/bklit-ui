"use client";

import { encode } from "uqr";
import { money, orderTotals } from "./store";
import type {
  OrderItem,
  PaperSize,
  PaymentMethod,
  PosData,
  PosOrder,
  ReceiptSettings,
} from "./types";

/**
 * One receipt renderer for everything: the on-screen preview, the PDF and
 * the Epson print are all this canvas, so what you see is what prints.
 */

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Cartão",
  qr: "QR code",
  cash: "Dinheiro",
  link: "Link de pagamento",
  other: "Outro",
};

/** "Com gelo, Limão · “sem tomate”" under a cart, receipt or ticket line. */
export function itemDetail(i: Pick<OrderItem, "mods" | "note">) {
  return [
    (i.mods ?? []).map((m) => m.name).join(", "),
    i.note ? `“${i.note}”` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface ReceiptDoc {
  number: number;
  date: Date;
  table: string;
  customer: string;
  lines: {
    name: string;
    qty: number;
    price: number;
    total: number;
    /** Options and kitchen note. */
    detail?: string;
  }[];
  subtotal: number;
  taxRate: number;
  tax: number;
  tip: number;
  total: number;
  payment: string;
  ref: string;
  currency: string;
}

export function receiptDoc(order: PosOrder, data: PosData): ReceiptDoc {
  const t = orderTotals(order);
  const tip = order.payment?.tip ?? 0;
  const table = order.tableId
    ? data.areas
        .flatMap((a) => a.tables.map((tb) => ({ tb, area: a.name })))
        .find((x) => x.tb.id === order.tableId)
    : undefined;
  return {
    number: order.number,
    date: new Date(order.payment?.at ?? order.updatedAt),
    table: table ? `Mesa ${table.tb.name} · ${table.area}` : "",
    customer: order.name,
    lines: order.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      price: i.price,
      total: i.price * i.qty,
      detail: itemDetail(i) || undefined,
    })),
    subtotal: t.subtotal,
    taxRate: order.taxRate,
    tax: t.tax,
    tip,
    total: t.total + tip,
    payment: order.payment ? METHOD_LABEL[order.payment.method] : "",
    ref: order.payment?.ref ?? "",
    currency: data.settings.currency,
  };
}

/** A sample sale for the designer preview. */
export function sampleDoc(data: PosData): ReceiptDoc {
  const items = data.products.slice(0, 4);
  const lines = items.map((p, i) => ({
    name: p.name,
    qty: (i % 3) + 1,
    price: p.price,
    total: p.price * ((i % 3) + 1),
  }));
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const tax = Math.round(subtotal * data.settings.taxRate) / 100;
  return {
    number: 128,
    date: new Date(),
    table: "Mesa 7 · Salão",
    customer: "",
    lines,
    subtotal,
    taxRate: data.settings.taxRate,
    tax,
    tip: 0,
    total: subtotal + tax,
    payment: "Cartão",
    ref: "TX4F9K2",
    currency: data.settings.currency,
  };
}

/* --------------------------------- canvas -------------------------------- */

/** Printable width in dots (203 dpi thermal) or pixels (A4 at ~150 dpi). */
export const PAPER_DOTS: Record<PaperSize, number> = {
  "58": 384,
  "80": 576,
  a4: 1240,
};
/** Printable width in mm. */
export const PAPER_MM: Record<PaperSize, number> = {
  "58": 48,
  "80": 72,
  a4: 210,
};

const FONT = '"Inter", -apple-system, "Helvetica Neue", Arial, sans-serif';
const MONO = '"SF Mono", Menlo, "Courier New", monospace';
const INK = "#000000";
const MUTED = "#555555";

interface Ctx {
  c: CanvasRenderingContext2D;
  s: ReceiptSettings;
  w: number;
  pad: number;
  /** One "point" relative to the paper width. */
  u: number;
  y: number;
  draw: boolean;
  thermal: boolean;
}

const loaded = new Map<string, HTMLImageElement>();

export function loadImage(src: string) {
  const hit = loaded.get(src);
  if (hit?.complete) {
    return Promise.resolve(hit);
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      loaded.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function font(x: Ctx, size: number, weight = 500, mono = false) {
  x.c.font = `${weight} ${Math.round(size * x.u)}px ${
    mono || x.s.template === "classic" ? MONO : FONT
  }`;
}

/** Wraps text to the width; returns the lines. */
function wrap(x: Ctx, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (x.c.measureText(next).width > max && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

function text(
  x: Ctx,
  value: string,
  opts: {
    size: number;
    weight?: number;
    color?: string;
    align?: CanvasTextAlign;
    gap?: number;
  }
) {
  font(x, opts.size, opts.weight ?? 500);
  const align = opts.align ?? "left";
  const lh = opts.size * x.u * 1.32;
  for (const line of wrap(x, value, x.w - x.pad * 2)) {
    x.y += lh;
    if (x.draw) {
      x.c.fillStyle = x.thermal ? INK : (opts.color ?? INK);
      x.c.textAlign = align;
      let at = x.pad;
      if (align === "center") {
        at = x.w / 2;
      } else if (align === "right") {
        at = x.w - x.pad;
      }
      x.c.fillText(line, at, x.y - lh * 0.24);
    }
  }
  x.y += (opts.gap ?? 0) * x.u;
}

/** Left and right text on one row (item lines, totals). */
function row(
  x: Ctx,
  left: string,
  right: string,
  opts: { size: number; weight?: number; color?: string }
) {
  font(x, opts.size, opts.weight ?? 500);
  const rightW = x.c.measureText(right).width;
  const lines = wrap(x, left, x.w - x.pad * 2 - rightW - 8 * x.u);
  const lh = opts.size * x.u * 1.32;
  lines.forEach((line, i) => {
    x.y += lh;
    if (x.draw) {
      x.c.fillStyle = x.thermal ? INK : (opts.color ?? INK);
      x.c.textAlign = "left";
      x.c.fillText(line, x.pad, x.y - lh * 0.24);
      if (i === 0) {
        x.c.textAlign = "right";
        x.c.fillText(right, x.w - x.pad, x.y - lh * 0.24);
      }
    }
  });
}

function rule(x: Ctx, style: "solid" | "dashed" | "dotted" = "dashed") {
  x.y += 6 * x.u;
  if (x.draw) {
    x.c.strokeStyle = x.thermal ? INK : "#bbbbbb";
    x.c.lineWidth = Math.max(1, x.u * 0.8);
    x.c.setLineDash(
      { solid: [], dashed: [6 * x.u, 4 * x.u], dotted: [1.5 * x.u, 3 * x.u] }[
        style
      ]
    );
    x.c.beginPath();
    x.c.moveTo(x.pad, x.y);
    x.c.lineTo(x.w - x.pad, x.y);
    x.c.stroke();
    x.c.setLineDash([]);
  }
  x.y += 6 * x.u;
}

function logo(x: Ctx, img: HTMLImageElement | null) {
  const mmToPx = x.w / PAPER_MM[x.s.paper];
  x.y += x.s.logoOffset * mmToPx;
  if (!img) {
    return;
  }
  const lw =
    ((x.w - x.pad * 2) * Math.min(100, Math.max(10, x.s.logoWidth))) / 100;
  const lh = (img.naturalHeight / img.naturalWidth) * lw;
  let lx = (x.w - lw) / 2;
  if (x.s.logoAlign === "left") {
    lx = x.pad;
  } else if (x.s.logoAlign === "right") {
    lx = x.w - x.pad - lw;
  }
  if (x.draw) {
    x.c.drawImage(img, lx, x.y, lw, lh);
  }
  x.y += lh + 8 * x.u;
}

function header(x: Ctx, doc: ReceiptDoc) {
  const s = x.s;
  const align = s.template === "modern" ? s.logoAlign : "center";
  if (s.businessName) {
    text(x, s.businessName, {
      size: s.template === "compact" ? 15 : 19,
      weight: 800,
      align,
    });
  }
  const info = [
    s.legalName,
    s.address,
    [s.phone, s.email].filter(Boolean).join(" · "),
    s.website,
    s.showTaxId && s.taxId ? `NIF ${s.taxId}` : "",
  ].filter(Boolean);
  for (const line of info) {
    text(x, line, { size: 9.5, color: MUTED, align });
  }
  if (s.headerNote) {
    x.y += 4 * x.u;
    text(x, s.headerNote, { size: 10, align, weight: 600 });
  }
  x.y += 6 * x.u;
  meta(x, doc);
}

function meta(x: Ctx, doc: ReceiptDoc) {
  const when = doc.date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  if (x.s.template === "modern") {
    // Pill with the receipt number
    const h = 26 * x.u;
    if (x.draw) {
      x.c.fillStyle = x.thermal ? INK : x.s.accent;
      x.c.beginPath();
      x.c.roundRect(x.pad, x.y + 4 * x.u, x.w - x.pad * 2, h, h / 2);
      x.c.fill();
      font(x, 11, 700);
      x.c.fillStyle = "#ffffff";
      x.c.textAlign = "left";
      x.c.fillText(
        `RECIBO Nº ${doc.number}`,
        x.pad + 12 * x.u,
        x.y + 21.5 * x.u
      );
      x.c.textAlign = "right";
      font(x, 10, 600);
      x.c.fillText(when, x.w - x.pad - 12 * x.u, x.y + 21.5 * x.u);
    }
    x.y += h + 10 * x.u;
  } else {
    rule(x, x.s.template === "classic" ? "dotted" : "dashed");
    row(x, `Recibo nº ${doc.number}`, when, { size: 10, weight: 700 });
  }
  if (x.s.showTable && doc.table) {
    text(x, doc.table, { size: 10, color: MUTED });
  }
  if (doc.customer) {
    text(x, doc.customer, { size: 10, color: MUTED });
  }
  rule(x, x.s.template === "classic" ? "dotted" : "dashed");
}

function items(x: Ctx, doc: ReceiptDoc) {
  const m = (v: number) => money(v, doc.currency);
  for (const l of doc.lines) {
    if (x.s.template === "compact") {
      row(x, `${l.qty}× ${l.name}`, m(l.total), { size: 10.5 });
      if (l.detail) {
        text(x, l.detail, { size: 9, color: MUTED });
      }
      continue;
    }
    row(x, l.name, m(l.total), { size: 11.5, weight: 600 });
    if (l.detail) {
      text(x, l.detail, { size: 9.5, color: MUTED });
    }
    text(x, `${l.qty} × ${m(l.price)}`, { size: 9.5, color: MUTED, gap: 4 });
  }
  rule(x, x.s.template === "classic" ? "dotted" : "dashed");
}

function totals(x: Ctx, doc: ReceiptDoc) {
  const m = (v: number) => money(v, doc.currency);
  row(x, "Subtotal", m(doc.subtotal), { size: 10.5, color: MUTED });
  if (doc.tax) {
    row(x, `Taxa de serviço ${doc.taxRate}%`, m(doc.tax), {
      size: 10.5,
      color: MUTED,
    });
  }
  if (doc.tip) {
    row(x, "Gorjeta", m(doc.tip), { size: 10.5, color: MUTED });
  }
  x.y += 6 * x.u;
  if (x.s.template === "modern") {
    const h = 40 * x.u;
    if (x.draw) {
      x.c.fillStyle = x.thermal ? INK : x.s.accent;
      x.c.beginPath();
      x.c.roundRect(x.pad, x.y, x.w - x.pad * 2, h, 12 * x.u);
      x.c.fill();
      x.c.fillStyle = "#ffffff";
      font(x, 12, 700);
      x.c.textAlign = "left";
      x.c.fillText("TOTAL", x.pad + 12 * x.u, x.y + 25 * x.u);
      font(x, 18, 800);
      x.c.textAlign = "right";
      x.c.fillText(m(doc.total), x.w - x.pad - 12 * x.u, x.y + 27 * x.u);
    }
    x.y += h + 6 * x.u;
  } else {
    row(x, "TOTAL", m(doc.total), { size: 15, weight: 800 });
  }
  if (x.s.showPayment && doc.payment) {
    text(x, `Pago com ${doc.payment}${doc.ref ? ` · ${doc.ref}` : ""}`, {
      size: 9.5,
      color: MUTED,
      align: "center",
      gap: 4,
    });
  }
}

function qr(x: Ctx) {
  if (!x.s.qrUrl) {
    return;
  }
  const { data, size } = encode(x.s.qrUrl, { ecc: "M", border: 1 });
  const px = Math.min(x.w * 0.38, 150 * x.u);
  const cell = px / size;
  const left = (x.w - px) / 2;
  x.y += 8 * x.u;
  if (x.draw) {
    x.c.fillStyle = INK;
    data.forEach((r, j) => {
      r.forEach((on, i) => {
        if (on) {
          x.c.fillRect(left + i * cell, x.y + j * cell, cell + 0.5, cell + 0.5);
        }
      });
    });
  }
  x.y += px + 4 * x.u;
}

function footer(x: Ctx) {
  qr(x);
  if (x.s.footer) {
    x.y += 4 * x.u;
    text(x, x.s.footer, { size: 11, weight: 700, align: "center" });
  }
  if (x.s.legalNote) {
    text(x, x.s.legalNote, { size: 8.5, color: MUTED, align: "center" });
  }
  x.y += 18 * x.u;
}

function layout(x: Ctx, doc: ReceiptDoc, img: HTMLImageElement | null) {
  x.y = 14 * x.u;
  logo(x, img);
  header(x, doc);
  items(x, doc);
  totals(x, doc);
  footer(x);
  return Math.ceil(x.y);
}

/**
 * Draws the receipt. `thermal` renders pure black on white (for the Epson
 * raster), otherwise the accent color is used.
 */
export async function renderReceipt(
  doc: ReceiptDoc,
  s: ReceiptSettings,
  opts: { width?: number; thermal?: boolean } = {}
) {
  const w = opts.width ?? PAPER_DOTS[s.paper];
  const img = s.logo ? await loadImage(s.logo).catch(() => null) : null;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d");
  if (!c) {
    throw new Error("Canvas indisponível");
  }
  const x: Ctx = {
    c,
    s,
    w,
    pad: w * (s.paper === "a4" ? 0.08 : 0.04),
    u: w / (s.paper === "a4" ? 560 : 300),
    y: 0,
    draw: false,
    thermal: Boolean(opts.thermal),
  };
  canvas.width = w;
  canvas.height = layout(x, doc, img);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, w, canvas.height);
  x.draw = true;
  layout(x, doc, img);
  return canvas;
}

/* ------------------------------ kitchen ticket --------------------------- */

export interface TicketDoc {
  station: string;
  number: number;
  table: string;
  customer: string;
  user: string;
  date: Date;
  lines: { qty: number; name: string; detail: string }[];
}

function ticketLayout(x: Ctx, t: TicketDoc) {
  x.y = 10 * x.u;
  text(x, t.station.toUpperCase(), { size: 13, weight: 800, align: "center" });
  text(x, t.table || `Pedido #${t.number}`, {
    size: 22,
    weight: 800,
    align: "center",
  });
  text(
    x,
    [
      t.table ? `Pedido #${t.number}` : "",
      t.customer,
      t.date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      t.user,
    ]
      .filter(Boolean)
      .join(" · "),
    { size: 11, align: "center", weight: 600 }
  );
  rule(x, "solid");
  for (const l of t.lines) {
    text(x, `${l.qty}×  ${l.name}`, { size: 17, weight: 800 });
    if (l.detail) {
      text(x, l.detail, { size: 13, weight: 600 });
    }
    x.y += 6 * x.u;
  }
  rule(x, "solid");
  x.y += 14 * x.u;
  return Math.ceil(x.y);
}

/** Kitchen/bar ticket: big text, no prices, black on white. */
export function renderTicket(t: TicketDoc, s: ReceiptSettings, width: number) {
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d");
  if (!c) {
    throw new Error("Canvas indisponível");
  }
  const x: Ctx = {
    c,
    s: { ...s, template: "modern" },
    w: width,
    pad: width * 0.04,
    u: width / 300,
    y: 0,
    draw: false,
    thermal: true,
  };
  canvas.width = width;
  canvas.height = ticketLayout(x, t);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, width, canvas.height);
  x.draw = true;
  ticketLayout(x, t);
  return canvas;
}
