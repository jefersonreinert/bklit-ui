"use client";

import type { FunctionReturnType } from "convex/server";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { money, usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { type InvItem, num } from "./shared";

/**
 * The digital copy of a supplier invoice: a clean A4 page drawn from what
 * the AI read (and the reviewer fixed), next to the untouched original.
 * It is a transcription for reading, printing and the accountant; the
 * fiscal document is always the original.
 */

type Detail = NonNullable<FunctionReturnType<typeof api.invoices.detail>>;
type Line = Detail["invoice"]["lines"][number];

/** "2026-11-26" → "26/11/2026"; anything else as it came. */
function day(s: string | undefined) {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
}

/** Net and VAT per rate, from the lines (non-stock lines included). */
function vatBreakdown(lines: Line[]) {
  const by = new Map<number, number>();
  for (const l of lines) {
    if (l.vatRate !== null) {
      by.set(l.vatRate, (by.get(l.vatRate) ?? 0) + l.net);
    }
  }
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, net]) => ({ rate, net, vat: (net * rate) / 100 }));
}

const STATUS: Record<Detail["invoice"]["status"], { label: string; tone: string }> = {
  review: { label: "Em revisão", tone: "border-amber-500 text-amber-600" },
  approved: { label: "Aprovada", tone: "border-emerald-600 text-emerald-700" },
  void: { label: "Anulada", tone: "border-red-600 text-red-600" },
};

/** Opens the page alone in a window and prints it (or saves it as PDF). */
function printPaper(el: HTMLElement, title: string) {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    window.alert("O navegador bloqueou a janela. Permita pop-ups para imprimir.");
    return;
  }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((n) => n.outerHTML)
    .join("\n");
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "")}</title>${styles}` +
      "<style>@page{size:A4;margin:12mm}html,body{background:#fff!important;margin:0}" +
      "[data-paper]{box-shadow:none!important;border:0!important;max-width:none!important;margin:0!important;padding:0!important}</style>" +
      `</head><body>${el.outerHTML}</body></html>`
  );
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
  };
  // Let the copied stylesheets load before printing
  if (w.document.readyState === "complete") {
    setTimeout(go, 400);
  } else {
    w.addEventListener("load", () => setTimeout(go, 200));
  }
}

export function DigitalInvoice({
  d,
  items,
  marks,
}: {
  d: Detail;
  items: InvItem[];
  /** While in review: highlight lines to resolve and show the linked items. */
  marks: boolean;
}) {
  const { settings } = usePos();
  const paper = useRef<HTMLDivElement | null>(null);
  const inv = d.invoice;
  // Older backends don't send the letterheads yet: fall back to the names
  const { supplier, buyer } = (d.parties as Detail["parties"] | undefined) ?? {
    supplier: { name: inv.supplierName, taxId: "", email: "", phone: "" },
    buyer: { name: "", legalName: "", taxId: "", address: "", phone: "", email: "", logo: "", color: "#c96442" },
  };
  const cur = inv.currency || settings.currency;
  const fmt = (v: number) => money(v, cur);
  const name = (id: Line["itemId"]) => (id ? items.find((i) => i._id === id)?.name : undefined);
  const rates = vatBreakdown(inv.lines);
  const status = STATUS[inv.status];
  const title = `${inv.credit ? "Nota de crédito" : "Fatura"} ${inv.number} · ${supplier.name}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          onClick={() => paper.current && printPaper(paper.current, title)}
          size="sm"
          variant="outline"
        >
          <Icon className="size-4" name="IconPrinter" />
          Imprimir / salvar PDF
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div
          className="mx-auto min-w-[640px] max-w-[210mm] rounded-sm border border-zinc-200 bg-white p-10 text-[13px] text-zinc-800 shadow-sm"
          data-paper
          ref={paper}
          style={{ colorScheme: "light" }}
        >
          {/* Letterhead: supplier on the left, document on the right */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="font-semibold text-lg text-zinc-900 leading-tight">{supplier.name}</p>
              <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                {supplier.taxId ? <p>NIF / VAT {supplier.taxId}</p> : null}
                {supplier.phone ? <p>{supplier.phone}</p> : null}
                {supplier.email ? <p>{supplier.email}</p> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p
                className="font-semibold text-2xl uppercase tracking-wide"
                style={{ color: buyer.color }}
              >
                {inv.credit ? "Nota de crédito" : "Fatura"}
              </p>
              <p className="mt-1 font-medium text-zinc-900">Nº {inv.number || "—"}</p>
              <span
                className={cn(
                  "mt-2 inline-block rounded border-2 px-2 py-0.5 font-semibold text-[10px] uppercase tracking-widest",
                  status.tone
                )}
              >
                {status.label}
                {inv.status === "approved" ? (inv.paidAt ? " · paga" : " · a pagar") : ""}
              </span>
            </div>
          </div>

          <div className="my-6 h-px" style={{ background: buyer.color }} />

          {/* Buyer and dates */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-1 font-semibold text-[10px] text-zinc-400 uppercase tracking-widest">
                Cliente
              </p>
              <div className="flex items-start gap-3">
                {buyer.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-10 w-auto max-w-24 object-contain" src={buyer.logo} />
                ) : null}
                <div className="space-y-0.5">
                  <p className="font-medium text-zinc-900">{buyer.legalName || buyer.name}</p>
                  {buyer.legalName && buyer.name && buyer.legalName !== buyer.name ? (
                    <p className="text-xs text-zinc-500">{buyer.name}</p>
                  ) : null}
                  {buyer.address ? <p className="whitespace-pre-line text-xs text-zinc-500">{buyer.address}</p> : null}
                  {buyer.taxId ? <p className="text-xs text-zinc-500">VAT {buyer.taxId}</p> : null}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 self-start text-right">
              <dt className="text-xs text-zinc-400">Data</dt>
              <dd className="font-medium text-zinc-900">{day(inv.date)}</dd>
              <dt className="text-xs text-zinc-400">Vencimento</dt>
              <dd className="font-medium text-zinc-900">{day(inv.dueDate)}</dd>
              <dt className="text-xs text-zinc-400">Moeda</dt>
              <dd className="font-medium text-zinc-900">{cur}</dd>
            </dl>
          </div>

          {/* Lines */}
          <table className="mt-8 w-full border-collapse">
            <thead>
              <tr
                className="text-left font-semibold text-[10px] uppercase tracking-wider"
                style={{ color: buyer.color }}
              >
                <th className="border-zinc-300 border-b-2 py-2 pr-2">Descrição</th>
                <th className="border-zinc-300 border-b-2 px-2 py-2 text-right">Qtd.</th>
                <th className="border-zinc-300 border-b-2 px-2 py-2 text-right">Preço un.</th>
                <th className="border-zinc-300 border-b-2 px-2 py-2 text-right">IVA</th>
                <th className="border-zinc-300 border-b-2 py-2 pl-2 text-right">Total s/ IVA</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => {
                const item = name(l.itemId);
                const unsure = l.match === "similar" && l.score < 0.85;
                const pending = marks && !l.skip && (!l.itemId || l.perUnit <= 0 || unsure);
                const unit = l.unitPrice ?? (l.quantity ? l.net / l.quantity : 0);
                return (
                  <tr
                    className={cn("align-top", i % 2 === 1 && "bg-zinc-50", pending && "bg-amber-50")}
                    key={l.id}
                  >
                    <td className="border-zinc-100 border-b py-2 pr-2">
                      <p className="text-zinc-900">
                        {pending ? (
                          <span className="mr-1.5 inline-block size-2 rounded-full bg-amber-500" title="Linha por resolver" />
                        ) : null}
                        {l.description}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {[
                          l.code ? `Cód. ${l.code}` : "",
                          l.ean ? `EAN ${l.ean}` : "",
                          l.packSize ? `${num(l.packSize)} ${l.packUnit}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {marks && l.skip ? (
                        <p className="text-[11px] text-zinc-400 italic">Não é estoque</p>
                      ) : marks && item ? (
                        <p className="text-[11px] text-emerald-700">→ {item}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap border-zinc-100 border-b px-2 py-2 text-right tabular-nums">
                      {num(l.quantity, 3)} {l.unit || "un"}
                    </td>
                    <td className="whitespace-nowrap border-zinc-100 border-b px-2 py-2 text-right tabular-nums">
                      {unit ? fmt(unit) : "—"}
                    </td>
                    <td className="whitespace-nowrap border-zinc-100 border-b px-2 py-2 text-right tabular-nums">
                      {l.vatRate !== null ? `${num(l.vatRate)}%` : "—"}
                    </td>
                    <td className="whitespace-nowrap border-zinc-100 border-b py-2 pl-2 text-right font-medium text-zinc-900 tabular-nums">
                      {fmt(l.net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
            {rates.length ? (
              <table className="text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-zinc-400 uppercase tracking-wider">
                    <th className="pr-4 pb-1 font-semibold">Taxa</th>
                    <th className="pr-4 pb-1 text-right font-semibold">Base</th>
                    <th className="pb-1 text-right font-semibold">IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.rate}>
                      <td className="pr-4 tabular-nums">{num(r.rate)}%</td>
                      <td className="pr-4 text-right tabular-nums">{fmt(r.net)}</td>
                      <td className="text-right tabular-nums">{fmt(r.vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span />
            )}
            <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1.5">
              <dt className="text-zinc-500">Subtotal</dt>
              <dd className="text-right tabular-nums">{fmt(inv.subtotal)}</dd>
              <dt className="text-zinc-500">IVA</dt>
              <dd className="text-right tabular-nums">{fmt(inv.vat)}</dd>
              <dt
                className="mt-1 border-t-2 pt-2 font-semibold text-base text-zinc-900"
                style={{ borderColor: buyer.color }}
              >
                Total
              </dt>
              <dd
                className="mt-1 border-t-2 pt-2 text-right font-semibold text-base text-zinc-900 tabular-nums"
                style={{ borderColor: buyer.color }}
              >
                {fmt(inv.total)}
              </dd>
            </dl>
          </div>

          {inv.note ? (
            <p className="mt-6 whitespace-pre-line rounded bg-zinc-50 p-3 text-xs text-zinc-600">{inv.note}</p>
          ) : null}

          <p className="mt-10 border-zinc-200 border-t pt-3 text-center text-[10px] text-zinc-400">
            Transcrição digital gerada a partir do original. O documento fiscal válido é o
            original do fornecedor.
            {inv.approvedBy ? ` Aprovada por ${inv.approvedBy}.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The supplier's own pages: photos inline, PDFs in a viewer. */
export function OriginalFiles({ files }: { files: Detail["files"] }) {
  if (!files.length) {
    return <p className="py-10 text-center text-muted-foreground text-sm">Este invoice não tem o original guardado.</p>;
  }
  return (
    <div className="space-y-4">
      {files.map((f, i) =>
        f.url ? (
          <figure className="space-y-1.5" key={f.id}>
            <figcaption className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
              <span className="truncate">
                {files.length > 1 ? `Página ${i + 1} · ` : ""}
                {f.name}
              </span>
              <a className="shrink-0 underline" href={f.url} rel="noreferrer" target="_blank">
                Abrir em nova aba
              </a>
            </figcaption>
            {f.type === "application/pdf" ? (
              <iframe className="h-[80vh] w-full rounded-lg border bg-white" src={f.url} title={f.name} />
            ) : (
              <a href={f.url} rel="noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={f.name} className="mx-auto w-full max-w-[210mm] rounded-lg border bg-white" src={f.url} />
              </a>
            )}
          </figure>
        ) : null
      )}
    </div>
  );
}
