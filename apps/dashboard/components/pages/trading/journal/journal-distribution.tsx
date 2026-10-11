"use client";

import {
  Bar,
  BarChart,
  BarXAxis,
  ChartTooltip,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendValue,
  PieCenter,
  PieChart,
  PieSlice,
} from "@bklitui/ui/charts";
import { useMemo, useState } from "react";
import { pnlHistogram, rHistogram } from "@/lib/journal/analytics";
import type { Stats, Trade } from "@/lib/journal/metrics";
import { colorAt, DOWN, Empty, Panel, Stat, UP } from "./journal-kit";
import { money } from "./journal-summary";

/** Distribuição: R and P&L histograms, the result streak and costs. */

const LAST = 120;

function Histogram({
  data,
  unit,
}: {
  data: { key: string; wins: number; losses: number }[];
  unit: string;
}) {
  if (!data.some((d) => d.wins + d.losses > 0)) {
    return <Empty>Sem dados suficientes.</Empty>;
  }
  return (
    <BarChart
      aspectRatio="5 / 2"
      barGap={0.15}
      data={data}
      margin={{ top: 12, right: 8, bottom: 32, left: 8 }}
      stacked
      xDataKey="key"
    >
      <Grid horizontal />
      <Bar dataKey="losses" fill={DOWN} lineCap={2} />
      <Bar dataKey="wins" fill={UP} lineCap={2} />
      <BarXAxis />
      <ChartTooltip
        rows={(p) => [
          { color: UP, label: "Vencedoras", value: Number(p.wins) },
          { color: DOWN, label: "Perdedoras", value: Number(p.losses) },
          {
            color: "var(--muted-foreground)",
            label: "Faixa",
            value: `${p.key}${unit}`,
          },
        ]}
        showCrosshair={false}
      />
    </BarChart>
  );
}

/** The last trades as a strip of green/red tiles (oldest → newest). */
function Streak({ trades }: { trades: Trade[] }) {
  const closed = useMemo(
    () =>
      trades
        .filter((t) => t.closeTime !== null)
        .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))
        .slice(-LAST),
    [trades]
  );
  if (closed.length === 0) {
    return <Empty>Sem operações fechadas.</Empty>;
  }
  const max = Math.max(...closed.map((t) => Math.abs(t.net)), 1);
  return (
    <div className="flex flex-wrap gap-1">
      {closed.map((t) => (
        <span
          className="size-5 rounded-[4px]"
          key={t.key}
          style={{
            backgroundColor: t.net >= 0 ? UP : DOWN,
            opacity: 0.35 + (Math.abs(t.net) / max) * 0.65,
          }}
          title={`${t.symbol} · ${new Date(t.closeTime ?? t.openTime).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${money(t.net, true)}`}
        />
      ))}
    </div>
  );
}

export function JournalDistribution({
  trades,
  stats,
}: {
  trades: Trade[];
  stats: Stats;
}) {
  const r = useMemo(() => rHistogram(trades), [trades]);
  const pnl = useMemo(() => pnlHistogram(trades, 14), [trades]);
  const withR = r.reduce((a, b) => a + b.wins + b.losses, 0);
  if (stats.trades === 0) {
    return <Empty>Sem operações fechadas neste filtro.</Empty>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          className="text-[var(--up)]"
          label="Maior sequência de ganhos"
          value={String(stats.maxWinStreak)}
        />
        <Stat
          className="text-[var(--down)]"
          label="Maior sequência de perdas"
          value={String(stats.maxLossStreak)}
        />
        <Stat
          hint={`pior: ${money(stats.worst, true)}`}
          label="Melhor operação"
          value={money(stats.best, true)}
        />
        <Stat
          hint={`${withR} de ${stats.trades} com stop`}
          label="R médio"
          value={stats.avgR === null ? "—" : `${stats.avgR.toFixed(2)}R`}
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Resultado em múltiplos do risco inicial (precisa de stop loss na entrada)."
          title="Distribuição em R"
        >
          <Histogram data={r} unit="" />
        </Panel>
        <Panel
          description="Quantas operações caíram em cada faixa de resultado."
          title="Distribuição do P&L"
        >
          <Histogram data={pnl} unit=" (centro da faixa)" />
        </Panel>
      </div>
      <Panel
        description={`Últimas ${LAST} operações, da mais antiga à mais recente (cor mais forte = resultado maior).`}
        title="Sequência de resultados"
      >
        <Streak trades={trades} />
      </Panel>
      <Panel description="Comissões, swaps e taxas pagos." title="Custos">
        <CostBreakdown trades={trades} />
      </Panel>
    </div>
  );
}

function CostBreakdown({ trades }: { trades: Trade[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const closed = trades.filter((t) => t.closeTime !== null);
    const sum = (k: "commission" | "swap" | "fee") =>
      closed.reduce((a, t) => a + t[k], 0);
    return [
      { label: "Comissão", value: -sum("commission"), color: colorAt(0) },
      { label: "Swap", value: -sum("swap"), color: colorAt(1) },
      { label: "Taxas", value: -sum("fee"), color: colorAt(2) },
    ].filter((d) => d.value > 0);
  }, [trades]);
  if (data.length === 0) {
    return <Empty>Nenhum custo registrado.</Empty>;
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <PieChart
        data={data}
        hoveredIndex={hover}
        innerRadius={52}
        onHoverChange={setHover}
        size={180}
      >
        {data.map((d, i) => (
          <PieSlice index={i} key={d.label} />
        ))}
        <PieCenter
          defaultLabel="Custos"
          formatOptions={{ notation: "compact" }}
        />
      </PieChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={data}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="flex items-center gap-3">
          <LegendMarker />
          <LegendLabel className="flex-1 text-sm" />
          <LegendValue
            className="text-sm"
            formatValue={(v) => money(v)}
            showPercentage
          />
        </LegendItemComponent>
      </Legend>
    </div>
  );
}
