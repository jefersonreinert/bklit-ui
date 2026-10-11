"use client";

import type * as PdfJs from "pdfjs-dist";

/**
 * pdf.js in the browser, loaded from the CDN on first use (keeps ~400 KB
 * out of the app). The legacy build runs on current Safari and Chrome.
 */

const PDFJS_CDN =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/legacy/build";

let pdfjsPromise: Promise<typeof PdfJs> | null = null;

export function loadPdfJs() {
  pdfjsPromise ??= (
    import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${PDFJS_CDN}/pdf.min.mjs`
    ) as Promise<typeof PdfJs>
  ).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
    return lib;
  });
  return pdfjsPromise;
}

/** PDF pages as JPEG base64 (no data: prefix), long side ≈ `size` px. */
export async function pdfToJpegs(
  base64: string,
  { maxPages = 5, size = 1800 } = {}
): Promise<string[]> {
  const lib = await loadPdfJs();
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await lib.getDocument({ data }).promise;
  const out: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: size / Math.max(base.width, base.height),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas indisponível.");
    }
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "");
  }
  return out;
}
