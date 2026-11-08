"use client";

import {
  ACKNOWLEDGEMENT,
  type Block,
  CHAPTERS,
  type Chapter,
  welcomeLetter,
} from "./handbook";
import { type Pdf, pdfKit, type RGB, type Venue } from "./sheet-pdf";

/**
 * The employee handbook as a designed A4 PDF in the app's look: cover,
 * welcome letter, contents with page numbers, a coloured divider per
 * chapter, flowing content (cards, steps, tables, chips, callouts),
 * important contacts and a signed acknowledgement page.
 */

const {
  rgb,
  tint,
  INK,
  MUTED,
  LINE,
  SOFT,
  WHITE,
  M,
  fill,
  stroke,
  ink,
  font,
  card,
  pill,
  label,
  wrap,
  image,
  drawFit,
  newPdf,
} = pdfKit;

const W = 210;
const H = 297;
const TOP = 26;
const BOTTOM = H - 16;
const CW = W - 2 * M;

interface Flow {
  pdf: Pdf;
  y: number;
  accent: RGB;
  venue: Venue;
  chapter: string;
  logo: Awaited<ReturnType<typeof image>>;
}

/** Small running header on content pages. */
function pageHeader(f: Flow) {
  pill(f.pdf, f.chapter, M, 10, {
    bg: tint(f.accent, 0.9),
    fg: f.accent,
    size: 7.5,
  });
  if (f.logo) {
    drawFit(f.pdf, f.logo, W - M - 26, 8, 26, 10);
  }
  stroke(f.pdf, LINE);
  f.pdf.setLineWidth(0.2);
  f.pdf.line(M, 20.5, W - M, 20.5);
}

function newPage(f: Flow) {
  f.pdf.addPage("a4", "portrait");
  pageHeader(f);
  f.y = TOP;
}

/** Makes room for a block of height h (new page if needed). */
function ensure(f: Flow, h: number) {
  if (f.y + h > BOTTOM) {
    newPage(f);
  }
}

/* --------------------------------- blocks ---------------------------------- */

function heading(f: Flow, text: string) {
  ensure(f, 22);
  f.y += 3;
  fill(f.pdf, f.accent);
  f.pdf.roundedRect(M, f.y - 4.2, 1.6, 6, 0.8, 0.8, "F");
  font(f.pdf, "bold", 13);
  ink(f.pdf, INK);
  f.pdf.text(text, M + 4.5, f.y);
  f.y += 6;
}

function paragraph(f: Flow, text: string, size = 9.6, color: RGB = INK) {
  font(f.pdf, "regular", size);
  const lh = size * 0.48;
  for (const line of wrap(f.pdf, text, CW)) {
    ensure(f, lh);
    ink(f.pdf, color);
    font(f.pdf, "regular", size);
    f.pdf.text(line, M, f.y);
    f.y += lh;
  }
  f.y += 3;
}

function lead(f: Flow, text: string) {
  font(f.pdf, "regular", 11.5);
  const lines = wrap(f.pdf, text, CW - 10);
  const h = lines.length * 5.6 + 8;
  ensure(f, h);
  card(f.pdf, M, f.y, CW, h, { fill: tint(f.accent, 0.95), r: 4 });
  font(f.pdf, "regular", 11.5);
  ink(f.pdf, INK);
  lines.forEach((l, i) => {
    f.pdf.text(l, M + 5, f.y + 6.8 + i * 5.6);
  });
  f.y += h + 4;
}

function bullets(f: Flow, items: string[]) {
  for (const it of items) {
    font(f.pdf, "regular", 9.4);
    const lines = wrap(f.pdf, it, CW - 7);
    ensure(f, lines.length * 4.4 + 2);
    fill(f.pdf, f.accent);
    f.pdf.circle(M + 1.6, f.y - 1.2, 0.9, "F");
    ink(f.pdf, INK);
    font(f.pdf, "regular", 9.4);
    lines.forEach((l, i) => {
      f.pdf.text(l, M + 5, f.y + i * 4.4);
    });
    f.y += lines.length * 4.4 + 2;
  }
  f.y += 2;
}

function cards(f: Flow, items: { title: string; text: string }[]) {
  const gap = 3.5;
  const w = (CW - gap) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    font(f.pdf, "regular", 8.8);
    const bodies = pair.map((c) => wrap(f.pdf, c.text, w - 10));
    const h = Math.max(...bodies.map((b) => b.length)) * 4 + 16.5;
    ensure(f, h + gap);
    pair.forEach((c, k) => {
      const x = M + k * (w + gap);
      card(f.pdf, x, f.y, w, h, { fill: WHITE, border: LINE });
      fill(f.pdf, f.accent);
      f.pdf.roundedRect(x + 4, f.y + 4.5, 5, 1.6, 0.8, 0.8, "F");
      font(f.pdf, "semibold", 10.2);
      ink(f.pdf, INK);
      f.pdf.text(c.title, x + 4, f.y + 11);
      font(f.pdf, "regular", 8.8);
      ink(f.pdf, MUTED);
      (bodies[k] ?? []).forEach((l, j) => {
        f.pdf.text(l, x + 4, f.y + 16 + j * 4);
      });
    });
    f.y += h + gap;
  }
  f.y += 1;
}

function steps(f: Flow, items: { title: string; text: string }[]) {
  items.forEach((s, i) => {
    font(f.pdf, "regular", 8.8);
    const body = wrap(f.pdf, s.text, CW - 16);
    const h = body.length * 4 + 7.8;
    ensure(f, h);
    const cx = M + 4.5;
    // Connector line to the next step
    if (i < items.length - 1) {
      stroke(f.pdf, tint(f.accent, 0.7));
      f.pdf.setLineWidth(0.5);
      f.pdf.line(cx, f.y + 4.5, cx, f.y + h);
    }
    fill(f.pdf, f.accent);
    f.pdf.circle(cx, f.y + 2.5, 3.6, "F");
    font(f.pdf, "bold", 8.4);
    ink(f.pdf, WHITE);
    f.pdf.text(String(i + 1), cx, f.y + 3.5, { align: "center" });
    font(f.pdf, "semibold", 10.2);
    ink(f.pdf, INK);
    f.pdf.text(s.title, M + 12, f.y + 3.6);
    font(f.pdf, "regular", 8.8);
    ink(f.pdf, MUTED);
    body.forEach((l, j) => {
      f.pdf.text(l, M + 12, f.y + 8.4 + j * 4);
    });
    f.y += h;
  });
  f.y += 3;
}

function table(f: Flow, head: [string, string], rows: [string, string][]) {
  const rowH = 8.4;
  const h = rowH * (rows.length + 1);
  ensure(f, h + 4);
  card(f.pdf, M, f.y, CW, h, { fill: WHITE, border: LINE });
  fill(f.pdf, SOFT);
  f.pdf.roundedRect(M, f.y, CW, rowH, 3.2, 3.2, "F");
  f.pdf.rect(M, f.y + rowH - 3.2, CW, 3.2, "F");
  const split = M + CW * 0.6;
  label(f.pdf, head[0], M + 5, f.y + 5.4, INK);
  label(f.pdf, head[1], split + 4, f.y + 5.4, INK);
  rows.forEach(([a, b], i) => {
    const y = f.y + rowH * (i + 1);
    if (i > 0) {
      stroke(f.pdf, LINE);
      f.pdf.setLineWidth(0.2);
      f.pdf.line(M + 4, y, M + CW - 4, y);
    }
    font(f.pdf, "regular", 9.2);
    ink(f.pdf, INK);
    f.pdf.text(a, M + 5, y + 5.4);
    font(f.pdf, "semibold", 9.2);
    ink(f.pdf, f.accent);
    f.pdf.text(b, split + 4, y + 5.4);
  });
  f.y += h + 5;
}

function chips(f: Flow, items: string[]) {
  font(f.pdf, "semibold", 8.4);
  const h = 7.4;
  let x = M;
  ensure(f, h + 2);
  for (const it of items) {
    const w = f.pdf.getTextWidth(it) + 8;
    if (x + w > M + CW) {
      x = M;
      f.y += h + 2.4;
      ensure(f, h + 2);
    }
    card(f.pdf, x, f.y, w, h, { fill: tint(f.accent, 0.92), r: h / 2 });
    font(f.pdf, "semibold", 8.4);
    ink(f.pdf, INK);
    f.pdf.text(it, x + 4, f.y + 4.9);
    x += w + 2.4;
  }
  f.y += h + 5;
}

const TONE: Record<
  "info" | "warn" | "ok",
  { mark: string; color: (a: RGB) => RGB }
> = {
  info: { mark: "i", color: (a) => a },
  warn: { mark: "!", color: () => [196, 120, 0] },
  ok: { mark: "✓", color: () => [22, 140, 82] },
};

function callout(
  f: Flow,
  tone: "info" | "warn" | "ok",
  title: string,
  text: string
) {
  const c = TONE[tone].color(f.accent);
  font(f.pdf, "regular", 9);
  const lines = wrap(f.pdf, text, CW - 18);
  const h = lines.length * 4.2 + 14;
  ensure(f, h + 2);
  card(f.pdf, M, f.y, CW, h, { fill: tint(c, 0.92), r: 4 });
  fill(f.pdf, c);
  f.pdf.circle(M + 7, f.y + 7, 3.4, "F");
  font(f.pdf, "bold", 9.5);
  ink(f.pdf, WHITE);
  f.pdf.text(TONE[tone].mark, M + 7, f.y + 8.3, { align: "center" });
  font(f.pdf, "semibold", 10.2);
  ink(f.pdf, INK);
  f.pdf.text(title, M + 13, f.y + 8);
  font(f.pdf, "regular", 9);
  ink(f.pdf, INK);
  lines.forEach((l, i) => {
    f.pdf.text(l, M + 13, f.y + 13.4 + i * 4.2);
  });
  f.y += h + 5;
}

function block(f: Flow, b: Block) {
  switch (b.type) {
    case "h":
      return heading(f, b.text);
    case "p":
      return paragraph(f, b.text);
    case "lead":
      return lead(f, b.text);
    case "list":
      return bullets(f, b.items);
    case "cards":
      return cards(f, b.items);
    case "steps":
      return steps(f, b.items);
    case "table":
      return table(f, b.head, b.rows);
    case "chips":
      return chips(f, b.items);
    case "callout":
      return callout(f, b.tone, b.title, b.text);
    default:
      return undefined;
  }
}

/* --------------------------------- pages ----------------------------------- */

function coverPage(f: Flow, company: string) {
  const { pdf, accent } = f;
  fill(pdf, tint(accent, 0.94));
  pdf.rect(0, 0, W, H, "F");
  card(pdf, 28, 40, W - 56, 86, { fill: WHITE, r: 8 });
  if (f.logo) {
    drawFit(pdf, f.logo, 42, 52, W - 84, 62);
  }
  font(pdf, "semibold", 8);
  ink(pdf, accent);
  pdf.text(f.venue.name.toUpperCase(), W / 2, 146, {
    align: "center",
    charSpace: 0.5,
  });
  font(pdf, "bold", 34);
  ink(pdf, INK);
  pdf.text("Employee", W / 2, 162, { align: "center" });
  pdf.text("Handbook", W / 2, 176, { align: "center" });
  font(pdf, "regular", 11);
  ink(pdf, MUTED);
  pdf.text(
    "Everything you need to know to do great work with us.",
    W / 2,
    186,
    { align: "center" }
  );
  const pills = [
    `${CHAPTERS.length} chapters`,
    `Edition ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
  ];
  font(pdf, "semibold", 8);
  const widths = pills.map((t) => pdf.getTextWidth(t) + 9);
  let x = (W - widths.reduce((a, b) => a + b, 0) + 3) / 2;
  for (const [i, t] of pills.entries()) {
    pill(pdf, t, x, 193, {
      bg: i === 0 ? accent : WHITE,
      fg: i === 0 ? WHITE : INK,
      border: i === 0 ? undefined : tint(accent, 0.7),
      size: 8,
    });
    x += widths[i] ?? 0;
  }
  fill(pdf, accent);
  pdf.rect(0, H - 18, W, 18, "F");
  font(pdf, "semibold", 10);
  ink(pdf, WHITE);
  pdf.text(`Welcome to the team  ·  ${company}`, W / 2, H - 7.5, {
    align: "center",
  });
}

function welcomePage(f: Flow, company: string) {
  f.pdf.addPage("a4", "portrait");
  f.chapter = "Welcome";
  pageHeader(f);
  const lines = welcomeLetter(company, f.venue.name);
  font(f.pdf, "bold", 24);
  ink(f.pdf, INK);
  f.pdf.text(lines[0] ?? "Welcome!", M, 42);
  f.y = 54;
  for (const p of lines.slice(1)) {
    paragraph(f, p, 11, INK);
    f.y += 2;
  }
  f.y += 6;
  card(f.pdf, M, f.y, 90, 22, { fill: SOFT });
  label(f.pdf, "With best wishes", M + 5, f.y + 7);
  font(f.pdf, "semibold", 12);
  ink(f.pdf, INK);
  f.pdf.text("The Management", M + 5, f.y + 15.5);
}

function dividerPage(f: Flow, ch: Chapter, i: number) {
  const { pdf, accent } = f;
  pdf.addPage("a4", "portrait");
  fill(pdf, accent);
  pdf.rect(0, 0, W, H * 0.5, "F");
  font(pdf, "bold", 110);
  ink(pdf, tint(accent, 0.22));
  pdf.text(String(i + 1).padStart(2, "0"), M + 4, 92);
  font(pdf, "bold", 34);
  ink(pdf, WHITE);
  const title = wrap(pdf, ch.title, CW - 10);
  title.forEach((t, k) => {
    pdf.text(t, M + 6, 116 + k * 13);
  });
  font(pdf, "regular", 12);
  ink(pdf, tint(accent, 0.8));
  wrap(pdf, ch.summary, CW - 12).forEach((t, k) => {
    pdf.text(t, M + 6, 116 + title.length * 13 + k * 6);
  });
  const sections = ch.blocks
    .filter((b) => b.type === "h")
    .map((b) => (b as { text: string }).text);
  if (sections.length) {
    label(pdf, "In this chapter", M + 2, H * 0.5 + 16);
    let y = H * 0.5 + 22;
    for (const s of sections) {
      card(pdf, M, y, CW, 12, { fill: WHITE, border: LINE });
      fill(pdf, accent);
      pdf.roundedRect(M, y, 2.2, 12, 1.1, 1.1, "F");
      font(pdf, "semibold", 10.5);
      ink(pdf, INK);
      pdf.text(s, M + 7, y + 7.6);
      y += 15;
    }
  }
}

function contactsPage(f: Flow) {
  f.chapter = "Contacts";
  newPage(f);
  heading(f, "Important contacts");
  const rows: [string, string][] = [
    ["Emergency: ambulance, fire, police", "112"],
    ["Venue", f.venue.name],
    ["Manager on duty", ""],
    ["Owner / HR", ""],
    ["First aider", ""],
    ["Maintenance / emergencies", ""],
  ];
  const gap = 4;
  const w = (CW - gap) / 2;
  rows.forEach(([k, v], i) => {
    const x = M + (i % 2) * (w + gap);
    const y = f.y + Math.floor(i / 2) * 26;
    card(f.pdf, x, y, w, 22, {
      fill: i === 0 ? tint(f.accent, 0.9) : WHITE,
      border: LINE,
    });
    label(f.pdf, k, x + 5, y + 7);
    if (v) {
      font(f.pdf, "bold", i === 0 ? 18 : 12);
      ink(f.pdf, i === 0 ? f.accent : INK);
      f.pdf.text(v, x + 5, y + 16.5);
    } else {
      stroke(f.pdf, [200, 197, 190]);
      f.pdf.setLineWidth(0.25);
      f.pdf.line(x + 5, y + 16.5, x + w - 5, y + 16.5);
    }
  });
}

function acknowledgementPage(f: Flow) {
  f.chapter = "Acknowledgement";
  newPage(f);
  const { pdf, accent } = f;
  heading(f, "Acknowledgement of receipt");
  paragraph(f, ACKNOWLEDGEMENT, 10, INK);
  f.y += 4;
  const fields = [
    "Full name",
    "Position",
    "Venue",
    "Start date",
    "Employee signature",
    "Date",
  ];
  const gap = 4;
  const w = (CW - gap) / 2;
  fields.forEach((k, i) => {
    const x = M + (i % 2) * (w + gap);
    const y = f.y + Math.floor(i / 2) * 22;
    card(pdf, x, y, w, 18, { fill: SOFT });
    label(pdf, k, x + 5, y + 6.5);
    stroke(pdf, [195, 192, 185]);
    pdf.setLineWidth(0.25);
    pdf.line(x + 5, y + 14, x + w - 5, y + 14);
  });
  f.y += 3 * 22 + 6;
  pdf.setLineDashPattern([1.2, 1.2], 0);
  stroke(pdf, tint(accent, 0.5));
  pdf.line(M, f.y, W - M, f.y);
  pdf.setLineDashPattern([], 0);
  font(pdf, "regular", 7.5);
  ink(pdf, MUTED);
  pdf.text(
    "Sign, detach and hand this page to your manager. It is kept in your personnel file.",
    M,
    f.y + 5
  );
}

function contentsPage(pdf: Pdf, f: Flow, starts: number[]) {
  pdf.setPage(3);
  font(pdf, "bold", 22);
  ink(pdf, INK);
  pdf.text("Contents", M, 40);
  let y = 50;
  CHAPTERS.forEach((ch, i) => {
    card(pdf, M, y, CW, 15, { fill: WHITE, border: LINE });
    fill(pdf, f.accent);
    pdf.circle(M + 8, y + 7.5, 3.8, "F");
    font(pdf, "bold", 8.6);
    ink(pdf, WHITE);
    pdf.text(String(i + 1).padStart(2, "0"), M + 8, y + 8.6, {
      align: "center",
    });
    font(pdf, "semibold", 11);
    ink(pdf, INK);
    pdf.text(ch.title, M + 15, y + 6.6);
    font(pdf, "regular", 8);
    ink(pdf, MUTED);
    pdf.text(wrap(pdf, ch.summary, CW - 40)[0] ?? "", M + 15, y + 11.4);
    font(pdf, "bold", 11);
    ink(pdf, f.accent);
    pdf.text(String(starts[i] ?? ""), W - M - 5, y + 9, { align: "right" });
    y += 18;
  });
}

function footers(pdf: Pdf, venue: Venue) {
  const total = pdf.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    pdf.setPage(i);
    stroke(pdf, LINE);
    pdf.setLineWidth(0.2);
    pdf.line(M, H - 9, W - M, H - 9);
    font(pdf, "regular", 7);
    ink(pdf, MUTED);
    pdf.text(`${venue.name}  ·  Employee Handbook`, M, H - 5);
    pdf.text(`${i} / ${total}`, W - M, H - 5, { align: "right" });
  }
}

/** The whole handbook for one venue. */
export async function handbookPdf(venue: Venue, company: string) {
  const pdf = await newPdf("portrait");
  const f: Flow = {
    pdf,
    y: TOP,
    accent: rgb(venue.accent),
    venue,
    chapter: "",
    logo: venue.logo ? await image(venue.logo) : null,
  };
  coverPage(f, company);
  welcomePage(f, company);
  // Contents goes on page 3, filled in once the chapter pages are known
  pdf.addPage("a4", "portrait");
  f.chapter = "Contents";
  pageHeader(f);
  const starts: number[] = [];
  CHAPTERS.forEach((ch, i) => {
    dividerPage(f, ch, i);
    starts.push(pdf.getNumberOfPages());
    f.chapter = ch.title;
    newPage(f);
    for (const b of ch.blocks) {
      block(f, b);
    }
  });
  contactsPage(f);
  acknowledgementPage(f);
  contentsPage(pdf, f, starts);
  footers(pdf, venue);
  return pdf.output("blob");
}
