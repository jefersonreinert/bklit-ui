"use client";

import type { Frequency } from "./templates";

/**
 * Printable A4 checklists with the venue's colour logo: a grid to tick by
 * hand (days of the week, weeks of the month, months, or time slots), and
 * a PDF of one filling made in the app.
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
}

export const VENUES: Record<string, Venue> = {
  "the-brew": {
    name: "The Brew",
    logo: "/brands/the-brew.png",
    accent: "#e30613",
  },
  "ribs-house": {
    name: "Ribs House by The Brew",
    logo: "/brands/ribs-house.png",
    accent: "#e30613",
  },
  vinomad: { name: "Vinomad", logo: "/brands/vinomad.png", accent: "#7b1e2b" },
  main: { name: "Casa Brasa", accent: "#c96442" },
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

const PERIOD: Record<Frequency, string> = {
  daily: "Week starting: ____ / ____ / ________",
  weekly: "Month: ______________   Year: ________",
  monthly: "Year: ________",
  log: "Date: ____ / ____ / ________",
};

const FREQ_EN: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  log: "Log",
};

async function imageData(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    return null;
  }
  const blob = await res.blob();
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = url;
  });
  return { url, ...size };
}

const hex = (c: string) =>
  [1, 3, 5].map((k) => Number.parseInt(c.slice(k, k + 2), 16)) as [
    number,
    number,
    number,
  ];

type Pdf = InstanceType<typeof import("jspdf")["jsPDF"]>;

/** Header with the logo, venue, title and period line; returns the y below. */
async function header(
  pdf: Pdf,
  venue: Venue,
  f: SheetForm,
  w: number,
  period: string | null = PERIOD[f.frequency]
) {
  const m = 12;
  let logoW = 0;
  if (venue.logo) {
    const img = await imageData(venue.logo).catch(() => null);
    if (img) {
      const h = 22;
      logoW = Math.min(55, (img.w / img.h) * h);
      const hh = (logoW / img.w) * img.h;
      pdf.addImage(img.url, "PNG", m, m, logoW, hh);
    }
  }
  const x = m + (logoW ? logoW + 6 : 0);
  pdf.setTextColor(...hex(venue.accent));
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(f.title, x, m + 7);
  pdf.setTextColor(60, 60, 60);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(
    period === null
      ? `${venue.name}  ·  ${f.department}`
      : `${venue.name}  ·  ${f.department}  ·  ${FREQ_EN[f.frequency]}`,
    x,
    m + 13
  );
  pdf.setFont("helvetica", "bold");
  if (period) {
    pdf.text(period, x, m + 20);
  }
  pdf.setDrawColor(...hex(venue.accent));
  pdf.setLineWidth(0.8);
  pdf.line(m, m + 26, w - m, m + 26);
  pdf.setTextColor(0, 0, 0);
  return m + 31;
}

function wrap(pdf: Pdf, text: string, width: number) {
  return pdf.splitTextToSize(text, width) as string[];
}

/** Blank printable sheet of a form. */
export async function blankSheetPdf(f: SheetForm, venue: Venue) {
  const { jsPDF } = await import("jspdf");
  const landscape = f.frequency !== "weekly";
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: landscape ? "landscape" : "portrait",
  });
  const W = landscape ? 297 : 210;
  const H = landscape ? 210 : 297;
  const m = 12;
  let y = await header(pdf, venue, f, W);
  const [ar, ag, ab] = hex(venue.accent);

  if (f.frequency === "log") {
    // Rows: time slots. Columns: time | item numbers | initials | remarks
    const timeW = 18;
    const initW = 22;
    const remarkW = 55;
    const n = f.items.length;
    const colW = Math.max(8, (W - 2 * m - timeW - initW - remarkW) / n);
    const legendLines = f.items.map((it, i) => `${i + 1}. ${it.text}`);
    const legendH = Math.ceil(legendLines.length / 2) * 4.6 + 6;
    const rowH = Math.min(9, (H - y - m - legendH - 22) / (f.slots.length + 1));
    // Head row
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(m, y, W - 2 * m, rowH, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    let x = m;
    pdf.text("Time", x + 2, y + rowH / 2 + 1.5);
    x += timeW;
    for (let i = 0; i < n; i++) {
      pdf.text(String(i + 1), x + colW / 2, y + rowH / 2 + 1.5, {
        align: "center",
      });
      x += colW;
    }
    pdf.text("Initials", x + 2, y + rowH / 2 + 1.5);
    x += initW;
    pdf.text("Remarks", x + 2, y + rowH / 2 + 1.5);
    pdf.setTextColor(0, 0, 0);
    y += rowH;
    pdf.setFont("helvetica", "normal");
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.2);
    for (const slot of f.slots) {
      pdf.rect(m, y, W - 2 * m, rowH);
      x = m;
      pdf.text(slot, x + 2, y + rowH / 2 + 1.5);
      x += timeW;
      for (let i = 0; i < n; i++) {
        pdf.line(x, y, x, y + rowH);
        const box = Math.min(5, rowH - 2.5);
        pdf.rect(x + colW / 2 - box / 2, y + rowH / 2 - box / 2, box, box);
        x += colW;
      }
      pdf.line(x, y, x, y + rowH);
      x += initW;
      pdf.line(x, y, x, y + rowH);
      y += rowH;
    }
    // Legend in two columns
    y += 5;
    pdf.setFontSize(8.5);
    const half = Math.ceil(legendLines.length / 2);
    legendLines.forEach((l, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      pdf.text(l, m + col * ((W - 2 * m) / 2), y + row * 4.6);
    });
    y += half * 4.6 + 2;
  } else {
    const cols = COLUMNS[f.frequency];
    const itemW = landscape ? 105 : 92;
    const colW = (W - 2 * m - itemW) / cols.length;
    pdf.setFontSize(9);
    const lines = f.items.map((it) => wrap(pdf, it.text, itemW - 4));
    const rows = lines.map((l) => Math.max(7, l.length * 3.8 + 2.4));
    const footerRoom = 26;
    const total = rows.reduce((a, b) => a + b, 0) + 8;
    // Rows grow to use the page (room to write), or shrink to fit it
    const scale = Math.min(1.8, (H - y - m - footerRoom) / total);
    const headH = 8 * scale;
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(m, y, W - 2 * m, headH, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("Task", m + 2, y + headH / 2 + 1.5);
    cols.forEach((c, i) => {
      pdf.text(c, m + itemW + colW * i + colW / 2, y + headH / 2 + 1.5, {
        align: "center",
      });
    });
    pdf.setTextColor(0, 0, 0);
    y += headH;
    pdf.setFont("helvetica", "normal");
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.2);
    lines.forEach((l, r) => {
      const h = (rows[r] ?? 7) * scale;
      if (r % 2 === 1) {
        pdf.setFillColor(246, 246, 246);
        pdf.rect(m, y, W - 2 * m, h, "F");
      }
      pdf.rect(m, y, W - 2 * m, h);
      l.forEach((t, k) => {
        pdf.text(t, m + 2, y + 4.6 + k * 3.8);
      });
      for (let i = 0; i < cols.length; i++) {
        pdf.line(m + itemW + colW * i, y, m + itemW + colW * i, y + h);
      }
      y += h;
    });
    // Initials row
    pdf.setFont("helvetica", "bold");
    pdf.rect(m, y, W - 2 * m, 8);
    pdf.text("Done by (initials)", m + 2, y + 5.2);
    for (let i = 0; i < cols.length; i++) {
      pdf.line(m + itemW + colW * i, y, m + itemW + colW * i, y + 8);
    }
    y += 8;
    pdf.setFont("helvetica", "normal");
  }

  // Footer: note and manager check
  y += 6;
  pdf.setFontSize(9);
  if (f.note) {
    for (const l of wrap(pdf, f.note, W - 2 * m)) {
      pdf.text(l, m, y);
      y += 4.2;
    }
    y += 2;
  }
  pdf.setFont("helvetica", "bold");
  pdf.text(
    "Checked by manager: ______________________    Signature: ______________________    Date: ____________",
    m,
    Math.min(y + 4, H - m)
  );
  return pdf.output("blob");
}

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

/** PDF of one checklist filled in the app. */
export async function fillingPdf(s: Filling, venue: Venue, department: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const m = 12;
  let y = await header(
    pdf,
    venue,
    {
      title: s.title,
      department,
      frequency: "daily",
      items: [],
      slots: [],
      note: "",
    },
    W,
    null
  );
  // Replace the blank period line with the real one
  pdf.setFontSize(10);
  pdf.text(
    `Date: ${s.day}${s.slot ? `  ·  Time: ${s.slot}` : ""}  ·  Done by: ${s.by}  ·  Recorded: ${new Date(s.at).toLocaleString("en-GB")}`,
    m,
    y
  );
  y += 8;
  const done = new Set(s.done);
  pdf.setFontSize(10.5);
  for (const it of s.items) {
    const ok = done.has(it.id);
    pdf.setDrawColor(120, 120, 120);
    pdf.rect(m, y - 3.6, 4.4, 4.4);
    if (ok) {
      pdf.setDrawColor(0, 130, 60);
      pdf.setLineWidth(0.7);
      pdf.line(m + 0.8, y - 1.4, m + 1.9, y + 0.1);
      pdf.line(m + 1.9, y + 0.1, m + 3.8, y - 3);
      pdf.setLineWidth(0.2);
    }
    pdf.setTextColor(ok ? 0 : 170, ok ? 0 : 30, ok ? 0 : 30);
    for (const l of wrap(
      pdf,
      ok ? it.text : `${it.text}  (not done)`,
      W - 2 * m - 8
    )) {
      pdf.text(l, m + 7, y);
      y += 5;
    }
    y += 1.5;
  }
  pdf.setTextColor(0, 0, 0);
  if (s.notes) {
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.text("Notes", m, y);
    pdf.setFont("helvetica", "normal");
    y += 5;
    for (const l of wrap(pdf, s.notes, W - 2 * m)) {
      pdf.text(l, m, y);
      y += 5;
    }
  }
  return pdf.output("blob");
}
