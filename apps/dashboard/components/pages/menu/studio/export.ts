"use client";

import type { CellarWine } from "@/lib/cellar/types";
import { renderMenuHtml } from "@/lib/menu-studio/render";
import type { MenuDoc } from "@/lib/menu-studio/types";

const UNSAFE_NAME = /[^\w\- ]+/g;

const fileName = (doc: MenuDoc, ext: string) =>
  `${(doc.name || "cardapio").replace(UNSAFE_NAME, "").trim() || "cardapio"}.${ext}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Editable HTML: open in any browser, click texts to change, save again. */
export function downloadHtml(doc: MenuDoc, wines: CellarWine[]) {
  const html = renderMenuHtml(doc, wines, { editable: true });
  download(new Blob([html], { type: "text/html" }), fileName(doc, "html"));
}

/** The menu as data, to back up or move to another panel. */
export function downloadJson(doc: MenuDoc) {
  download(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    fileName(doc, "json")
  );
}

/**
 * Prints the menu at its paper size; "Save as PDF" in the print dialog
 * gives a vector PDF with real text (selectable, sharp when printed).
 */
export function printPdf(doc: MenuDoc, wines: CellarWine[]) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  frame.srcdoc = renderMenuHtml(doc, wines);
  frame.onload = async () => {
    const win = frame.contentWindow;
    if (!win) {
      return;
    }
    try {
      await win.document.fonts.ready;
    } catch {
      // Fonts unavailable offline: print with fallbacks
    }
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
