"use client";

import {
  Bar,
  BarChart,
  BarXAxis,
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  ProfitLossLine,
  profitLossColor,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveLinear } from "@visx/curve";
import { type ReactNode, useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import type { GroupRow } from "@/lib/journal/analytics";
import { formatDuration } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import { money, tone } from "./journal-summary";

/** Shared pieces of the journal analytics tabs. */

export const UP = "var(--up)";
export const DOWN = "var(--down)";
/** Literal colors for SVG attributes, where CSS variables do not resolve. */
export const UP_HEX = "#26a69a";
export const DOWN_HEX = "#ef5350";
/** Kraft, the brand accent of the charts. */
export const KRAFT = "#D4A27F";
export const PALETTE = [1, 4, 3, 5, 2].map(
  (n) => `var(--ai-chart-${n}, var(--chart-${n}))`
);
export const colorAt = (i: number) =>
  PALETTE[i % PALETTE.length] ?? "var(--chart-1)";

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const ratio = (x: number | null, digits = 2) =>
  x === null ? "∞" : x.toFixed(digits);
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const axisMoney = (n: number) => compact.format(n);

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ChartCard
      action={action}
      className={cn("gap-3 py-4", className)}
      contentClassName="px-4"
      description={description}
      title={title}
    >
      {children}
    </ChartCard>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-32 items-center justify-center rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

export function Stat({
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
    <div className="min-w-0 rounded-xl border bg-background/40 px-3 py-2.5">
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "truncate font-semibold text-base tabular-nums tracking-tight",
          className
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="truncate text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** Segmented control (period granularity, time zone…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex w-fit max-w-full overflow-x-auto rounded-lg border p-0.5"
    >
      {options.map((o) => (
        <button
          aria-pressed={value === o.id}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-xs",
            value === o.id && "bg-muted font-semibold"
          )}
          key={o.id}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Cumulative or daily P&L with green/red segments around zero. */
export function PnlCurve({
  data,
  label,
}: {
  data: { date: Date; pnl: number }[];
  label: string;
}) {
  if (data.length < 2) {
    return <Empty>O gráfico aparece a partir de dois pontos.</Empty>;
  }
  return (
    <LineChart
      aspectRatio="5 / 2"
      data={data}
      margin={{ top: 12, right: 12, bottom: 32, left: 52 }}
    >
      <Grid
        highlightRowStroke="var(--foreground)"
        highlightRowStrokeOpacity={0.35}
        highlightRowValues={[0]}
        horizontal
      />
      <Line
        curve={curveLinear}
        dataKey="pnl"
        fadeEdges={false}
        showHighlight={false}
        stroke="transparent"
        strokeWidth={0}
      />
      <ProfitLossLine dataKey="pnl" />
      <YAxis formatValue={axisMoney} />
      <XAxis />
      <ChartTooltip
        indicatorColor={(p) => profitLossColor((p.pnl as number) ?? 0)}
        rows={(p) => {
          const v = (p.pnl as number) ?? 0;
          return [{ color: profitLossColor(v), label, value: money(v, true) }];
        }}
      />
    </LineChart>
  );
}

/** Underwater curve: distance below the running equity peak. */
export function DrawdownCurve({
  data,
}: {
  data: { date: Date; dd: number }[];
}) {
  if (data.length < 2) {
    return <Empty>Sem drawdown para mostrar ainda.</Empty>;
  }
  return (
    <LineChart
      aspectRatio="4 / 1"
      data={data}
      margin={{ top: 8, right: 12, bottom: 28, left: 52 }}
    >
      <Grid horizontal />
      <Line curve={curveLinear} dataKey="dd" stroke={DOWN} strokeWidth={2} />
      <YAxis formatValue={axisMoney} />
      <XAxis />
      <ChartTooltip
        rows={(p) => [
          {
            color: DOWN,
            label: "Drawdown",
            value: money((p.dd as number) ?? 0, true),
          },
        ]}
      />
    </LineChart>
  );
}

export type BarMode = "money" | "count";

/**
 * Gains vs losses per bucket. Bars cannot go below zero, so losses are drawn
 * as their own (absolute) series next to the gains.
 */
export function WinLossBars({
  rows,
  mode = "money",
  aspect = "5 / 2",
}: {
  rows: GroupRow[];
  mode?: BarMode;
  aspect?: string;
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: r.label,
        up: mode === "money" ? r.grossProfit : r.wins,
        down: mode === "money" ? -r.grossLoss : r.losses,
        net: r.net,
        trades: r.trades,
        winRate: r.winRate,
      })),
    [rows, mode]
  );
  if (!rows.some((r) => r.trades > 0)) {
    return <Empty>Sem operações fechadas neste filtro.</Empty>;
  }
  const isMoney = mode === "money";
  return (
    <BarChart
      aspectRatio={aspect}
      barGap={0.2}
      data={data}
      margin={{ top: 12, right: 8, bottom: 32, left: 8 }}
      xDataKey="label"
    >
      <Grid horizontal />
      <Bar dataKey="up" fill={UP} lineCap={3} />
      <Bar dataKey="down" fill={DOWN} lineCap={3} />
      <BarXAxis />
      <ChartTooltip
        rows={(p) => [
          {
            color: UP,
            label: isMoney ? "Ganhos" : "Vencedoras",
            value: isMoney ? money(Number(p.up)) : Number(p.up),
          },
          {
            color: DOWN,
            label: isMoney ? "Perdas" : "Perdedoras",
            value: isMoney ? money(-Number(p.down)) : Number(p.down),
          },
          {
            color: "var(--muted-foreground)",
            label: "Líquido",
            value: money(Number(p.net), true),
          },
          {
            color: "var(--muted-foreground)",
            label: "Acerto",
            value: `${pct(Number(p.winRate))} de ${p.trades}`,
          },
        ]}
        showCrosshair={false}
      />
    </BarChart>
  );
}

type SortKey =
  | "label"
  | "trades"
  | "winRate"
  | "net"
  | "profitFactor"
  | "expectancy"
  | "avgR";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "label", label: "" },
  { key: "trades", label: "Ops" },
  { key: "winRate", label: "Acerto" },
  { key: "net", label: "Líquido" },
  { key: "profitFactor", label: "PF" },
  { key: "expectancy", label: "Expect." },
  { key: "avgR", label: "R médio" },
];

const sortValue = (r: GroupRow, k: SortKey) => {
  if (k === "label") {
    return r.label;
  }
  if (k === "profitFactor") {
    return r.profitFactor ?? Number.POSITIVE_INFINITY;
  }
  return r[k] ?? Number.NEGATIVE_INFINITY;
};

function compareRows(a: GroupRow, b: GroupRow, key: SortKey, desc: boolean) {
  const x = sortValue(a, key);
  const y = sortValue(b, key);
  const diff =
    typeof x === "string" || typeof y === "string"
      ? String(x).localeCompare(String(y))
      : x - y;
  return desc ? -diff : diff;
}

function arrow(sort: { key: SortKey; desc: boolean } | null, key: SortKey) {
  if (sort?.key !== key) {
    return "";
  }
  return sort.desc ? " ↓" : " ↑";
}

/** Sortable table with the full statistics of each bucket. */
export function GroupTable({
  rows,
  first,
  keepOrder = false,
}: {
  rows: GroupRow[];
  /** Header of the first column ("Ativo", "Hora"…). */
  first: string;
  /** Buckets with a natural order (hours…) start unsorted. */
  keepOrder?: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(
    keepOrder ? null : { key: "net", desc: true }
  );
  const visible = useMemo(() => {
    const list = rows.filter((r) => r.trades > 0);
    return sort
      ? list.sort((a, b) => compareRows(a, b, sort.key, sort.desc))
      : list;
  }, [rows, sort]);
  if (visible.length === 0) {
    return null;
  }
  const maxAbs = Math.max(...visible.map((r) => Math.abs(r.net)), 1);
  return (
    <div className="-mx-1 max-h-[26rem] overflow-auto">
      <table className="w-full min-w-[560px] text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b text-muted-foreground">
            {COLUMNS.map((c) => (
              <th
                className="px-1 py-1.5 text-right first:text-left"
                key={c.key}
              >
                <button
                  className="font-medium hover:text-foreground"
                  onClick={() =>
                    setSort((s) => ({
                      key: c.key,
                      desc: s?.key === c.key ? !s.desc : c.key !== "label",
                    }))
                  }
                  type="button"
                >
                  {c.label || first}
                  {arrow(sort, c.key)}
                </button>
              </th>
            ))}
            <th className="px-1 py-1.5 text-right font-medium">Ganho méd.</th>
            <th className="px-1 py-1.5 text-right font-medium">Perda méd.</th>
            <th className="px-1 py-1.5 text-right font-medium">Tempo méd.</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr className="border-b last:border-0" key={r.key}>
              <td className="max-w-40 truncate px-1 py-1.5 font-medium">
                {r.label}
              </td>
              <td className="px-1 py-1.5 text-right">{r.trades}</td>
              <td className="px-1 py-1.5 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-muted sm:block">
                    <span
                      className="block h-full rounded-full bg-[var(--up)]"
                      style={{ width: pct(r.winRate) }}
                    />
                  </span>
                  {pct(r.winRate)}
                </span>
              </td>
              <td
                className={cn("relative px-1 py-1.5 text-right", tone(r.net))}
              >
                <span
                  className={cn(
                    "absolute inset-y-1 right-0 rounded-sm opacity-15",
                    r.net >= 0 ? "bg-[var(--up)]" : "bg-[var(--down)]"
                  )}
                  style={{ width: `${(Math.abs(r.net) / maxAbs) * 100}%` }}
                />
                <span className="relative">{money(r.net, true)}</span>
              </td>
              <td className="px-1 py-1.5 text-right">
                {ratio(r.profitFactor)}
              </td>
              <td className={cn("px-1 py-1.5 text-right", tone(r.expectancy))}>
                {money(r.expectancy, true)}
              </td>
              <td className="px-1 py-1.5 text-right">
                {r.avgR === null ? "—" : `${r.avgR.toFixed(2)}R`}
              </td>
              <td className="px-1 py-1.5 text-right text-[var(--up)]">
                {money(r.avgWin)}
              </td>
              <td className="px-1 py-1.5 text-right text-[var(--down)]">
                {money(r.avgLoss)}
              </td>
              <td className="px-1 py-1.5 text-right text-muted-foreground">
                {formatDuration(r.avgHoldMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
