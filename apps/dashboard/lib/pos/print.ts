"use client";

import {
  PAPER_DOTS,
  PAPER_MM,
  type ReceiptDoc,
  renderReceipt,
  renderTicket,
  type TicketDoc,
} from "./receipt";
import type { PrinterConfig, ReceiptSettings } from "./types";

/**
 * Printing a receipt:
 * - epos: Epson TM printers on Wi-Fi/LAN through ePOS-Print (the printer's
 *   own web service), as a raster image so logo and accents print exactly.
 * - share: a PDF handed to the iOS share sheet → Epson TM Print Assistant
 *   (Bluetooth printers) or Print (AirPrint).
 */

const SUCCESS = /success="true"/;
const CODE = /code="([^"]*)"/;
const PAPER_WIDTH_MM = { "58": 58, "80": 80, a4: 210 } as const;

/* ---------------------------------- PDF ---------------------------------- */

export async function receiptPdf(doc: ReceiptDoc, s: ReceiptSettings) {
  const { jsPDF } = await import("jspdf");
  const canvas = await renderReceipt(doc, s, {
    width: PAPER_DOTS[s.paper] * (s.paper === "a4" ? 1.5 : 2),
  });
  const pageW = PAPER_WIDTH_MM[s.paper];
  const imgW = s.paper === "a4" ? pageW : PAPER_MM[s.paper];
  const imgH = (canvas.height / canvas.width) * imgW;
  const pageH = s.paper === "a4" ? Math.max(297, imgH) : imgH;
  const pdf = new jsPDF({
    unit: "mm",
    format: [pageW, pageH],
    orientation: pageH >= pageW ? "portrait" : "landscape",
    compress: true,
  });
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 0.92),
    "JPEG",
    (pageW - imgW) / 2,
    0,
    imgW,
    imgH
  );
  pdf.setProperties({ title: `Recibo ${doc.number}` });
  return pdf.output("blob");
}

export const pdfName = (doc: ReceiptDoc) => `recibo-${doc.number}.pdf`;

/** iOS share sheet (Epson app, AirPrint, WhatsApp…) or a download. */
export async function sharePdf(blob: Blob, name: string) {
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

/* ------------------------------ Epson ePOS ------------------------------- */

/** Canvas pixels as luminance (transparent counts as white paper). */
function grayscale(canvas: HTMLCanvasElement) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível");
  }
  const px = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = (px[i * 4 + 3] ?? 255) / 255;
    const lum =
      0.299 * (px[i * 4] ?? 255) +
      0.587 * (px[i * 4 + 1] ?? 255) +
      0.114 * (px[i * 4 + 2] ?? 255);
    gray[i] = lum * a + 255 * (1 - a);
  }
  return gray;
}

function spread(gray: Float32Array, i: number, amount: number) {
  gray[i] = (gray[i] ?? 0) + amount;
}

/** Pushes a pixel's rounding error to its unvisited neighbours. */
function diffuse(
  gray: Float32Array,
  at: { i: number; x: number; y: number; w: number; h: number },
  err: number
) {
  const { i, x, y, w, h } = at;
  const right = x + 1 < w;
  if (right) {
    spread(gray, i + 1, (err * 7) / 16);
  }
  if (y + 1 >= h) {
    return;
  }
  if (x > 0) {
    spread(gray, i + w - 1, (err * 3) / 16);
  }
  spread(gray, i + w, (err * 5) / 16);
  if (right) {
    spread(gray, i + w + 1, err / 16);
  }
}

/** Floyd–Steinberg dithering: 1 where the dot prints black. */
function dither(gray: Float32Array, w: number, h: number) {
  const black = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i] ?? 255;
      const on = old < 128;
      black[i] = on ? 1 : 0;
      diffuse(gray, { i, x, y, w, h }, old - (on ? 0 : 255));
    }
  }
  return black;
}

/** 1-bit image packed 8 dots per byte, first dot in the high bit, base64. */
function toRaster(canvas: HTMLCanvasElement) {
  const { width: w, height: h } = canvas;
  const black = dither(grayscale(canvas), w, h);
  const out = new Uint8Array((w / 8) * h);
  for (let i = 0; i < black.length; i++) {
    if (black[i]) {
      const byte = Math.floor(i / 8);
      out[byte] = (out[byte] ?? 0) + 2 ** (7 - (i % 8));
    }
  }
  let bin = "";
  for (let i = 0; i < out.length; i += 0x80_00) {
    bin += String.fromCharCode(...out.subarray(i, i + 0x80_00));
  }
  return btoa(bin);
}

function eposXml(raster: string, w: number, h: number, p: PrinterConfig) {
  const one = `<image width="${w}" height="${h}" color="color_1" mode="mono">${raster}</image><feed line="2"/><cut type="feed"/>`;
  const body =
    one.repeat(Math.max(1, Math.min(5, p.copies))) +
    (p.drawer ? '<pulse drawer="drawer_1" time="pulse_100"/>' : "");
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text align="center"/>${body}</epos-print></s:Body></s:Envelope>`;
}

export const eposUrl = (p: PrinterConfig) =>
  `https://${p.host.trim()}/cgi-bin/epos/service.cgi?devid=${encodeURIComponent(
    p.deviceId || "local_printer"
  )}&timeout=15000`;

const STATUS_HINTS: Record<string, string> = {
  EPTR_COVER_OPEN: "A tampa da impressora está aberta.",
  EPTR_REC_EMPTY: "Acabou o papel.",
  EPTR_CUTTER: "Erro no cortador de papel.",
  EX_TIMEOUT: "A impressora não respondeu a tempo.",
  DeviceNotFound: "ID do dispositivo errado (use local_printer).",
  EPTR_AUTOMATICAL: "Erro recuperável da impressora; tente de novo.",
};

/** Sends a rendered canvas to an Epson printer (raster, then cut). */
async function eposSend(
  printer: PrinterConfig,
  canvas: HTMLCanvasElement,
  opts: { drawer: boolean; copies: number }
) {
  const xml = eposXml(toRaster(canvas), canvas.width, canvas.height, {
    ...printer,
    drawer: opts.drawer,
    copies: opts.copies,
  });
  let res: Response;
  try {
    res = await fetch(eposUrl(printer), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT",
        SOAPAction: '""',
      },
      body: xml,
    });
  } catch {
    throw new Error(
      `Não consegui falar com a impressora “${printer.name}” (${printer.host}). Confira se este aparelho está no mesmo Wi-Fi e toque em “Autorizar conexão” nas impressoras.`
    );
  }
  const body = await res.text();
  if (!SUCCESS.test(body)) {
    const code = CODE.exec(body)?.[1] ?? "";
    throw new Error(
      `${printer.name}: ${
        STATUS_HINTS[code] ??
        `recusou a impressão${code ? ` (${code})` : ` (HTTP ${res.status})`}`
      }`
    );
  }
}

export async function eposPrint(
  printer: PrinterConfig,
  doc: ReceiptDoc,
  s: ReceiptSettings
) {
  const canvas = await renderReceipt(
    doc,
    { ...s, paper: printer.paper },
    { width: PAPER_DOTS[printer.paper], thermal: true }
  );
  await eposSend(printer, canvas, {
    drawer: printer.drawer,
    copies: printer.copies,
  });
}

/** Kitchen/bar ticket on one printer (Epson network printers only). */
export async function printTicket(
  printer: PrinterConfig,
  ticket: TicketDoc,
  s: ReceiptSettings
) {
  const canvas = renderTicket(ticket, s, PAPER_DOTS[printer.paper]);
  await eposSend(printer, canvas, { drawer: false, copies: 1 });
}

/** Prints on one printer, whatever its kind. */
export async function printReceipt(
  printer: PrinterConfig,
  doc: ReceiptDoc,
  s: ReceiptSettings
) {
  if (printer.kind === "epos") {
    await eposPrint(printer, doc, s);
    return "printed";
  }
  const blob = await receiptPdf(doc, { ...s, paper: printer.paper });
  return sharePdf(blob, pdfName(doc));
}

/** Any rendered image (voucher, label) as a PDF the width of the paper. */
export async function imagePdf(
  canvas: HTMLCanvasElement,
  paperMm: number,
  title: string
) {
  const { jsPDF } = await import("jspdf");
  const h = (canvas.height / canvas.width) * paperMm;
  const pdf = new jsPDF({
    unit: "mm",
    format: [paperMm, h],
    orientation: h >= paperMm ? "portrait" : "landscape",
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, paperMm, h);
  pdf.setProperties({ title });
  return pdf.output("blob");
}

/** Prints an image on a printer: Epson directly, others through the PDF. */
export async function printImage(
  printer: PrinterConfig,
  render: (width: number) => HTMLCanvasElement,
  title: string
) {
  if (printer.kind === "epos") {
    await eposSend(printer, render(PAPER_DOTS[printer.paper]), {
      drawer: false,
      copies: 1,
    });
    return "printed";
  }
  const blob = await imagePdf(
    render(PAPER_DOTS[printer.paper] * 2),
    PAPER_MM[printer.paper],
    title
  );
  return sharePdf(blob, `${title}.pdf`);
}
