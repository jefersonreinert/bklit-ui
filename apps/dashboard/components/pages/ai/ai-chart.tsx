"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarXAxis,
  BarYAxis,
  ChartTooltip,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendValue,
  Line,
  LinearGradient,
  LineChart,
  PieCenter,
  PieChart,
  PieSlice,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { memo, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartFormat,
  type ChartSpec,
  type KpiItem,
  parseChartSpec,
} from "@/lib/ai-chart-spec";
import { resolveDataset } from "@/lib/ai-datasets";
import { cn } from "@/lib/utils";

const MONTH = /^(\d{4})-(\d{2})$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** Same ramp as the panel pages (black in dark, brown in beige, gray in light). */
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-2)",
];
const color = (i: number) => PALETTE[i % PALETTE.length] ?? "var(--chart-1)";
let gradientSeq = 0;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const plain = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatValue(v: unknown, format: ChartFormat = "number") {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    return "—";
  }
  if (format === "brl") {
    return brl.format(n);
  }
  return format === "percent" ? `${plain.format(n)}%` : plain.format(n);
}

function formatAxis(n: number, format: ChartFormat = "number") {
  if (format === "brl") {
    return brlCompact.format(n);
  }
  return format === "percent" ? `${plain.format(n)}%` : compact.format(n);
}

/** "2026-09" / "2026-09-14" / Date → Date; anything else → null. */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) {
    return v;
  }
  if (typeof v !== "string") {
    return null;
  }
  const month = MONTH.exec(v);
  if (month) {
    return new Date(Number(month[1]), Number(month[2]) - 1, 1);
  }
  if (ISO_DAY.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function Pending() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 font-sans">
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className="size-2 animate-pulse rounded-full bg-[#d97757]" />
        Criando gráfico…
      </p>
      <div className="flex h-32 items-end gap-2">
        {[40, 70, 55, 85, 60, 95, 75].map((h, i) => (
          <span
            className="flex-1 animate-pulse rounded-t-md bg-muted"
            key={h}
            style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function SeriesLegend({ spec }: { spec: ChartSpec }) {
  if ((spec.series?.length ?? 0) < 2) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
      {spec.series?.map((s, i) => (
        <span className="flex items-center gap-1.5" key={s.key}>
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: color(i) }}
          />
          {s.label ?? s.key}
        </span>
      ))}
    </div>
  );
}

const tooltipRows = (spec: ChartSpec) => (point: Record<string, unknown>) =>
  (spec.series ?? []).map((s, i) => ({
    color: color(i),
    label: s.label ?? s.key,
    value: formatValue(point[s.key], spec.format),
  }));

function TimeChart({ spec }: { spec: ChartSpec }) {
  const x = spec.x ?? "date";
  const data = useMemo(
    () => (spec.data ?? []).map((d) => ({ ...d, [x]: toDate(d[x]) })),
    [spec.data, x]
  );
  const margin = { top: 12, right: 12, bottom: 36, left: 56 };
  const series = spec.series ?? [];
  const gid = useMemo(() => `ai-area-${++gradientSeq}`, []);
  const children = (
    <>
      <Grid horizontal />
      <YAxis formatValue={(n) => formatAxis(n, spec.format)} />
      <XAxis />
      <ChartTooltip rows={tooltipRows(spec)} />
    </>
  );
  if (spec.type === "line") {
    return (
      <LineChart aspectRatio="2 / 1" data={data} margin={margin} xDataKey={x}>
        {series.map((s, i) => (
          <Line
            curve={curveMonotoneX}
            dataKey={s.key}
            key={s.key}
            stroke={color(i)}
            strokeWidth={2}
          />
        ))}
        {children}
      </LineChart>
    );
  }
  return (
    <AreaChart aspectRatio="2 / 1" data={data} margin={margin} xDataKey={x}>
      {series.map((s, i) => (
        <LinearGradient
          from={color(i)}
          fromOpacity={0.35}
          id={`${gid}-${i}`}
          key={`g-${s.key}`}
          to={color(i)}
          toOpacity={0}
        />
      ))}
      {series.map((s, i) => (
        <Area
          curve={curveMonotoneX}
          dashArray={i > 0 ? "4 4" : undefined}
          dataKey={s.key}
          fill={`url(#${gid}-${i})`}
          fillOpacity={1}
          key={s.key}
          stroke={color(i)}
          strokeWidth={2}
        />
      ))}
      {children}
    </AreaChart>
  );
}

function BarsChart({ spec }: { spec: ChartSpec }) {
  const horizontal = spec.type === "bar-horizontal";
  const series = spec.series ?? [];
  const longest = Math.max(
    ...(spec.data ?? []).map((d) => String(d[spec.x ?? ""] ?? "").length),
    4
  );
  const rows = spec.data?.length ?? 1;
  const gid = useMemo(() => `ai-bar-${++gradientSeq}`, []);
  const single = series.length === 1;
  return (
    <BarChart
      aspectRatio={
        horizontal
          ? `${Math.max(1.1, 3.4 - rows * 0.22).toFixed(2)} / 1`
          : "2 / 1"
      }
      barGap={0.25}
      data={spec.data ?? []}
      margin={
        horizontal ? { left: Math.min(24 + longest * 6, 140) } : undefined
      }
      orientation={horizontal ? "horizontal" : "vertical"}
      stacked={Boolean(spec.stacked)}
      xDataKey={spec.x ?? "x"}
    >
      {single ? (
        <LinearGradient
          from="var(--chart-1)"
          id={gid}
          to="var(--chart-4)"
          vertical={!horizontal}
        />
      ) : null}
      <Grid
        fadeVertical={horizontal}
        horizontal={!horizontal}
        vertical={horizontal}
      />
      {series.map((s, i) => (
        <Bar
          dataKey={s.key}
          fill={single ? `url(#${gid})` : color(i)}
          key={s.key}
          lineCap={4}
        />
      ))}
      {horizontal ? <BarYAxis /> : <BarXAxis />}
      <ChartTooltip rows={tooltipRows(spec)} showCrosshair={false} />
    </BarChart>
  );
}

function PieBlock({ spec }: { spec: ChartSpec }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = (spec.slices ?? []).map((s, i) => ({
    label: s.label,
    value: Number(s.value) || 0,
    color: color(i),
  }));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <PieChart
        data={data}
        hoveredIndex={hover}
        innerRadius={spec.type === "donut" ? 58 : 0}
        onHoverChange={setHover}
        size={200}
      >
        {data.map((d, i) => (
          <PieSlice index={i} key={d.label} />
        ))}
        {spec.type === "donut" ? (
          <PieCenter
            defaultLabel="Total"
            formatOptions={
              spec.format === "brl" ? { notation: "compact" } : undefined
            }
            prefix={spec.format === "brl" ? "R$ " : undefined}
          />
        ) : null}
      </PieChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={data.map((d) => ({
          label: d.label,
          value: d.value,
          color: d.color,
        }))}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="flex items-center gap-3">
          <LegendMarker />
          <LegendLabel className="flex-1 text-sm" />
          <LegendValue
            className="text-sm"
            formatValue={(v) => formatValue(v, spec.format)}
            showPercentage
          />
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

function KpiTiles({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((k) => (
        <div
          className="rounded-xl border bg-background/40 px-3 py-2.5"
          key={k.label}
        >
          <p className="truncate text-muted-foreground text-xs">{k.label}</p>
          <p className="font-semibold text-lg tabular-nums tracking-tight">
            {formatValue(k.value, k.format)}
          </p>
          {typeof k.delta === "number" ? (
            <p
              className={cn(
                "text-xs tabular-nums",
                k.delta >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {k.delta >= 0 ? "▲" : "▼"} {plain.format(Math.abs(k.delta))}%
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChartBody({ spec }: { spec: ChartSpec }) {
  if (spec.type === "kpi") {
    return <KpiTiles items={spec.items ?? []} />;
  }
  if (spec.type === "pie" || spec.type === "donut") {
    return <PieBlock spec={spec} />;
  }
  const isTime =
    (spec.type === "area" || spec.type === "line") &&
    (spec.data ?? []).every((d) => toDate(d[spec.x ?? "date"]) !== null);
  // Categories on a time chart would break the axis: draw bars instead
  return isTime ? (
    <TimeChart spec={spec} />
  ) : (
    <BarsChart
      spec={{
        ...spec,
        type: spec.type === "bar-horizontal" ? spec.type : "bar",
      }}
    />
  );
}

/** A ```chart block from an assistant reply (memoized: re-renders only on change). */
export const AiChart = memo(function AiChart({
  source,
  complete,
}: {
  source: string;
  complete: boolean;
}) {
  const result = useMemo(() => {
    if (!complete) {
      return null;
    }
    const parsed = parseChartSpec(source.trim());
    if (typeof parsed === "string" || !parsed.dataset) {
      return parsed;
    }
    const resolved = resolveDataset(parsed);
    return typeof resolved === "string"
      ? resolved
      : parseChartSpec(JSON.stringify(resolved));
  }, [source, complete]);

  if (!complete) {
    return <Pending />;
  }
  if (typeof result === "string" || !result) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-2 text-muted-foreground text-xs">
        {result ?? "Gráfico indisponível."}
      </p>
    );
  }
  return (
    <figure className="m-0 font-sans">
      <Card className="min-w-0 gap-3">
        {result.title || result.description ? (
          <CardHeader>
            {result.title ? <CardTitle>{result.title}</CardTitle> : null}
            {result.description ? (
              <CardDescription>{result.description}</CardDescription>
            ) : null}
          </CardHeader>
        ) : null}
        <CardContent className="flex min-w-0 flex-col gap-3">
          <ChartBody spec={result} />
          <SeriesLegend spec={result} />
        </CardContent>
      </Card>
    </figure>
  );
});
