"use client";

import { type ContractFields, textBlocks } from "./contract";

/** What the PDF needs from a stored contract. */
export interface ContractPdfInput {
  fields: ContractFields;
  /** The frozen text that was signed. */
  text: string;
  hash: string;
  employerSignature: string | null;
  employerSignedAt: number | null;
  employeeName: string | null;
  employeeSignature: string | null;
  employeeSignedAt: number | null;
  employeeIp: string | null;
  employeeAgent: string | null;
}

const stamp = (ms: number | null) =>
  ms ? `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC` : "—";

/**
 * A4 PDF of the contract: the text, both signatures and an audit page
 * (document SHA-256, when and from where each party signed).
 */
export async function contractPdf(c: ContractPdfInput) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const doc = textBlocks(c.text);
  const margin = 20;
  const width = 210 - margin * 2;
  let y = margin;
  const space = (h: number) => {
    if (y + h > 297 - margin) {
      pdf.addPage();
      y = margin;
    }
  };
  const para = (text: string, size = 10, bold = false, gap = 2) => {
    pdf.setFont("times", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(text, width) as string[]) {
      space(size * 0.45);
      pdf.text(line, margin, y);
      y += size * 0.45;
    }
    y += gap;
  };

  pdf.setFont("times", "bold");
  pdf.setFontSize(14);
  pdf.text(doc.title, 105, y, { align: "center" });
  y += 10;
  for (const l of doc.lines) {
    if (l.heading) {
      y += 2;
      para(l.text, 11, true, 1);
    } else {
      para(l.text);
    }
  }

  // Signatures
  space(60);
  y += 8;
  const col = width / 2;
  const sign = (img: string | null, x: number, lines: string[]) => {
    if (img) {
      pdf.addImage(img, "PNG", x, y, 60, 22);
    }
    pdf.line(x, y + 24, x + 70, y + 24);
    pdf.setFont("times", "normal");
    pdf.setFontSize(9.5);
    lines.forEach((l, i) => {
      pdf.text(l, x, y + 29 + i * 4.5);
    });
  };
  sign(c.employerSignature, margin, [
    c.fields.employer.signatory || "For the Company",
    c.fields.employer.signatoryTitle,
    c.fields.employer.name,
    `Signed ${stamp(c.employerSignedAt)}`,
  ]);
  sign(c.employeeSignature, margin + col, [
    c.employeeName || c.fields.employee.name,
    "Employee",
    `Signed ${stamp(c.employeeSignedAt)}`,
  ]);

  // Audit trail
  pdf.addPage();
  y = margin;
  para("Electronic signature record", 13, true, 4);
  para(
    "This contract was signed electronically. The text was fixed when the contract was created; its SHA-256 fingerprint below changes if a single character is altered."
  );
  para(`Document SHA-256: ${c.hash}`, 9);
  para(
    `Company: ${c.fields.employer.name} (${c.fields.employer.regNo}) — signed ${stamp(c.employerSignedAt)}`
  );
  para(
    `Employee: ${c.employeeName ?? "—"} — signed ${stamp(c.employeeSignedAt)} from IP ${c.employeeIp || "—"}`
  );
  para(`Employee device: ${c.employeeAgent || "—"}`, 8.5);
  return pdf.output("blob");
}

/** Saves or shares a PDF blob. */
export async function savePdf(blob: Blob, name: string) {
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch {
      // fall back to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
