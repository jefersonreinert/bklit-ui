"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { receiptPdf, sharePdf } from "@/lib/pos/print";
import {
  DEFAULT_VAT_RATE,
  METHOD_LABEL,
  sampleDoc,
  vatIncluded,
} from "@/lib/pos/receipt";
import {
  money,
  orderTotals,
  saveReceipt,
  saveSettings,
  useCompany,
  usePos,
  usePosQuery,
} from "@/lib/pos/store";
import type { PaymentMethod } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

/**
 * Malta compliance (MTCA, ex-CFR): fiscal details on the receipt, the
 * documents for the VAT EXO number application, the daily Z report and the
 * receipt journal export. Malta has no online reporting today, so nothing is
 * sent automatically: this page produces what the MTCA or an auditor asks for.
 */

type JournalRow = NonNullable<typeof api.pos.journal._returnType>[number];

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${isoDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Local midnight of "YYYY-MM-DD" (or the 1st of "YYYY-MM") and the next one. */
function rangeOf(value: string, unit: "day" | "month") {
  const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
  const from = new Date(y, m - 1, unit === "day" ? d : 1);
  const to = unit === "day" ? new Date(y, m - 1, d + 1) : new Date(y, m, 1);
  return { from: from.getTime(), to: to.getTime() };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function rowFigures(o: JournalRow, rate: number) {
  const gross = r2(orderTotals(o).total);
  const vat = vatIncluded(gross, rate);
  return { gross, vat, net: r2(gross - vat), tip: o.payment?.tip ?? 0 };
}

function zReport(rows: JournalRow[], rate: number) {
  const paid = rows.filter((o) => o.status === "paid");
  const voided = rows.filter((o) => o.status === "void");
  const t = { gross: 0, vat: 0, net: 0, tips: 0, service: 0 };
  const methods: Record<string, number> = {};
  for (const o of paid) {
    const f = rowFigures(o, rate);
    t.gross += f.gross;
    t.vat += f.vat;
    t.net += f.net;
    t.tips += f.tip;
    t.service += orderTotals(o).tax;
    const method = o.payment?.method ?? "other";
    methods[method] = (methods[method] ?? 0) + f.gross;
  }
  const numbers = paid
    .map((o) => o.fiscalNumber)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  return {
    receipts: paid.length,
    gross: r2(t.gross),
    vat: r2(t.vat),
    net: r2(t.net),
    tips: r2(t.tips),
    service: r2(t.service),
    methods,
    first: numbers[0],
    last: numbers.at(-1),
    voids: voided.length,
    voidValue: r2(voided.reduce((a, o) => a + orderTotals(o).total, 0)),
  };
}

const CSV_SPECIAL = /[",\n;]/;
const QUOTE = /"/g;
const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return CSV_SPECIAL.test(s) ? `"${s.replace(QUOTE, '""')}"` : s;
};
const toCsv = (rows: (string | number | undefined)[][]) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\n");

function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(
    new Blob([`﻿${content}`], { type: `${type};charset=utf-8` })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const methodLabel = (m?: string) =>
  m ? (METHOD_LABEL[m as PaymentMethod] ?? m) : "";

/* ------------------------------ fiscal details ----------------------------- */

function FiscalDetails() {
  const data = usePos();
  const r = data.receipt;
  const rate = data.settings.vatRate ?? DEFAULT_VAT_RATE;
  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    hint?: string,
    placeholder?: string
  ) => (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      {label}
      <Input
        autoComplete="off"
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </label>
  );
  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div>
        <p className="font-semibold">Dados fiscais no recibo</p>
        <p className="text-muted-foreground text-sm">
          Saem em todo recibo. Os preços dos produtos já incluem o IVA; o recibo
          mostra quanto dele é IVA.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          "mt-legal",
          "Razão social (nome legal)",
          r.legalName,
          (v) => saveReceipt({ legalName: v }),
          undefined,
          "Ex.: Casa Brasa Ltd"
        )}
        {field(
          "mt-vat",
          "Número de IVA (VAT No.)",
          r.taxId,
          (v) => saveReceipt({ taxId: v.trim(), showTaxId: true }),
          undefined,
          "MT12345678"
        )}
        {field(
          "mt-exo",
          "Número EXO (VAT EXO Number)",
          r.exoNumber ?? "",
          (v) => saveReceipt({ exoNumber: v.trim() }),
          "Dado pela MTCA quando o POS for aprovado.",
          "Ainda não tenho"
        )}
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="mt-rate">
          IVA incluído nos preços (%)
          <Input
            id="mt-rate"
            inputMode="decimal"
            onChange={(e) =>
              saveSettings({
                vatRate: Number(e.target.value.replace(",", ".")) || 0,
              })
            }
            value={String(rate)}
          />
          <span className="text-muted-foreground text-xs">
            Taxa padrão de Malta: 18%. Confirme com seu contador.
          </span>
        </label>
      </div>
      {field(
        "mt-address",
        "Endereço",
        r.address,
        (v) => saveReceipt({ address: v }),
        undefined,
        "Rua, cidade, Malta"
      )}
    </section>
  );
}

/* ------------------------------ EXO application ---------------------------- */

const STEPS: [string, string][] = [
  ["Análise inicial (vetting)", "15 dias"],
  ["Avaliação (assessment)", "3 dias"],
  ["Aprovação", "2 dias"],
  ["Entrega do documento", "1 dia"],
];

function softwareSheet(opts: {
  business: string;
  vatNo: string;
  rate: number;
  currency: string;
}) {
  const today = isoDay(new Date());
  return `POINT OF SALE SOFTWARE — TECHNICAL DESCRIPTION
For the VAT EXO Number application (Malta Tax and Customs Administration)
Draft generated on ${today}. To be checked and signed by the software supplier
and the auditor; this text is not itself a certificate.

1. Business
   Name: ${opts.business || "-"}
   VAT No.: ${opts.vatNo || "-"}

2. Software
   Name: Casa Brasa POS (web application, runs on tablets/phones and printers
   on the premises; data kept in the business's own database server).
   Currency: ${opts.currency}

3. Fiscal receipts
   - A fiscal receipt is issued for every paid sale.
   - Fiscal receipt numbers are consecutive and assigned by the server at the
     moment of payment, in a single transaction; a number is never reused and
     cancelled orders never take one, so the sequence has no gaps.
   - Each receipt shows: business name, VAT No., EXO No., date and time,
     fiscal receipt number, order number, each item with quantity, unit price
     and total, the total amount, the VAT rate and the VAT included
     (prices are VAT-inclusive, ${opts.rate}%), the net amount, and the
     payment method.
   - Tips are recorded separately and are outside the VAT base.

4. Pre-bills
   - Before payment the system can print a pre-bill, clearly titled
     "PRE-BILL" and "NOT A FISCAL RECEIPT", without a fiscal number.

5. Cancellations and audit trail
   - Paid orders cannot be deleted or edited.
   - Cancelling an order requires a user with that permission; the order is
     kept with status "void", the user's name and the time, and the action is
     written to the audit log.
   - Every user logs in with a personal PIN; each sale records who opened
     and who closed it.

6. Reports and records
   - Daily Z report: number of receipts, first and last fiscal number, gross
     sales, VAT, net, payment methods, tips and cancellations.
   - Receipt journal export (CSV) for any day or month, for the accountant,
     the auditor or the MTCA.
   - Records are kept in the database and are not deleted by the software.
`;
}

function ExoApplication() {
  const data = usePos();
  const r = data.receipt;
  const [busy, setBusy] = useState<string | null>(null);
  const model = async (prebill: boolean) => {
    const name = prebill ? "modelo-pre-bill.pdf" : "modelo-fiscal-receipt.pdf";
    setBusy(name);
    try {
      await sharePdf(
        await receiptPdf(sampleDoc(data, { prebill }), data.receipt),
        name
      );
    } finally {
      setBusy(null);
    }
  };
  const docs: { name: string; who: string; action?: ReactNode }[] = [
    {
      name: "Software Supplier Certificate",
      who: "Assinado por quem fornece o software (aqui, você ou sua empresa). Use a ficha técnica como base.",
      action: (
        <Button
          onClick={() =>
            download(
              "ficha-tecnica-pos.txt",
              softwareSheet({
                business: r.legalName || r.businessName,
                vatNo: r.taxId,
                rate: data.settings.vatRate ?? DEFAULT_VAT_RATE,
                currency: data.settings.currency,
              }),
              "text/plain"
            )
          }
          size="sm"
          variant="outline"
        >
          Baixar ficha técnica
        </Button>
      ),
    },
    {
      name: "Auditor Certificate",
      who: "Emitido por um auditor registrado em Malta, depois de conferir o sistema.",
    },
    {
      name: "Modelo do recibo fiscal (Fiscal Receipt)",
      who: "Gerado com os dados fiscais acima.",
      action: (
        <Button
          disabled={busy !== null}
          onClick={() => model(false)}
          size="sm"
          variant="outline"
        >
          {busy === "modelo-fiscal-receipt.pdf" ? "Gerando…" : "Baixar PDF"}
        </Button>
      ),
    },
    {
      name: "Modelo da pré-conta (Pre-bill)",
      who: "Conta antes do pagamento, marcada como “NOT A FISCAL RECEIPT”.",
      action: (
        <Button
          disabled={busy !== null}
          onClick={() => model(true)}
          size="sm"
          variant="outline"
        >
          {busy === "modelo-pre-bill.pdf" ? "Gerando…" : "Baixar PDF"}
        </Button>
      ),
    },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div>
        <p className="font-semibold">Pedido do número EXO (MTCA)</p>
        <p className="text-muted-foreground text-sm">
          O EXO autoriza o uso deste POS no lugar de uma caixa registradora
          fiscal. O pedido é feito no portal{" "}
          <a
            className="underline"
            href="https://servizz.gov.mt"
            rel="noopener noreferrer"
            target="_blank"
          >
            servizz.gov.mt
          </a>{" "}
          (serviço “VAT EXO Number”).
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {docs.map((d, i) => (
          <li
            className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3 sm:flex-row sm:items-center"
            key={d.name}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{d.name}</p>
              <p className="text-muted-foreground text-xs">{d.who}</p>
            </div>
            {d.action ?? null}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {STEPS.map(([step, days]) => (
          <div className="rounded-2xl border p-3" key={step}>
            <p className="text-muted-foreground text-xs">{step}</p>
            <p className="font-semibold">{days}</p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Prazo publicado pelo governo: cerca de 21 dias. Reserve 30 a 45 dias
        para correções e documentos extras.
      </p>
    </section>
  );
}

/* ------------------------------ Z report / journal ------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Reports() {
  const data = usePos();
  const company = useCompany();
  const currency = data.settings.currency;
  const rate = data.settings.vatRate ?? DEFAULT_VAT_RATE;
  const m = (v: number) => money(v, currency);
  const [unit, setUnit] = useState<"day" | "month">("day");
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [month, setMonth] = useState(() => isoMonth(new Date()));
  const value = unit === "day" ? day : month;
  const range = useMemo(() => rangeOf(value, unit), [value, unit]);
  const rows = usePosQuery(api.pos.journal, { ...range, company }) as
    | JournalRow[]
    | null
    | undefined;
  const z = useMemo(() => (rows ? zReport(rows, rate) : null), [rows, rate]);

  const exportJournal = () => {
    if (!rows) {
      return;
    }
    const lines = rows.map((o) => {
      const f = rowFigures(o, rate);
      return [
        o.fiscalNumber,
        o.number,
        stamp(o.closedAt),
        o.status === "paid" ? "paid" : "void",
        f.gross.toFixed(2),
        rate,
        f.vat.toFixed(2),
        f.net.toFixed(2),
        f.tip.toFixed(2),
        o.status === "paid" ? methodLabel(o.payment?.method) : "",
        o.payment?.ref,
        o.closedBy,
      ];
    });
    download(
      `journal-${value}.csv`,
      toCsv([
        [
          "fiscal_receipt_no",
          "order_no",
          "date_time",
          "status",
          `gross_${currency}`,
          "vat_rate",
          "vat",
          "net",
          "tip",
          "payment_method",
          "payment_ref",
          "operator",
        ],
        ...lines,
      ])
    );
  };

  const exportZ = () => {
    if (!z) {
      return;
    }
    const r = data.receipt;
    download(
      `z-report-${value}.csv`,
      toCsv([
        ["Z report", value],
        ["Business", r.legalName || r.businessName],
        ["VAT No.", r.taxId],
        ["EXO No.", r.exoNumber ?? ""],
        ["Generated", stamp(Date.now())],
        [],
        ["Fiscal receipts", z.receipts],
        ["First fiscal no.", z.first],
        ["Last fiscal no.", z.last],
        [`Gross sales (${currency})`, z.gross.toFixed(2)],
        [`VAT ${rate}% included`, z.vat.toFixed(2)],
        ["Net (excl. VAT)", z.net.toFixed(2)],
        ["Service charge (in gross)", z.service.toFixed(2)],
        ["Tips (outside VAT)", z.tips.toFixed(2)],
        ...Object.entries(z.methods).map(([k, v]) => [
          `Paid by ${methodLabel(k)}`,
          v.toFixed(2),
        ]),
        ["Cancelled orders", z.voids],
        ["Cancelled value", z.voidValue.toFixed(2)],
      ])
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div>
        <p className="font-semibold">Relatório Z e diário de recibos</p>
        <p className="text-muted-foreground text-sm">
          Para o contador, o auditor ou a MTCA. Baixe em CSV (abre no Excel).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {(["day", "month"] as const).map((u) => (
            <button
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                unit === u ? "bg-background shadow-sm" : "text-muted-foreground"
              )}
              key={u}
              onClick={() => setUnit(u)}
              type="button"
            >
              {u === "day" ? "Dia" : "Mês"}
            </button>
          ))}
        </div>
        {unit === "day" ? (
          <Input
            className="w-auto"
            onChange={(e) => e.target.value && setDay(e.target.value)}
            type="date"
            value={day}
          />
        ) : (
          <Input
            className="w-auto"
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            type="month"
            value={month}
          />
        )}
      </div>
      {rows === null ? (
        <p className="text-muted-foreground text-sm">
          Seu usuário não tem acesso aos relatórios.
        </p>
      ) : null}
      {rows === undefined ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : null}
      {z ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Recibos fiscais" value={String(z.receipts)} />
            <Stat
              label="Numeração"
              value={z.first ? `${z.first} – ${z.last}` : "—"}
            />
            <Stat label="Vendas (com IVA)" value={m(z.gross)} />
            <Stat label={`IVA ${rate}%`} value={m(z.vat)} />
            <Stat label="Líquido (sem IVA)" value={m(z.net)} />
            <Stat label="Gorjetas" value={m(z.tips)} />
            <Stat label="Cancelados" value={String(z.voids)} />
            <Stat label="Valor cancelado" value={m(z.voidValue)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!rows?.length} onClick={exportZ} size="sm">
              Baixar relatório Z
            </Button>
            <Button
              disabled={!rows?.length}
              onClick={exportJournal}
              size="sm"
              variant="outline"
            >
              Baixar diário de recibos
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function MaltaCompliance() {
  const data = usePos();
  const exo = data.receipt.exoNumber;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div
        className={cn(
          "rounded-3xl p-4 text-sm",
          exo
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
        )}
      >
        {exo ? (
          <p>
            POS aprovado (EXO {exo}). Os recibos saem como recibo fiscal com
            numeração própria e IVA discriminado.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Ainda sem número EXO.</span> Até a
            MTCA aprovar, os recibos deste POS não valem como recibo fiscal em
            Malta. Malta não tem envio online de vendas: a aprovação é pelo
            pedido do EXO abaixo.
          </p>
        )}
      </div>
      <FiscalDetails />
      <ExoApplication />
      <Reports />
    </div>
  );
}
