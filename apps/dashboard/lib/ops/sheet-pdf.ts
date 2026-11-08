"use client";

import type { Frequency } from "./templates";

/**
 * Printable A4 checklists in the app's look: Geist type, rounded cards,
 * pills and soft dividers in each venue's colour, with its logo. Three
 * outputs: a blank sheet to tick by hand, the PDF of one filling, and the
 * venue's full kit (cover, contents, a divider per department, every sheet).
 */

export interface SheetForm {
  title: string;
  department: string;
  frequency: Frequency;
  items: { id: string; text: string }[];
  slots: string[];
  note: string;
}

export interface Venue {
  name: string;
  /** Public path of the colour logo, e.g. /brands/the-brew.png. */
  logo?: string;
  accent: string;
  /** Short line under the name on the cover. */
  tagline?: string;
}

export const VENUES: Record<string, Venue> = {
  "the-brew": {
    name: "The Brew",
    logo: "/brands/the-brew.png",
    accent: "#e30613",
    tagline: "Grill & Brewery · Sliema",
  },
  "ribs-house": {
    name: "Ribs House by The Brew",
    logo: "/brands/ribs-house.png",
    accent: "#e30613",
    tagline: "Naxxar",
  },
  vinomad: {
    name: "Vinomad",
    logo: "/brands/vinomad.png",
    accent: "#7b1e2b",
    tagline: "Wine · Grill · Gather — Valletta Waterfront",
  },
  main: { name: "Casa Brasa", accent: "#c96442" },
};

type Pdf = InstanceType<typeof import("jspdf")["jsPDF"]>;
type RGB = [number, number, number];

/* ------------------------------- colour ----------------------------------- */

const rgb = (hex: string): RGB =>
  [1, 3, 5].map((k) => Number.parseInt(hex.slice(k, k + 2), 16)) as RGB;
/** Mix a colour with white (0 = colour, 1 = white). */
const tint = (c: RGB, white: number): RGB =>
  c.map((v) => Math.round(v + (255 - v) * white)) as RGB;

const INK: RGB = [20, 20, 19];
const MUTED: RGB = [112, 110, 104];
const LINE: RGB = [228, 226, 220];
const SOFT: RGB = [247, 246, 243];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [22, 140, 82];
const RED: RGB = [200, 45, 45];

const fill = (pdf: Pdf, c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
const stroke = (pdf: Pdf, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
const ink = (pdf: Pdf, c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);

/* -------------------------------- fonts ----------------------------------- */

type Weight = "regular" | "semibold" | "bold";
const FONT_FILES: Record<Weight, string> = {
  regular: "Geist-Regular.ttf",
  semibold: "Geist-SemiBold.ttf",
  bold: "Geist-Bold.ttf",
};
let fontCache: Partial<Record<Weight, string>> | null = null;

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function toBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function loadFonts() {
  if (fontCache) {
    return fontCache;
  }
  const out: Partial<Record<Weight, string>> = {};
  await Promise.all(
    (Object.keys(FONT_FILES) as Weight[]).map(async (w) => {
      try {
        const res = await fetch(`${base()}/fonts/${FONT_FILES[w]}`);
        if (res.ok) {
          out[w] = await toBase64(await res.blob());
        }
      } catch {
        // falls back to Helvetica
      }
    })
  );
  fontCache = out;
  return out;
}

let hasGeist = false;

async function useFonts(pdf: Pdf) {
  const fonts = await loadFonts();
  hasGeist = Boolean(fonts.regular && fonts.semibold && fonts.bold);
  if (!hasGeist) {
    return;
  }
  for (const w of Object.keys(FONT_FILES) as Weight[]) {
    pdf.addFileToVFS(FONT_FILES[w], fonts[w] as string);
    pdf.addFont(FONT_FILES[w], `Geist-${w}`, "normal");
  }
}

function font(pdf: Pdf, w: Weight, size: number) {
  if (hasGeist) {
    pdf.setFont(`Geist-${w}`, "normal");
  } else {
    pdf.setFont("helvetica", w === "regular" ? "normal" : "bold");
  }
  pdf.setFontSize(size);
}

/* -------------------------------- images ---------------------------------- */

interface Img {
  url: string;
  w: number;
  h: number;
}
const imgCache = new Map<string, Img | null>();

async function image(path: string): Promise<Img | null> {
  if (imgCache.has(path)) {
    return imgCache.get(path) ?? null;
  }
  try {
    const res = await fetch(`${base()}${path}`);
    if (!res.ok) {
      throw new Error(String(res.status));
    }
    const url = `data:image/png;base64,${await toBase64(await res.blob())}`;
    const size = await new Promise<{ w: number; h: number }>((resolve) => {
      const el = new Image();
      el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight });
      el.onerror = () => resolve({ w: 1, h: 1 });
      el.src = url;
    });
    const img = { url, ...size };
    imgCache.set(path, img);
    return img;
  } catch {
    imgCache.set(path, null);
    return null;
  }
}

/** Draws an image inside a box, keeping its proportions, centred. */
function drawFit(
  pdf: Pdf,
  img: Img,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const s = Math.min(w / img.w, h / img.h);
  const iw = img.w * s;
  const ih = img.h * s;
  pdf.addImage(img.url, "PNG", x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

/* ------------------------------ primitives -------------------------------- */

function card(
  pdf: Pdf,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: RGB; border?: RGB; r?: number } = {}
) {
  const r = opts.r ?? 3.2;
  pdf.setLineWidth(0.25);
  if (opts.fill) {
    fill(pdf, opts.fill);
  }
  if (opts.border) {
    stroke(pdf, opts.border);
  }
  let style = "S";
  if (opts.fill) {
    style = opts.border ? "FD" : "F";
  }
  pdf.roundedRect(x, y, w, h, r, r, style);
}

/** A pill label; returns its width. */
function pill(
  pdf: Pdf,
  text: string,
  x: number,
  y: number,
  opts: { bg: RGB; fg: RGB; border?: RGB; size?: number }
) {
  const size = opts.size ?? 7.5;
  font(pdf, "semibold", size);
  const w = pdf.getTextWidth(text) + 6;
  const h = size * 0.5 + 2.6;
  card(pdf, x, y, w, h, { fill: opts.bg, border: opts.border, r: h / 2 });
  ink(pdf, opts.fg);
  pdf.text(text, x + 3, y + h / 2 + size * 0.17);
  return w;
}

/** Tiny uppercase label (like the app's section labels). */
function label(pdf: Pdf, text: string, x: number, y: number, c: RGB = MUTED) {
  font(pdf, "semibold", 6.5);
  ink(pdf, c);
  pdf.text(text.toUpperCase(), x, y, { charSpace: 0.35 });
}

function wrap(pdf: Pdf, text: string, width: number) {
  return pdf.splitTextToSize(text, width) as string[];
}

/** An empty circle to tick by hand. */
function tickCircle(pdf: Pdf, cx: number, cy: number, r: number) {
  stroke(pdf, [196, 193, 186]);
  pdf.setLineWidth(0.3);
  fill(pdf, WHITE);
  pdf.circle(cx, cy, r, "FD");
}

function numberBadge(pdf: Pdf, n: number, cx: number, cy: number, accent: RGB) {
  fill(pdf, tint(accent, 0.86));
  pdf.circle(cx, cy, 2.6, "F");
  font(pdf, "bold", 6.8);
  ink(pdf, accent);
  pdf.text(String(n), cx, cy + 0.85, { align: "center" });
}

/* -------------------------------- layout ---------------------------------- */

const M = 11;

const FREQ_EN: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  log: "Hourly log",
};

const COLUMNS: Record<Exclude<Frequency, "log">, string[]> = {
  daily: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  weekly: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"],
  monthly: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
};

const FIELDS: Record<Frequency, string[]> = {
  daily: ["Week starting", "Area / station", "Supervisor"],
  weekly: ["Month", "Year", "Supervisor"],
  monthly: ["Year", "Manager", "Reviewed on"],
  log: ["Date", "Area", "Supervisor"],
};

interface Page {
  W: number;
  H: number;
}

/** Header card: logo tile, title, pills; returns the y below it. */
async function heroCard(
  pdf: Pdf,
  p: Page,
  venue: Venue,
  title: string,
  pills: { text: string; strong?: boolean }[],
  h = 30
) {
  const accent = rgb(venue.accent);
  card(pdf, M, M, p.W - 2 * M, h, { fill: tint(accent, 0.93) });
  // Accent edge
  fill(pdf, accent);
  pdf.roundedRect(M, M, 2.4, h, 1.2, 1.2, "F");
  // Logo tile
  const tile = h - 8;
  card(pdf, M + 6, M + 4, tile * 1.55, tile, {
    fill: WHITE,
    border: tint(accent, 0.8),
  });
  const logo = venue.logo ? await image(venue.logo) : null;
  if (logo) {
    drawFit(pdf, logo, M + 8, M + 6, tile * 1.55 - 4, tile - 4);
  } else {
    font(pdf, "bold", 10);
    ink(pdf, accent);
    pdf.text(venue.name, M + 6 + (tile * 1.55) / 2, M + 4 + tile / 2 + 1.5, {
      align: "center",
    });
  }
  const x = M + 6 + tile * 1.55 + 6;
  font(pdf, "bold", h < 30 ? 15.5 : 17);
  ink(pdf, INK);
  pdf.text(title, x, M + h / 2 - 2.5);
  let px = x;
  for (const pl of pills) {
    px +=
      pill(pdf, pl.text, px, M + h / 2 + 2.5, {
        bg: pl.strong ? accent : WHITE,
        fg: pl.strong ? WHITE : INK,
        border: pl.strong ? undefined : tint(accent, 0.75),
      }) + 2;
  }
  return M + h + 3.5;
}

/** Row of small cards with a label and a writing line. */
function fieldCards(pdf: Pdf, p: Page, y: number, fields: string[], h = 13) {
  const gap = 3;
  const w = (p.W - 2 * M - gap * (fields.length - 1)) / fields.length;
  fields.forEach((f, i) => {
    const x = M + i * (w + gap);
    card(pdf, x, y, w, h, { border: LINE });
    label(pdf, f, x + 3.5, y + 4.6);
    stroke(pdf, [205, 202, 195]);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([0.6, 0.8], 0);
    pdf.line(x + 3.5, y + h - 3.2, x + w - 3.5, y + h - 3.2);
    pdf.setLineDashPattern([], 0);
  });
  return y + h + 3.5;
}

function footer(pdf: Pdf, p: Page, venue: Venue, text: string) {
  stroke(pdf, LINE);
  pdf.setLineWidth(0.2);
  pdf.line(M, p.H - 8.5, p.W - M, p.H - 8.5);
  font(pdf, "regular", 6.8);
  ink(pdf, MUTED);
  pdf.text(`${venue.name}  ·  ${text}`, M, p.H - 5);
  pdf.text(
    `Printed ${new Date().toLocaleDateString("en-GB")}`,
    p.W - M,
    p.H - 5,
    { align: "right" }
  );
}

const SIGN_H = 14;
const FOOT = 11.5;

function noteLines(pdf: Pdf, p: Page, note: string) {
  font(pdf, "regular", 8);
  return note ? wrap(pdf, note, p.W - 2 * M - 16) : [];
}

const noteHeight = (lines: string[]) =>
  lines.length ? Math.max(9, lines.length * 3.6 + 4.6) : 0;

/** Height taken by the note, sign-off and footer at the bottom. */
function closingHeight(pdf: Pdf, p: Page, note: string) {
  const n = noteHeight(noteLines(pdf, p, note));
  return FOOT + SIGN_H + (n ? n + 3 : 0) + 3;
}

/** Note and sign-off cards, anchored just above the footer. */
function closingCards(pdf: Pdf, p: Page, note: string, accent: RGB) {
  const lines = noteLines(pdf, p, note);
  const nh = noteHeight(lines);
  const signH = SIGN_H;
  let top = p.H - FOOT - signH - (nh ? nh + 3 : 0);
  if (nh) {
    const h = nh;
    card(pdf, M, top, p.W - 2 * M, h, { fill: tint(accent, 0.94) });
    fill(pdf, accent);
    pdf.circle(M + 5.5, top + h / 2, 2.4, "F");
    font(pdf, "bold", 8);
    ink(pdf, WHITE);
    pdf.text("i", M + 5.5, top + h / 2 + 1.05, { align: "center" });
    font(pdf, "regular", 8);
    ink(pdf, INK);
    lines.forEach((l, i) => {
      pdf.text(l, M + 11, top + 5 + i * 3.6);
    });
    top += h + 3;
  }
  const fields = ["Checked by (manager)", "Signature", "Date"];
  const w = [0.42, 0.38, 0.2];
  let x = M;
  const total = p.W - 2 * M - 6;
  fields.forEach((f, i) => {
    const fw = total * (w[i] ?? 0.3);
    card(pdf, x, top, fw, signH, { fill: SOFT });
    label(pdf, f, x + 3.5, top + 4.8);
    stroke(pdf, [200, 197, 190]);
    pdf.setLineWidth(0.25);
    pdf.line(x + 3.5, top + signH - 3.5, x + fw - 3.5, top + signH - 3.5);
    x += fw + 3;
  });
}

/* ------------------------------ sheet pages -------------------------------- */

function gridSheet(
  pdf: Pdf,
  p: Page,
  y0: number,
  room: number,
  f: SheetForm,
  accent: RGB
) {
  const cols = COLUMNS[f.frequency as Exclude<Frequency, "log">];
  const tableW = p.W - 2 * M;
  const taskW = p.W > 250 ? 112 : 88;
  const colW = (tableW - taskW) / cols.length;
  const headH = 9;
  font(pdf, "regular", 8.6);
  const lines = f.items.map((it) => wrap(pdf, it.text, taskW - 14));
  const avail = room - headH - 9 - 3;
  const natural = lines.map((l) => Math.max(7.2, l.length * 3.6 + 3.6));
  const sum = natural.reduce((a, b) => a + b, 0);
  // Rows grow to give room to write, or shrink so the sheet fits one page
  const scale = Math.min(2.6, avail / sum);
  const rows = natural.map((h) => h * scale);
  const tableH = headH + rows.reduce((a, b) => a + b, 0) + 9;

  card(pdf, M, y0, tableW, tableH, { fill: WHITE, border: LINE });
  // Header band
  fill(pdf, SOFT);
  pdf.roundedRect(M, y0, tableW, headH, 3.2, 3.2, "F");
  pdf.rect(M, y0 + headH - 3.2, tableW, 3.2, "F");
  label(pdf, "Task", M + 12, y0 + 5.8, INK);
  cols.forEach((c, i) => {
    font(pdf, "semibold", 7.4);
    ink(pdf, INK);
    pdf.text(c, M + taskW + colW * i + colW / 2, y0 + 5.8, { align: "center" });
  });
  let y = y0 + headH;
  stroke(pdf, LINE);
  lines.forEach((l, r) => {
    const h = rows[r] ?? 7;
    if (r > 0) {
      stroke(pdf, r % 5 === 0 ? tint(accent, 0.7) : LINE);
      pdf.setLineWidth(r % 5 === 0 ? 0.35 : 0.2);
      pdf.line(M + 4, y, M + tableW - 4, y);
    }
    numberBadge(pdf, r + 1, M + 6.2, y + h / 2, accent);
    font(pdf, "regular", 8.6);
    ink(pdf, INK);
    const ty = y + h / 2 - ((l.length - 1) * 3.6) / 2 + 1.2;
    l.forEach((t, k) => {
      pdf.text(t, M + 12, ty + k * 3.6);
    });
    for (let i = 0; i < cols.length; i++) {
      tickCircle(
        pdf,
        M + taskW + colW * i + colW / 2,
        y + h / 2,
        Math.min(2.4, h / 2 - 1.2)
      );
    }
    y += h;
  });
  // Initials row
  fill(pdf, tint(accent, 0.95));
  pdf.rect(M + 0.15, y, tableW - 0.3, 9 - 0.15, "F");
  label(pdf, "Initials", M + 12, y + 5.6, accent);
  stroke(pdf, LINE);
  pdf.setLineWidth(0.2);
  for (let i = 1; i < cols.length; i++) {
    pdf.line(M + taskW + colW * i, y + 2, M + taskW + colW * i, y + 7);
  }
  return y0 + tableH + 4;
}

function logSheet(
  pdf: Pdf,
  p: Page,
  y0: number,
  room: number,
  f: SheetForm,
  accent: RGB
) {
  const tableW = p.W - 2 * M;
  const timeW = 18;
  const initW = 22;
  const remarkW = 48;
  const n = f.items.length;
  const colW = (tableW - timeW - initW - remarkW) / n;
  // Column heads carry the task names (two or three short lines)
  font(pdf, "semibold", 6.6);
  const heads = f.items.map((it) => wrap(pdf, it.text, colW - 3).slice(0, 3));
  const headH = 6 + Math.max(...heads.map((h) => h.length)) * 2.9 + 2;
  const rowH = Math.max(5, Math.min(9, (room - headH - 3) / f.slots.length));
  const tableH = headH + rowH * f.slots.length;

  card(pdf, M, y0, tableW, tableH, { fill: WHITE, border: LINE });
  fill(pdf, SOFT);
  pdf.roundedRect(M, y0, tableW, headH, 3.2, 3.2, "F");
  pdf.rect(M, y0 + headH - 3.2, tableW, 3.2, "F");
  label(pdf, "Time", M + 4, y0 + headH - 3, INK);
  heads.forEach((h, i) => {
    const cx = M + timeW + colW * i + colW / 2;
    numberBadge(pdf, i + 1, cx, y0 + 3.6, accent);
    font(pdf, "semibold", 6.6);
    ink(pdf, INK);
    h.forEach((line, k) => {
      pdf.text(line, cx, y0 + 8.6 + k * 2.9, { align: "center" });
    });
  });
  const initX = M + timeW + colW * n;
  label(pdf, "Initials", initX + 3, y0 + headH - 3, INK);
  label(pdf, "Remarks", initX + initW + 3, y0 + headH - 3, INK);
  let y = y0 + headH;
  f.slots.forEach((slot, r) => {
    if (r % 2 === 1) {
      fill(pdf, tint(accent, 0.965));
      pdf.rect(M + 0.15, y, tableW - 0.3, rowH, "F");
    }
    font(pdf, "semibold", 8);
    ink(pdf, INK);
    pdf.text(slot, M + 4, y + rowH / 2 + 1.1);
    const r0 = Math.min(2.5, rowH / 2 - 0.7);
    for (let i = 0; i < n; i++) {
      tickCircle(pdf, M + timeW + colW * i + colW / 2, y + rowH / 2, r0);
    }
    stroke(pdf, LINE);
    pdf.setLineWidth(0.2);
    pdf.line(initX, y + 1.2, initX, y + rowH - 1.2);
    pdf.line(initX + initW, y + 1.2, initX + initW, y + rowH - 1.2);
    y += rowH;
  });
  return y0 + tableH + 3;
}

/** Draws one blank sheet on the current page. */
async function drawSheet(pdf: Pdf, p: Page, f: SheetForm, venue: Venue) {
  const accent = rgb(venue.accent);
  const compact = p.W > p.H;
  let y = await heroCard(
    pdf,
    p,
    venue,
    f.title,
    [
      { text: f.department, strong: true },
      { text: FREQ_EN[f.frequency] },
      { text: `${f.items.length} tasks` },
    ],
    compact ? 26 : 30
  );
  y = fieldCards(pdf, p, y, FIELDS[f.frequency], compact ? 11 : 13);
  const room = p.H - y - closingHeight(pdf, p, f.note);
  if (f.frequency === "log") {
    logSheet(pdf, p, y, room, f, accent);
  } else {
    gridSheet(pdf, p, y, room, f, accent);
  }
  closingCards(pdf, p, f.note, accent);
  footer(pdf, p, venue, `${f.department}  ·  ${f.title}`);
}

const orientation = (f: SheetForm) =>
  f.frequency === "weekly" ? "portrait" : "landscape";
const pageOf = (o: "portrait" | "landscape"): Page =>
  o === "portrait" ? { W: 210, H: 297 } : { W: 297, H: 210 };

async function newPdf(o: "portrait" | "landscape") {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: o });
  await useFonts(pdf);
  return pdf;
}

/** Blank printable sheet of one form. */
export async function blankSheetPdf(f: SheetForm, venue: Venue) {
  const o = orientation(f);
  const pdf = await newPdf(o);
  await drawSheet(pdf, pageOf(o), f, venue);
  return pdf.output("blob");
}

/* ------------------------------ filled record ------------------------------ */

export interface Filling {
  title: string;
  items: { id: string; text: string }[];
  by: string;
  at: number;
  day: string;
  slot: string | null;
  done: string[];
  notes: string | null;
}

function statCard(
  pdf: Pdf,
  x: number,
  y: number,
  w: number,
  title: string,
  value: string
) {
  card(pdf, x, y, w, 15, { border: LINE });
  label(pdf, title, x + 3.5, y + 5);
  font(pdf, "semibold", 10.5);
  ink(pdf, INK);
  pdf.text(value, x + 3.5, y + 11.5);
}

/** PDF of one checklist filled in the app. */
export async function fillingPdf(s: Filling, venue: Venue, department: string) {
  const pdf = await newPdf("portrait");
  const p = pageOf("portrait");
  const accent = rgb(venue.accent);
  const done = new Set(s.done);
  const total = s.items.length;
  const count = s.items.filter((i) => done.has(i.id)).length;
  let y = await heroCard(pdf, p, venue, s.title, [
    { text: department || "Checklist", strong: true },
    { text: "Completed record" },
  ]);
  // Stats: progress, date/time, who
  const gap = 3;
  const w = (p.W - 2 * M - gap * 2) / 3;
  card(pdf, M, y, w, 15, {
    fill: count === total ? tint(GREEN, 0.9) : tint(accent, 0.92),
  });
  label(pdf, "Done", M + 3.5, y + 5);
  font(pdf, "bold", 12);
  ink(pdf, count === total ? GREEN : accent);
  pdf.text(`${count} / ${total}`, M + 3.5, y + 11.8);
  fill(pdf, WHITE);
  pdf.roundedRect(M + 22, y + 9.4, w - 26, 2.4, 1.2, 1.2, "F");
  fill(pdf, count === total ? GREEN : accent);
  if (count > 0) {
    pdf.roundedRect(
      M + 22,
      y + 9.4,
      ((w - 26) * count) / Math.max(1, total),
      2.4,
      1.2,
      1.2,
      "F"
    );
  }
  statCard(
    pdf,
    M + w + gap,
    y,
    w,
    "Date",
    `${s.day}${s.slot ? `  ·  ${s.slot}` : ""}`
  );
  statCard(pdf, M + 2 * (w + gap), y, w, "Done by", s.by);
  y += 19;

  // Items card
  font(pdf, "regular", 9.4);
  const rows = s.items.map((it) => wrap(pdf, it.text, p.W - 2 * M - 30));
  const heights = rows.map((l) => Math.max(8.5, l.length * 4 + 4.5));
  const listH = heights.reduce((a, b) => a + b, 0) + 4;
  card(pdf, M, y, p.W - 2 * M, listH, { fill: WHITE, border: LINE });
  let ry = y + 2;
  s.items.forEach((it, i) => {
    const h = heights[i] ?? 8;
    const ok = done.has(it.id);
    if (i > 0) {
      stroke(pdf, LINE);
      pdf.setLineWidth(0.2);
      pdf.line(M + 4, ry, p.W - M - 4, ry);
    }
    const cy = ry + h / 2;
    fill(pdf, ok ? GREEN : tint(RED, 0.85));
    pdf.circle(M + 7, cy, 2.6, "F");
    pdf.setLineWidth(0.55);
    if (ok) {
      stroke(pdf, WHITE);
      pdf.line(M + 5.8, cy, M + 6.7, cy + 1);
      pdf.line(M + 6.7, cy + 1, M + 8.4, cy - 1.1);
    } else {
      stroke(pdf, RED);
      pdf.line(M + 6, cy - 1, M + 8, cy + 1);
      pdf.line(M + 8, cy - 1, M + 6, cy + 1);
    }
    font(pdf, "regular", 9.4);
    ink(pdf, ok ? INK : RED);
    const l = rows[i] ?? [];
    l.forEach((t, k) => {
      pdf.text(t, M + 13, cy - ((l.length - 1) * 4) / 2 + 1.3 + k * 4);
    });
    if (!ok) {
      pill(pdf, "Not done", p.W - M - 22, cy - 2.3, {
        bg: tint(RED, 0.9),
        fg: RED,
        size: 6.8,
      });
    }
    ry += h;
  });
  y += listH + 4;
  if (s.notes) {
    font(pdf, "regular", 9);
    const lines = wrap(pdf, s.notes, p.W - 2 * M - 10);
    const h = lines.length * 4 + 11;
    card(pdf, M, y, p.W - 2 * M, h, { fill: tint(accent, 0.94) });
    label(pdf, "Notes", M + 5, y + 5.5, accent);
    font(pdf, "regular", 9);
    ink(pdf, INK);
    lines.forEach((l, i) => {
      pdf.text(l, M + 5, y + 10.5 + i * 4);
    });
  }
  font(pdf, "regular", 6.8);
  ink(pdf, MUTED);
  pdf.text(
    `Recorded in the app on ${new Date(s.at).toLocaleString("en-GB")}`,
    M,
    p.H - 14
  );
  footer(pdf, p, venue, `${department}  ·  ${s.title}`);
  return pdf.output("blob");
}

/* --------------------------------- the kit --------------------------------- */

export interface KitSection {
  department: string;
  forms: SheetForm[];
}

async function cover(pdf: Pdf, venue: Venue, sections: KitSection[]) {
  const p = pageOf("portrait");
  const accent = rgb(venue.accent);
  fill(pdf, tint(accent, 0.94));
  pdf.rect(0, 0, p.W, p.H, "F");
  // Big logo card
  card(pdf, 30, 46, p.W - 60, 92, { fill: WHITE, r: 8 });
  const logo = venue.logo ? await image(venue.logo) : null;
  if (logo) {
    drawFit(pdf, logo, 44, 58, p.W - 88, 68);
  }
  font(pdf, "bold", 30);
  ink(pdf, INK);
  pdf.text("Operations Kit", p.W / 2, 166, { align: "center" });
  font(pdf, "regular", 12);
  ink(pdf, MUTED);
  pdf.text(
    venue.name + (venue.tagline ? `  ·  ${venue.tagline}` : ""),
    p.W / 2,
    175,
    { align: "center" }
  );
  const forms = sections.reduce((a, s) => a + s.forms.length, 0);
  const pills = [
    `${sections.length} departments`,
    `${forms} checklists`,
    new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  ];
  font(pdf, "semibold", 8);
  const widths = pills.map((t) => pdf.getTextWidth(t) + 6 + 3);
  let x = (p.W - widths.reduce((a, b) => a + b, 0) + 3) / 2;
  for (const [i, t] of pills.entries()) {
    pill(pdf, t, x, 183, {
      bg: i === 0 ? accent : WHITE,
      fg: i === 0 ? WHITE : INK,
      border: i === 0 ? undefined : tint(accent, 0.7),
      size: 8,
    });
    x += widths[i] ?? 0;
  }
  fill(pdf, accent);
  pdf.rect(0, p.H - 16, p.W, 16, "F");
  font(pdf, "semibold", 9);
  ink(pdf, WHITE);
  pdf.text(
    "Cleaning, food safety and closing routines — print, display, tick, sign.",
    p.W / 2,
    p.H - 6.8,
    { align: "center" }
  );
}

function contents(
  pdf: Pdf,
  venue: Venue,
  sections: KitSection[],
  pages: number[][]
) {
  const p = pageOf("portrait");
  const accent = rgb(venue.accent);
  font(pdf, "bold", 22);
  ink(pdf, INK);
  pdf.text("Contents", M + 2, 26);
  label(pdf, venue.name, M + 2, 33);
  let y = 40;
  sections.forEach((s, si) => {
    const h = 11 + s.forms.length * 7.5;
    card(pdf, M, y, p.W - 2 * M, h, { fill: WHITE, border: LINE });
    fill(pdf, accent);
    pdf.circle(M + 7.5, y + 6.2, 3.4, "F");
    font(pdf, "bold", 8.5);
    ink(pdf, WHITE);
    pdf.text(String(si + 1).padStart(2, "0"), M + 7.5, y + 7.3, {
      align: "center",
    });
    font(pdf, "bold", 11.5);
    ink(pdf, INK);
    pdf.text(s.department, M + 14, y + 7.6);
    s.forms.forEach((f, fi) => {
      const fy = y + 14.5 + fi * 7.5;
      font(pdf, "regular", 9.4);
      ink(pdf, INK);
      pdf.text(f.title, M + 14, fy);
      const tw = pdf.getTextWidth(f.title);
      const pg = String(pages[si]?.[fi] ?? "");
      stroke(pdf, LINE);
      pdf.setLineDashPattern([0.4, 1], 0);
      pdf.line(M + 16 + tw, fy - 0.8, p.W - M - 32, fy - 0.8);
      pdf.setLineDashPattern([], 0);
      pill(pdf, FREQ_EN[f.frequency], p.W - M - 30, fy - 3.2, {
        bg: SOFT,
        fg: MUTED,
        size: 6.5,
      });
      font(pdf, "semibold", 9.4);
      ink(pdf, accent);
      pdf.text(pg, p.W - M - 4, fy, { align: "right" });
    });
    y += h + 4;
  });
  footer(pdf, p, venue, "Contents");
}

function divider(pdf: Pdf, venue: Venue, s: KitSection, index: number) {
  const p = pageOf("portrait");
  const accent = rgb(venue.accent);
  fill(pdf, accent);
  pdf.rect(0, 0, p.W, p.H * 0.58, "F");
  font(pdf, "bold", 96);
  ink(pdf, tint(accent, 0.25));
  pdf.text(String(index + 1).padStart(2, "0"), M + 6, 80);
  font(pdf, "bold", 38);
  ink(pdf, WHITE);
  pdf.text(s.department, M + 8, 120);
  font(pdf, "regular", 12);
  ink(pdf, tint(accent, 0.8));
  pdf.text(
    `${s.forms.length} checklist${s.forms.length === 1 ? "" : "s"}  ·  ${venue.name}`,
    M + 8,
    131
  );
  let y = p.H * 0.58 + 12;
  for (const f of s.forms) {
    card(pdf, M, y, p.W - 2 * M, 16, { fill: WHITE, border: LINE });
    fill(pdf, accent);
    pdf.roundedRect(M, y, 2.2, 16, 1.1, 1.1, "F");
    font(pdf, "semibold", 11);
    ink(pdf, INK);
    pdf.text(f.title, M + 7, y + 7);
    font(pdf, "regular", 8.2);
    ink(pdf, MUTED);
    pdf.text(
      `${FREQ_EN[f.frequency]}  ·  ${f.items.length} tasks`,
      M + 7,
      y + 12.2
    );
    y += 19;
  }
}

/** The venue's whole kit: cover, contents, a divider per department, sheets. */
export async function kitPdf(sections: KitSection[], venue: Venue) {
  const pdf = await newPdf("portrait");
  const list = sections.filter((s) => s.forms.length);
  // Page numbers: cover 1, contents 2, then divider + one page per form
  const pages: number[][] = [];
  let n = 3;
  for (const s of list) {
    n += 1;
    pages.push(s.forms.map(() => n++));
  }
  await cover(pdf, venue, list);
  pdf.addPage("a4", "portrait");
  contents(pdf, venue, list, pages);
  for (const [i, s] of list.entries()) {
    pdf.addPage("a4", "portrait");
    divider(pdf, venue, s, i);
    for (const f of s.forms) {
      const o = orientation(f);
      pdf.addPage("a4", o);
      await drawSheet(pdf, pageOf(o), f, venue);
    }
  }
  return pdf.output("blob");
}
