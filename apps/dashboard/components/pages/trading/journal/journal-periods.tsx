"use client";

import { useMemo, useState } from "react";
import {
  dailySeries,
  type GroupRow,
  groupBy,
  MONTH_NAMES,
  monthlyReturns,
  periodKey,
  periodLabel,
  type TimeZoneId,
} from "@/lib/journal/analytics";
import type { Trade } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import {
  type BarMode,
  Empty,
  GroupTable,
  Panel,
  PnlCurve,
  pct,
  Segmented,
  Stat,
  WinLossBars,
} from "./journal-kit";
import { money, tone } from "./journal-summary";

/** Períodos: day / week / month / year results and the monthly returns grid. */

type Granularity = "day" | "week" | "month" | "year";

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Diário" },
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensal" },
  { id: "year", label: "Anual" },
];

const NOUN: Record<Granularity, string> = {
  day: "dias",
  week: "semanas",
  month: "meses",
  year: "anos",
};

const SINGULAR: Record<Granularity, string> = {
  day: "dia",
  week: "semana",
  month: "mês",
  year: "ano",
};

/** Bucket key → a date inside it ("2026" → mid-year, "2026-10" → mid-month). */
function keyDate(key: string) {
  if (key.length === 4) {
    return new Date(`${key}-07-01T12:00:00`);
  }
  return new Date(`${key.length === 7 ? `${key}-15` : key}T12:00:00`);
}

const MODES: { id: BarMode; label: string }[] = [
  { id: "money", label: "Valor" },
  { id: "count", label: "Quantidade" },
];

/** Max buckets on the bar chart (most recent kept). */
const MAX_BARS = 31;

const labelOf = (g: Granularity) => (key: string) =>
  g === "week" ? `sem ${periodLabel(key)}` : periodLabel(key);

function cellStyle(v: number | null, max: number) {
  if (v === null || v === 0) {
    return;
  }
  const alpha = Math.round(15 + (Math.abs(v) / max) * 55);
  const color = v > 0 ? "var(--up)" : "var(--down)";
  return {
    backgroundColor: `color-mix(in oklab, ${color} ${alpha}%, transparent)`,
  };
}

function MonthlyGrid({ trades, tz }: { trades: Trade[]; tz: TimeZoneId }) {
  const rows = useMemo(() => monthlyReturns(trades, tz), [trades, tz]);
  if (rows.length === 0) {
    return <Empty>Sem meses com operações fechadas.</Empty>;
  }
  const max = Math.max(
    1,
    ...rows.flatMap((r) => r.months.map((m) => Math.abs(m ?? 0)))
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium">Ano</th>
            {MONTH_NAMES.map((m) => (
              <th className="font-medium capitalize" key={m}>
                {m}
              </th>
            ))}
            <th className="text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="font-semibold">{r.year}</td>
              {r.months.map((m, i) => (
                <td
                  className={cn(
                    "rounded-md px-1 py-2 text-center",
                    m === null && "text-muted-foreground/40"
                  )}
                  key={MONTH_NAMES[i]}
                  style={cellStyle(m, max)}
                  title={m === null ? undefined : money(m, true)}
                >
                  {m === null ? "·" : money(m, true)}
                </td>
              ))}
              <td className={cn("text-right font-semibold", tone(r.total))}>
                {money(r.total, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodStats({ rows, g }: { rows: GroupRow[]; g: Granularity }) {
  const n = rows.length || 1;
  const green = rows.filter((r) => r.net > 0).length;
  const sorted = [...rows].sort((a, b) => b.net - a.net);
  const best = sorted[0];
  const worst = sorted.at(-1);
  const avg = rows.reduce((a, r) => a + r.net, 0) / n;
  const label = labelOf(g);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        hint={`${green} de ${rows.length} ${NOUN[g]}`}
        label="Períodos positivos"
        value={pct(green / n)}
      />
      <Stat
        className={tone(avg)}
        hint={`por ${SINGULAR[g]}`}
        label="Média"
        value={money(avg, true)}
      />
      <Stat
        className={tone(best?.net ?? 0)}
        hint={best ? label(best.key) : undefined}
        label="Melhor"
        value={best ? money(best.net, true) : "—"}
      />
      <Stat
        className={tone(worst?.net ?? 0)}
        hint={worst ? label(worst.key) : undefined}
        label="Pior"
        value={worst ? money(worst.net, true) : "—"}
      />
    </div>
  );
}

export function JournalPeriods({
  trades,
  tz,
}: {
  trades: Trade[];
  tz: TimeZoneId;
}) {
  const [g, setG] = useState<Granularity>("day");
  const [mode, setMode] = useState<BarMode>("money");
  const rows = useMemo(
    () =>
      groupBy(trades, (t) => periodKey(t.closeTime ?? t.openTime, g, tz), {
        labelOf: labelOf(g),
      }).sort((a, b) => a.key.localeCompare(b.key)),
    [trades, g, tz]
  );
  const daily = useMemo(() => dailySeries(trades, tz), [trades, tz]);
  const curve = useMemo(() => {
    if (g === "day") {
      return daily;
    }
    return rows.map((r) => ({
      date: keyDate(r.key),
      pnl: r.net,
    }));
  }, [g, rows, daily]);
  if (rows.length === 0) {
    return <Empty>Sem operações fechadas neste filtro.</Empty>;
  }
  const recent = rows.slice(-MAX_BARS);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Agrupar por"
          onChange={setG}
          options={GRANULARITIES}
          value={g}
        />
        <Segmented
          label="Barras"
          onChange={setMode}
          options={MODES}
          value={mode}
        />
      </div>
      <PeriodStats g={g} rows={rows} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description={`Resultado líquido por ${SINGULAR[g]}: kraft no lucro, manilla no prejuízo.`}
          title="P&L por período"
        >
          <PnlCurve data={curve} label="Líquido" />
        </Panel>
        <Panel
          description={
            mode === "money"
              ? "Soma das vencedoras contra a soma das perdedoras."
              : "Operações vencedoras contra perdedoras."
          }
          title={`Ganhos × perdas (últimos ${Math.min(rows.length, MAX_BARS)} ${NOUN[g]})`}
        >
          <WinLossBars mode={mode} rows={recent} />
        </Panel>
      </div>
      <Panel
        description="Retorno líquido de cada mês, ano a ano (intensidade = tamanho do resultado)."
        title="Retornos mensais"
      >
        <MonthlyGrid trades={trades} tz={tz} />
      </Panel>
      <Panel
        description="Clique no cabeçalho para ordenar."
        title={`Tabela ${GRANULARITIES.find((x) => x.id === g)?.label.toLowerCase()}`}
      >
        <GroupTable first="Período" keepOrder rows={[...rows].reverse()} />
      </Panel>
    </div>
  );
}
