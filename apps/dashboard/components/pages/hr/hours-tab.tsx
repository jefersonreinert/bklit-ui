"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useMemo, useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_PAY, type PaySettings, payFor } from "@/lib/hr/pay";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../telegram/telegram-shared";

/**
 * Hours and gross pay of a month from the POS time clock: overtime per
 * week, Sundays and Malta public holidays, manual corrections, approval
 * and a CSV for the payroll. Tax and social security stay with payroll.
 */

type Row = NonNullable<FunctionReturnType<typeof api.payroll.month>>[number];
type Settings = NonNullable<FunctionReturnType<typeof api.payroll.settings>>;

const eur = (n: number) =>
  n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

const CSV_SPECIAL = /[",\n;]/;
const QUOTE = /"/g;
const cell = (v: string | number) => {
  const s = String(v);
  return CSV_SPECIAL.test(s) ? `"${s.replace(QUOTE, '""')}"` : s;
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const payInput = (r: Row, month: string) => ({
  month,
  punches: r.punches,
  payType: r.payType,
  hourlyRate: r.hourlyRate,
  monthlySalary: r.monthlySalary,
  adjustHours: r.adjustments.reduce((a, x) => a + x.hours, 0),
});

export function HrHoursTab() {
  return (
    <TelegramProvider
      fallback={
        <Notice>
          O ponto usa o banco central do painel, indisponível agora.
        </Notice>
      }
    >
      <Hours />
    </TelegramProvider>
  );
}

function Hours() {
  const [month, setMonth] = useState(thisMonth);
  const rows = useQuery(api.payroll.month, { month });
  const settings = useQuery(api.payroll.settings, {});
  const [open, setOpen] = useState<Id<"posUsers"> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const pay: PaySettings = settings ?? DEFAULT_PAY;

  const computed = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ r, p: payFor(payInput(r, month), pay) }))
        .sort((a, b) => a.r.name.localeCompare(b.r.name)),
    [rows, month, pay]
  );

  if (rows === null || settings === null) {
    return <PanelUnlock what="ver as horas e o pagamento da equipe" />;
  }
  if (rows === undefined || settings === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  const total = computed.reduce((a, x) => a + x.p.gross, 0);

  const exportCsv = () => {
    const lines = [
      [
        "employee",
        "pay_type",
        "hours",
        "overtime_h",
        "sunday_h",
        "holiday_h",
        "adjust_h",
        "rate_eur",
        "base_eur",
        "extras_eur",
        "gross_eur",
        "approved",
      ],
      ...computed.map(({ r, p }) => [
        r.name,
        r.payType,
        p.hours,
        p.overtime,
        p.sunday,
        p.holiday,
        p.adjustHours,
        p.rate,
        p.base,
        p.extras,
        p.gross,
        r.approvedAt ? "yes" : "no",
      ]),
    ];
    download(
      `horas-${month}.csv`,
      lines.map((l) => l.map(cell).join(",")).join("\n")
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Mês"
          className="w-auto"
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          type="month"
          value={month}
        />
        <Button onClick={exportCsv} size="sm" variant="outline">
          Baixar CSV para a folha
        </Button>
        <Button onClick={() => setShowSettings(true)} size="sm" variant="ghost">
          Configurações do RH
        </Button>
      </div>
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <p>
          Total bruto do mês: <b>{eur(total)}</b> · extra após {pay.weeklyHours}{" "}
          h/semana ×{pay.overtime} · domingo ×{pay.sunday} · feriado ×
          {pay.holiday}
        </p>
        <p className="text-muted-foreground text-xs">
          Valores brutos, das batidas de ponto do POS. Impostos (FSS) e
          Segurança Social ficam com a folha / contador. Confirme os
          multiplicadores com o seu contador.
        </p>
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {computed.map(({ r, p }) => (
          <li key={r.id}>
            <button
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
              onClick={() => setOpen(r.id)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {r.name}
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {p.hours} h · extra {p.overtime} h · dom {p.sunday} h ·
                  feriado {p.holiday} h
                  {p.open ? ` · ${p.open} ponto aberto` : ""}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-semibold text-sm tabular-nums">
                  {eur(p.gross)}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    r.approvedAt
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground"
                  )}
                >
                  {r.approvedAt ? "Aprovado" : "A aprovar"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <MonthSheet
          month={month}
          onClose={() => setOpen(null)}
          pay={pay}
          row={rows.find((r) => r.id === open)}
        />
      ) : null}
      {showSettings ? (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          settings={settings}
        />
      ) : null}
    </div>
  );
}

const KIND_LABEL = { normal: "", sunday: "Domingo", holiday: "Feriado" };

function MonthSheet({
  row,
  month,
  pay,
  onClose,
}: {
  row: Row | undefined;
  month: string;
  pay: PaySettings;
  onClose: () => void;
}) {
  const add = useMutation(api.payroll.addAdjustment);
  const remove = useMutation(api.payroll.removeAdjustment);
  const approve = useMutation(api.payroll.approve);
  const reopen = useMutation(api.payroll.reopen);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!row) {
    return null;
  }
  const p = payFor(payInput(row, month), pay);
  const locked = Boolean(row.approvedAt);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await add({
        userId: row.id,
        month,
        hours: Number(hours.replace(",", ".")),
        note,
      });
      setHours("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{row.name}</SheetTitle>
          <SheetDescription>
            {month} ·{" "}
            {row.payType === "monthly" ? "Salário mensal + extras" : "Por hora"}{" "}
            · hora {eur(p.rate)}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Box label="Horas" value={`${p.hours} h`} />
            <Box label="Extras" value={`${p.overtime} h`} />
            <Box label="Domingos" value={`${p.sunday} h`} />
            <Box label="Feriados" value={`${p.holiday} h`} />
            {row.payType === "monthly" ? (
              <>
                <Box label="Salário" value={eur(p.base)} />
                <Box label="Extras e adicionais" value={eur(p.extras)} />
              </>
            ) : null}
            <Box label="Bruto do mês" value={eur(p.gross)} />
          </div>
          {p.open ? (
            <p className="rounded-xl bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
              {p.open} ponto(s) sem saída não entram na conta. Corrija em POS →
              Equipe.
            </p>
          ) : null}
          <section className="flex flex-col gap-1">
            <p className="font-semibold">Dias trabalhados</p>
            {p.days.length === 0 ? (
              <p className="text-muted-foreground">Sem batidas neste mês.</p>
            ) : null}
            {p.days.map((d) => (
              <div className="flex justify-between border-b py-1" key={d.date}>
                <span>
                  {d.date}{" "}
                  <span className="text-muted-foreground text-xs">
                    {d.holiday ?? KIND_LABEL[d.kind]}
                  </span>
                </span>
                <span className="tabular-nums">
                  {d.hours} h{d.overtime ? ` (extra ${d.overtime})` : ""}
                </span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-2">
            <p className="font-semibold">Ajustes</p>
            {row.adjustments.map((a) => (
              <div
                className="flex items-center justify-between gap-2"
                key={a.at}
              >
                <span>
                  {a.hours > 0 ? "+" : ""}
                  {a.hours} h · {a.note}
                </span>
                {locked ? null : (
                  <Button
                    onClick={() => remove({ userId: row.id, month, at: a.at })}
                    size="sm"
                    variant="ghost"
                  >
                    Remover
                  </Button>
                )}
              </div>
            ))}
            {locked ? null : (
              <form className="flex flex-wrap gap-2" onSubmit={submit}>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="+2 ou -1"
                  value={hours}
                />
                <Input
                  className="min-w-40 flex-1"
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Motivo (ex.: esqueceu o ponto)"
                  value={note}
                />
                <Button size="sm" type="submit">
                  Adicionar
                </Button>
              </form>
            )}
            {error ? <p className="text-destructive">{error}</p> : null}
          </section>
          {locked ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-3">
              <span>
                Aprovado: {row.approvedHours} h · {eur(row.approvedGross ?? 0)}
              </span>
              <Button
                onClick={() => reopen({ userId: row.id, month })}
                size="sm"
                variant="outline"
              >
                Reabrir
              </Button>
            </div>
          ) : (
            <Button
              onClick={() =>
                approve({
                  userId: row.id,
                  month,
                  hours: p.hours,
                  gross: p.gross,
                })
              }
            >
              Aprovar {p.hours} h · {eur(p.gross)}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */

export function SettingsSheet({
  settings,
  onClose,
}: {
  settings: Settings;
  onClose: () => void;
}) {
  const save = useMutation(api.payroll.saveSettings);
  const [f, setF] = useState({
    employerName: settings.employerName,
    regNo: settings.regNo,
    employerAddress: settings.employerAddress,
    signatory: settings.signatory,
    signatoryTitle: settings.signatoryTitle,
    weeklyHours: String(settings.weeklyHours),
    overtime: String(settings.overtime),
    sunday: String(settings.sunday),
    holiday: String(settings.holiday),
    probationMonths: String(settings.probationMonths),
  });
  const [status, setStatus] = useState<string | null>(null);
  const num = (s: string) => Number(s.replace(",", "."));
  const field = (k: keyof typeof f, label: string, numeric = false) => (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={`hrs-${k}`}>
      {label}
      <Input
        id={`hrs-${k}`}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        value={f[k]}
      />
    </label>
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Salvando…");
    try {
      await save({
        employerName: f.employerName,
        regNo: f.regNo,
        employerAddress: f.employerAddress,
        signatory: f.signatory,
        signatoryTitle: f.signatoryTitle,
        weeklyHours: num(f.weeklyHours),
        overtime: num(f.overtime),
        sunday: num(f.sunday),
        holiday: num(f.holiday),
        probationMonths: num(f.probationMonths),
      });
      setStatus("Salvo.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Configurações do RH</SheetTitle>
          <SheetDescription>
            Empresa nos contratos e regras de pagamento
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-5" onSubmit={submit}>
          <p className="font-semibold text-sm">Empregador</p>
          {field("employerName", "Razão social")}
          {field("regNo", "Nº de registro (MBR)")}
          {field("employerAddress", "Sede")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("signatory", "Quem assina pela empresa")}
            {field("signatoryTitle", "Cargo (ex.: Director)")}
          </div>
          <p className="font-semibold text-sm">Pagamento e contrato</p>
          <div className="grid grid-cols-2 gap-3">
            {field("weeklyHours", "Horas normais por semana", true)}
            {field("probationMonths", "Experiência (meses)", true)}
            {field("overtime", "Hora extra ×", true)}
            {field("sunday", "Domingo ×", true)}
            {field("holiday", "Feriado ×", true)}
          </div>
          <p className="text-muted-foreground text-xs">
            1 = sem adicional. Confirme com o contador o que vale para a sua
            categoria (Wage Regulation Order de hotelaria, S.L. 452.19).
          </p>
          <div className="flex items-center gap-3">
            <Button type="submit">Salvar</Button>
            {status ? (
              <span className="text-muted-foreground text-sm">{status}</span>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
