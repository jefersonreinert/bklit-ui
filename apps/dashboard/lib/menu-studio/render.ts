import { PRICE_BANDS, priceBand } from "@/lib/cellar/margins";
import { CELLAR_STYLES, type CellarWine } from "@/lib/cellar/types";
import { PAPER_SIZES } from "./templates";
import type { MenuDoc, MenuItem, MenuSection, WineSource } from "./types";

/**
 * One HTML document per menu, used for the live preview, printing to PDF
 * and the downloadable HTML. In "editable" mode the texts can be changed
 * right in the browser and a button saves the edited file.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SYMBOLS: Record<string, string> = {
  EUR: "€",
  BRL: "R$",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
};

function price(doc: MenuDoc, value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "";
  }
  const { decimals, showCurrency } = doc.style;
  const n =
    decimals === 0 && Number.isInteger(value)
      ? String(value)
      : value.toFixed(decimals === 0 ? 0 : 2);
  const text = doc.language.startsWith("pt") ? n.replace(".", ",") : n;
  if (!showCurrency) {
    return text;
  }
  const sym = SYMBOLS[doc.currency] ?? doc.currency;
  return sym === "€" ? `€${text}` : `${sym} ${text}`;
}

const STYLE_ORDER = CELLAR_STYLES.map((s) => s.value);
const STYLE_TITLE: Record<string, Record<string, string>> = {
  en: {
    Red: "Red Wines",
    White: "White Wines",
    Rosé: "Rosé Wines",
    Sparkling: "Sparkling",
    Sweet: "Dessert Wines",
    Orange: "Orange Wines",
    Other: "Other Wines",
  },
  pt: {
    Red: "Tintos",
    White: "Brancos",
    Rosé: "Rosés",
    Sparkling: "Espumantes",
    Sweet: "Sobremesa",
    Orange: "Laranja",
    Other: "Outros",
  },
};

const SENTENCE_END = /(?<=\.)\s/;
const ENCODED_SPACE = /%20/g;

function groupTitle(src: WineSource, k: string, lang: string) {
  if (src.groupBy === "style") {
    return STYLE_TITLE[lang]?.[k] ?? k;
  }
  if (src.groupBy === "price") {
    return PRICE_BANDS.find((b) => b.value === k)?.label ?? k;
  }
  return k;
}

/** Wine list items for a cellar section, grouped as configured. */
export function wineGroups(
  src: WineSource,
  wines: CellarWine[],
  language: string
): { title: string; items: MenuItem[] }[] {
  const lang = language.startsWith("pt") ? "pt" : "en";
  const list = wines
    .filter((w) => w.available && w.name)
    .filter((w) => src.styles.length === 0 || src.styles.includes(w.style))
    .sort(
      (a, b) =>
        (a.priceDineIn ?? 0) - (b.priceDineIn ?? 0) ||
        a.name.localeCompare(b.name)
    );
  const groups = new Map<string, CellarWine[]>();
  const keyOf = (w: CellarWine): string[] => {
    switch (src.groupBy) {
      case "grape":
        return [w.grapes[0] ?? "—"];
      case "country":
        return [w.country || "—"];
      case "price":
        return [priceBand(w.priceDineIn) ?? "—"];
      default:
        return [w.style];
    }
  };
  for (const w of list) {
    for (const k of keyOf(w)) {
      groups.set(k, [...(groups.get(k) ?? []), w]);
    }
  }
  let keys = [...groups.keys()];
  if (src.groupBy === "style") {
    keys = keys.sort(
      (a, b) =>
        STYLE_ORDER.indexOf(a as never) - STYLE_ORDER.indexOf(b as never)
    );
  } else if (src.groupBy === "price") {
    const order = PRICE_BANDS.map((b) => b.value as string);
    keys = keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else {
    keys = keys.sort((a, b) => a.localeCompare(b));
  }
  return keys.map((k) => ({
    title: groupTitle(src, k, lang),
    items: (groups.get(k) ?? []).map((w) => ({
      id: w.id,
      name: [w.name, w.vintage].filter(Boolean).join(" "),
      description: src.showNotes
        ? (w.tastingNotes.split(SENTENCE_END)[0] ?? "")
        : "",
      details: [
        src.showGrapes ? w.grapes.join(", ") : "",
        [w.region, w.country].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
      price: w.priceDineIn,
      secondaryPrice: src.showGlass ? w.priceGlass : null,
      secondaryLabel: src.glassLabel,
      tags: [],
      hidden: false,
    })),
  }));
}

function itemHtml(doc: MenuDoc, item: MenuItem, labels?: [string, string]) {
  const p1 = price(doc, item.price);
  const p2 = price(doc, item.secondaryPrice);
  const small = (text: string | undefined) =>
    text ? `<small>${esc(text)}</small> ` : "";
  const prices =
    p1 && p2
      ? `<span class="p2">${small(labels?.[0] ?? item.secondaryLabel)}${p2}</span><span class="p1">${small(labels?.[1])}${p1}</span>`
      : `<span class="p1">${p1 || p2}</span>`;
  const tags = item.tags.length
    ? ` <span class="tags">${item.tags.map(esc).join(" · ")}</span>`
    : "";
  return `<div class="item">
  <div class="row"><span class="name" data-edit>${esc(item.name)}</span>${tags}<span class="lead"></span><span class="prices">${prices}</span></div>
  ${item.details ? `<div class="details" data-edit>${esc(item.details)}</div>` : ""}
  ${item.description ? `<div class="desc" data-edit>${esc(item.description)}</div>` : ""}
</div>`;
}

function sectionHtml(doc: MenuDoc, s: MenuSection, wines: CellarWine[]) {
  const head = `<h2 data-edit>${esc(s.title)}</h2>${s.note ? `<p class="note" data-edit>${esc(s.note)}</p>` : ""}`;
  let body = "";
  if (s.wineSource) {
    const src = s.wineSource;
    const labels: [string, string] | undefined = src.showGlass
      ? [src.glassLabel, src.bottleLabel]
      : undefined;
    body = wineGroups(src, wines, doc.language)
      .map(
        (g) =>
          `<div class="group"><h3 data-edit>${esc(g.title)}</h3>${g.items.map((i) => itemHtml(doc, i, labels)).join("")}</div>`
      )
      .join("");
    if (!body) {
      body = `<p class="note">${doc.language.startsWith("pt") ? "Nenhum vinho na adega ainda." : "No wines in the cellar yet."}</p>`;
    }
  } else {
    body = s.items
      .filter((i) => !i.hidden)
      .map((i) => itemHtml(doc, i))
      .join("");
  }
  return `<section class="section${s.breakBefore ? " break" : ""}">${head}${body}</section>`;
}

function ornamentCss(o: MenuDoc["style"]["ornament"]) {
  switch (o) {
    case "line":
      return "h2{border-bottom:1.5px solid var(--accent);padding-bottom:.3em}";
    case "dots":
      return "h2::after{content:'· · ·';display:block;font-size:.6em;letter-spacing:.4em;color:var(--accent);margin-top:.2em}";
    case "double":
      return "h2{border-top:1px solid var(--accent);border-bottom:1px solid var(--accent);padding:.35em 0;box-shadow:0 3px 0 -2px var(--accent),0 -3px 0 -2px var(--accent)}";
    default:
      return "";
  }
}

const PRICE_CSS: Record<MenuDoc["style"]["priceStyle"], string> = {
  below:
    ".row{display:block}.lead{display:none}.prices{display:block;margin-top:.15em;color:var(--accent)}",
  inline: ".lead{flex:0 0 .8em;border:0}.prices{color:var(--accent)}",
  right: "",
};

const fontsQuery = (st: MenuDoc["style"]) =>
  [...new Set([st.headingFont, st.bodyFont])]
    .map(
      (f) =>
        `family=${encodeURIComponent(f).replace(ENCODED_SPACE, "+")}:wght@400;500;600;700`
    )
    .join("&");

const headerHtml = (doc: MenuDoc) => `<header>
  ${doc.style.logo ? `<img class="logo" src="${doc.style.logo}" alt="">` : ""}
  ${doc.restaurantName ? `<h1 data-edit>${esc(doc.restaurantName)}</h1>` : ""}
  ${doc.tagline ? `<p class="tagline" data-edit>${esc(doc.tagline)}</p>` : ""}
</header>`;

const editToolbar = (
  doc: MenuDoc
) => `<div class="toolbar" contenteditable="false"><span>Clique nos textos para editar</span><button onclick="saveMenu()">Salvar HTML</button><button onclick="window.print()">Imprimir / PDF</button></div>
<script>
document.querySelectorAll('[data-edit]').forEach(function(el){el.setAttribute('contenteditable','true')});
function saveMenu(){var html='<!doctype html>\\n'+document.documentElement.outerHTML;var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=${JSON.stringify(`${doc.name || "cardapio"}.html`)};a.click();}
</script>`;

export interface RenderOptions {
  /** Texts editable in the browser + a save button. */
  editable?: boolean;
  /** Fit the page into the preview frame instead of real paper size. */
  preview?: boolean;
}

export function renderMenuHtml(
  doc: MenuDoc,
  wines: CellarWine[],
  opts: RenderOptions = {}
): string {
  const st = doc.style;
  const paper = PAPER_SIZES[st.paper];
  const [w, h] = st.landscape ? [paper.h, paper.w] : [paper.w, paper.h];
  const fonts = fontsQuery(st);
  const centered = st.template !== "modern";
  const priceCss = PRICE_CSS[st.priceStyle];
  const header = headerHtml(doc);

  const editScript = opts.editable ? editToolbar(doc) : "";

  return `<!doctype html>
<html lang="${esc(doc.language || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.name || doc.restaurantName || "Menu")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">
<style>
:root{--bg:${st.background};--text:${st.text};--accent:${st.accent};--muted:${st.muted};--hf:'${st.headingFont}',serif;--bf:'${st.bodyFont}',serif}
@page{size:${w}mm ${h}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:${opts.preview ? "#d9d9d9" : "var(--bg)"};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:${w}mm;min-height:${h}mm;margin:${opts.preview ? "0 auto" : "0 auto"};background:var(--bg);color:var(--text);font-family:var(--bf);font-size:${st.baseSize}px;line-height:1.35;padding:16mm 15mm}
header{text-align:${centered ? "center" : "left"};margin-bottom:9mm}
.logo{max-height:${st.logoHeight}px;max-width:70%;object-fit:contain;display:${centered ? "block" : "inline-block"};margin:${centered ? "0 auto 4mm" : "0 0 4mm"}}
h1{font-family:var(--hf);font-weight:600;font-size:2.6em;margin:0;color:var(--text);letter-spacing:.02em}
.tagline{margin:.3em 0 0;color:var(--muted);font-style:italic}
.columns{column-count:${st.columns};column-gap:10mm}
.section{break-inside:avoid-column;margin:0 0 7mm}
.section.break{break-before:page}
h2{font-family:var(--hf);font-weight:600;font-size:1.55em;color:var(--accent);margin:0 0 .5em;text-align:${centered ? "center" : "left"};${st.uppercaseHeadings ? "text-transform:uppercase;letter-spacing:.12em;font-size:1.25em;" : ""}}
h3{font-family:var(--hf);font-size:1.05em;font-weight:600;margin:.9em 0 .35em;color:var(--text);${st.uppercaseHeadings ? "text-transform:uppercase;letter-spacing:.08em;" : ""}}
.group{break-inside:avoid}
.note{color:var(--muted);font-style:italic;margin:-.2em 0 .8em;text-align:${centered ? "center" : "left"}}
.item{margin:0 0 .65em;break-inside:avoid}
.row{display:flex;align-items:baseline;gap:.4em}
.name{font-weight:600}
.tags{color:var(--muted);font-size:.78em}
.lead{flex:1;border-bottom:${st.priceStyle === "right" ? "1px dotted var(--muted)" : "0"};transform:translateY(-.25em);min-width:1em}
.prices{white-space:nowrap;font-weight:600;display:flex;gap:.9em}
.prices small{font-weight:400;color:var(--muted);font-size:.72em}
.details{color:var(--muted);font-size:.85em}
.desc{color:var(--muted);font-size:.9em}
footer{margin-top:8mm;text-align:center;color:var(--muted);font-size:.82em}
${ornamentCss(st.ornament)}
${priceCss}
[contenteditable]:hover{outline:1px dashed var(--accent);outline-offset:2px}
.toolbar{position:fixed;top:12px;right:12px;display:flex;gap:8px;align-items:center;font:13px system-ui;background:#111;color:#fff;padding:8px 10px;border-radius:10px;z-index:9}
.toolbar button{font:inherit;background:#fff;color:#111;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
@media print{.toolbar{display:none}html,body{background:var(--bg)}.page{margin:0}}
${opts.preview ? "" : `@media screen and (max-width:${Math.floor(w * 3.78) - 2}px){.page{width:100%;padding:8vw 6vw}}`}
</style>
</head>
<body>
<div class="page">
${header}
<div class="columns">
${doc.sections.map((s) => sectionHtml(doc, s, wines)).join("\n")}
</div>
${doc.footer ? `<footer data-edit>${esc(doc.footer)}</footer>` : ""}
</div>
${editScript}
</body>
</html>`;
}
