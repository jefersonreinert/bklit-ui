"use client";

import type * as PdfJs from "pdfjs-dist";
import { loadPdfJs } from "@/lib/pdfjs-client";
import { loadImage } from "@/lib/upload";
import {
  type Box,
  detectDrawings,
  isMonochrome,
  removeBackground,
} from "./components";

/**
 * Pulls drawings (icons, ornaments, illustrations, dividers) out of a
 * menu PDF or photo. PDFs are rendered with pdf.js WITHOUT their text and
 * on a transparent background, so a glass icon next to a cocktail name
 * comes out clean; photos get their paper made transparent.
 */

/** Display render width (also used for detection). */
const VIEW_WIDTH = 1100;
/** Max pixels of the high-resolution render used for the crops. */
const HIRES_PIXELS = 12_000_000;

export interface SourcePage {
  /** Full page as shown to the user (JPEG data URL). */
  preview: string;
  width: number;
  height: number;
  /** Drawings found on the page, as page fractions. */
  boxes: Box[];
  /** Renders the page in high resolution for cropping. */
  hires: () => Promise<HTMLCanvasElement>;
}

export interface Source {
  name: string;
  kind: "pdf" | "image";
  pages: SourcePage[];
}

function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const ctx2d = (c: HTMLCanvasElement) => {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas indisponível.");
  }
  return ctx;
};

/** Text boxes of a PDF page, in the viewport's pixels. */
async function textRects(
  page: PdfJs.PDFPageProxy,
  viewport: PdfJs.PageViewport
) {
  const content = await page.getTextContent();
  const rects: [number, number, number, number][] = [];
  for (const item of content.items) {
    if (!("str" in item) || item.str.trim() === "") {
      continue;
    }
    const [, , , , e = 0, f = 0] = item.transform as number[];
    const h = item.height || Math.abs((item.transform as number[])[3] ?? 0);
    // Baseline box with room for descenders and accents
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
      e,
      f - h * 0.3,
      e + item.width,
      f + h * 1.05,
    ]);
    rects.push([
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1),
    ]);
  }
  return rects;
}

/**
 * Renders a PDF page. Without text, the page is drawn on a transparent
 * background and every text box is erased, leaving only the artwork.
 */
async function renderPdfPage(
  page: PdfJs.PDFPageProxy,
  scale: number,
  withText: boolean
) {
  const viewport = page.getViewport({ scale });
  const canvas = newCanvas(viewport.width, viewport.height);
  const ctx = ctx2d(canvas);
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    background: withText ? "#ffffff" : "rgba(0,0,0,0)",
  }).promise;
  if (!withText) {
    const pad = Math.max(1, scale);
    for (const [x, y, w, h] of await textRects(page, viewport)) {
      ctx.clearRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    }
  }
  return canvas;
}

function pixels(canvas: HTMLCanvasElement) {
  return ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

async function openPdf(
  file: File,
  onProgress?: (n: number, of: number) => void
) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: SourcePage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = VIEW_WIDTH / base.width;
    const full = await renderPdfPage(page, scale, true);
    const art = await renderPdfPage(page, scale, false);
    const data = pixels(art);
    const hiScale = Math.sqrt(HIRES_PIXELS / (base.width * base.height));
    pages.push({
      preview: full.toDataURL("image/jpeg", 0.85),
      width: full.width,
      height: full.height,
      boxes: detectDrawings(data.data, art.width, art.height),
      hires: () => renderPdfPage(page, hiScale, false),
    });
  }
  return pages;
}

async function openImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const hiScale = Math.min(
      1,
      Math.sqrt(HIRES_PIXELS / (img.width * img.height))
    );
    const hires = newCanvas(img.width * hiScale, img.height * hiScale);
    ctx2d(hires).drawImage(img, 0, 0, hires.width, hires.height);
    const preview = hires.toDataURL("image/jpeg", 0.85);
    const data = pixels(hires);
    removeBackground(data.data, hires.width, hires.height);
    ctx2d(hires).putImageData(data, 0, 0);
    // Detect on a smaller copy (text is found too: unpick what you don't need)
    const small = newCanvas(
      VIEW_WIDTH,
      (VIEW_WIDTH * hires.height) / hires.width
    );
    ctx2d(small).drawImage(hires, 0, 0, small.width, small.height);
    const sd = pixels(small);
    return [
      {
        preview,
        width: hires.width,
        height: hires.height,
        boxes: detectDrawings(sd.data, small.width, small.height, {
          gap: 0.008,
        }),
        hires: async () => hires,
      },
    ];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function openSource(
  file: File,
  onProgress?: (n: number, of: number) => void
): Promise<Source> {
  const pdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return {
    name: file.name,
    kind: pdf ? "pdf" : "image",
    pages: pdf ? await openPdf(file, onProgress) : await openImage(file),
  };
}

export interface Cutout {
  src: string;
  width: number;
  height: number;
  monochrome: boolean;
}

/** Crops a box (page fractions) and trims the transparent margins. */
export function cutout(
  canvas: HTMLCanvasElement,
  box: Box,
  maxSide = 1600
): Cutout {
  const pad = 0.004;
  const x = Math.max(0, Math.floor((box.x - pad) * canvas.width));
  const y = Math.max(0, Math.floor((box.y - pad) * canvas.height));
  const w = Math.min(
    canvas.width - x,
    Math.ceil((box.w + pad * 2) * canvas.width)
  );
  const h = Math.min(
    canvas.height - y,
    Math.ceil((box.h + pad * 2) * canvas.height)
  );
  const data = ctx2d(canvas).getImageData(x, y, Math.max(1, w), Math.max(1, h));
  // Trim fully transparent borders
  let top = data.height;
  let left = data.width;
  let right = -1;
  let bottom = -1;
  for (let j = 0; j < data.height; j++) {
    for (let i = 0; i < data.width; i++) {
      if ((data.data[(j * data.width + i) * 4 + 3] ?? 0) > 8) {
        top = Math.min(top, j);
        bottom = Math.max(bottom, j);
        left = Math.min(left, i);
        right = Math.max(right, i);
      }
    }
  }
  if (right < 0) {
    throw new Error("Área vazia.");
  }
  const tw = right - left + 1;
  const th = bottom - top + 1;
  const trimmed = newCanvas(tw, th);
  ctx2d(trimmed).putImageData(data, -left, -top);
  const scale = Math.min(1, maxSide / Math.max(tw, th));
  const out = newCanvas(tw * scale, th * scale);
  const octx = ctx2d(out);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(trimmed, 0, 0, out.width, out.height);
  return {
    src: out.toDataURL("image/png"),
    width: out.width,
    height: out.height,
    monochrome: isMonochrome(
      octx.getImageData(0, 0, out.width, out.height).data
    ),
  };
}
