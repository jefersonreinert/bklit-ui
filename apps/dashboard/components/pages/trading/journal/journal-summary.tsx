"use client";

import {
  Area,
  AreaChart,
  ChartTooltip,
  Grid,
  LinearGradient,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { useId, useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { appLocale } from "@/lib/i18n/locale";
import {
  type Bucket,
  dayKey,
  formatDuration,
  type Stats,
} from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";

/** Journal overview: KPIs, equity curve, P&L calendar and breakdowns. */

export const money = (n: number, signed = false) => {
  const text = Math.abs(n).toLocaleString(appLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) {
    return n < 0 ? `-${text}` : text;
  }
  if (n > 0) {
    return `+${text}`;
  }
  return n < 0 ? `-${text}` : text;
};

export const tone = (n: number) => {
  if (n > 0) {
    return "text-[var(--up)]";
  }
  return n < 0 ? "text-[var(--down)]" : "";
};

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;
const ratio = (x: number | null) => (x === null ? "∞" : x.toFixed(2));

function Kpi({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("font-semibold text-lg tabular-nums", className)}>
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

const compact = new Intl.NumberFormat(appLocale(), {
  notation: "compact",
  maximumFractionDigits: 1,
});
const axisMoney = (n: number) => compact.format(n);

const shortDate = new Intl.DateTimeFormat(appLocale(), {
  day: "2-digit",
  month: "short",
});

/** Cumulative net after each closed trade, with the running drawdown. */
function EquityCurve({ points }: { points: Stats["equity"] }) {
  const gid = useId().replace(/:/g, "");
  const data = useMemo(() => {
    let peak = 0;
    return points.map((p) => {
      peak = Math.max(peak, p.value);
      return { date: new Date(p.time), pnl: p.value, dd: p.value - peak };
    });
  }, [points]);
  if (data.length < 2) {
    return (
      <p className="flex h-40 items-center justify-center rounded-xl border text-muted-foreground text-sm">
        A curva aparece a partir de duas operações fechadas.
      </p>
    );
  }
  const last = data.at(-1)?.pnl ?? 0;
  const high = Math.max(...data.map((d) => d.pnl));
  const deepest = Math.min(...data.map((d) => d.dd));
  return (
    <ChartCard
      action={
        <span className={cn("font-semibold text-sm tabular-nums", tone(last))}>
          {money(last, true)}
        </span>
      }
      className="gap-3 py-4"
      contentClassName="px-4"
      description={`Topo ${money(high, true)} · maior queda ${money(deepest, true)} · ${data.length} operações fechadas`}
      title="Curva de capital"
    >
      <AreaChart
        aspectRatio="2 / 1"
        data={data}
        margin={{ top: 12, right: 12, bottom: 32, left: 52 }}
      >
        <LinearGradient
          from="var(--up)"
          fromOpacity={0.35}
          id={gid}
          to="var(--up)"
          toOpacity={0}
        />
        <Grid
          highlightRowStroke="var(--foreground)"
          highlightRowStrokeOpacity={0.3}
          highlightRowValues={[0]}
          horizontal
        />
        <Area
          curve={curveMonotoneX}
          dataKey="pnl"
          fill={`url(#${gid})`}
          fillOpacity={1}
          stroke="var(--up)"
          strokeWidth={2}
        />
        <YAxis formatValue={axisMoney} />
        <XAxis />
        <ChartTooltip
          rows={(p) => [
            {
              color: "var(--up)",
              label: "Acumulado",
              value: money(Number(p.pnl), true),
            },
            {
              color: "var(--down)",
              label: "Abaixo do topo",
              value: money(Number(p.dd), true),
            },
            {
              color: "var(--muted-foreground)",
              label: "Data",
              value: shortDate.format(p.date as Date),
            },
          ]}
        />
      </AreaChart>
    </ChartCard>
  );
}

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

function Calendar({ daily }: { daily: Stats["daily"] }) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: month.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const monthNet = Object.entries(daily)
    .filter(([k]) => k.startsWith(dayKey(month.getTime()).slice(0, 7)))
    .reduce((a, [, d]) => a + d.net, 0);
  return (
    <div className="flex flex-col gap-2 border p-3">
      <div className="flex items-center justify-between">
        <button
          aria-label="Mês anterior"
          className="px-2 hover:bg-muted"
          onClick={() => setOffset((o) => o - 1)}
          type="button"
        >
          ‹
        </button>
        <p className="font-medium text-sm capitalize">
          {month.toLocaleDateString(appLocale(), {
            month: "long",
            year: "numeric",
          })}
          <span className={cn("ml-2 tabular-nums", tone(monthNet))}>
            {money(monthNet, true)}
          </span>
        </p>
        <button
          aria-label="Mês seguinte"
          className="px-2 hover:bg-muted"
          disabled={offset >= 0}
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          type="button"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {WEEK.map((d, i) => (
          <span className="text-muted-foreground" key={i}>
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <span key={`b${i}`} />;
          }
          const key = dayKey(
            new Date(month.getFullYear(), month.getMonth(), day).getTime()
          );
          const d = daily[key];
          return (
            <span
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-none border tabular-nums",
                d && d.net > 0 && "border-[var(--up)]/40 bg-[var(--up)]/15",
                d && d.net < 0 && "border-[var(--down)]/40 bg-[var(--down)]/15"
              )}
              key={key}
              title={
                d ? `${d.trades} operações · ${money(d.net, true)}` : undefined
              }
            >
              <span className="text-muted-foreground">{day}</span>
              {d ? (
                <span className={cn("font-medium text-[10px]", tone(d.net))}>
                  {Math.abs(d.net) >= 1000
                    ? `${(d.net / 1000).toFixed(1)}k`
                    : Math.round(d.net)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const shown = rows.filter((r) => r.trades > 0);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-3">
      <p className="font-medium text-sm">{title}</p>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-xs">Sem dados.</p>
      ) : null}
      {shown.map((r) => (
        <div
          className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-2 text-xs"
          key={r.key}
        >
          <span className="truncate">{r.key}</span>
          <span className="h-2 overflow-hidden rounded-none bg-muted">
            <span
              className="block h-full rounded-none"
              style={{
                width: `${(Math.abs(r.net) / max) * 100}%`,
                background: r.net >= 0 ? "var(--up)" : "var(--down)",
              }}
            />
          </span>
          <span className={cn("text-right tabular-nums", tone(r.net))}>
            {money(r.net, true)}
            <span className="ml-1 text-muted-foreground">
              {Math.round((r.wins / r.trades) * 100)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function JournalSummary({
  stats,
  open,
  currency,
}: {
  stats: Stats;
  open: number;
  currency: string;
}) {
  const sides = useMemo(
    () => [
      { ...stats.long, key: "Compra" },
      { ...stats.short, key: "Venda" },
    ],
    [stats]
  );
  const c = currency ? ` ${currency}` : "";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          className={tone(stats.net)}
          hint={`${stats.trades} fechadas${open ? ` · ${open} abertas` : ""}`}
          label="Resultado líquido"
          value={`${money(stats.net, true)}${c}`}
        />
        <Kpi
          hint={`${stats.wins} ganhos · ${stats.losses} perdas`}
          label="Taxa de acerto"
          value={pctText(stats.winRate)}
        />
        <Kpi
          hint="lucro bruto ÷ perda bruta"
          label="Profit factor"
          value={ratio(stats.profitFactor)}
        />
        <Kpi
          className={tone(stats.expectancy)}
          hint="média por operação"
          label="Expectativa"
          value={money(stats.expectancy, true)}
        />
        <Kpi
          className="text-[var(--up)]"
          label="Ganho médio"
          value={money(stats.avgWin)}
        />
        <Kpi
          className="text-[var(--down)]"
          label="Perda média"
          value={money(stats.avgLoss)}
        />
        <Kpi
          hint="ganho médio ÷ perda média"
          label="Payoff"
          value={ratio(stats.payoff)}
        />
        <Kpi
          className="text-[var(--down)]"
          hint="maior queda do acumulado"
          label="Drawdown máx."
          value={money(-stats.maxDrawdown)}
        />
        <Kpi
          hint="com SL definido na entrada"
          label="R médio"
          value={stats.avgR === null ? "—" : `${stats.avgR.toFixed(2)}R`}
        />
        <Kpi label="Duração média" value={formatDuration(stats.avgHoldMs)} />
        <Kpi
          hint={`pior ${money(stats.worst)}`}
          label="Melhor operação"
          value={money(stats.best, true)}
        />
        <Kpi
          hint={"comissões, swap e taxas"}
          label="Custos"
          value={money(stats.costs)}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Sequências: {stats.maxWinStreak} ganhos seguidos · {stats.maxLossStreak}{" "}
        perdas seguidas.
      </p>
      <EquityCurve points={stats.equity} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Calendar daily={stats.daily} />
        <Bars rows={stats.bySymbol.slice(0, 12)} title="Por ativo" />
        <Bars rows={sides} title="Compra × venda" />
        <Bars rows={stats.byWeekday} title="Por dia da semana" />
        <Bars rows={stats.byHour} title="Por hora de entrada" />
      </div>
    </div>
  );
}
