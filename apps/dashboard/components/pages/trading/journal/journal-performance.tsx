"use client";

import {
  ChartTooltip,
  Gauge,
  Grid,
  HeatmapCells,
  HeatmapChart,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { useMemo } from "react";
import {
  activityColumns,
  advanced,
  equitySeries,
  periodLabel,
  type TimeZoneId,
  tradePoints,
  traderScore,
} from "@/lib/journal/analytics";
import { dayKey, formatDuration, type Trade } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import {
  axisMoney,
  DOWN,
  DOWN_HEX,
  DrawdownCurve,
  Empty,
  KRAFT,
  Panel,
  PnlCurve,
  pct,
  ratio,
  Stat,
  UP,
  UP_HEX,
} from "./journal-kit";
import { money, tone } from "./journal-summary";

/** Desempenho: trader score, risk-adjusted ratios, equity and activity. */

const LEVELS = [
  "color-mix(in oklab, var(--muted) 70%, transparent)",
  "rgba(38, 166, 154, 0.3)",
  "rgba(38, 166, 154, 0.5)",
  "rgba(38, 166, 154, 0.75)",
  UP_HEX,
] as const;

function scoreVerdict(total: number) {
  if (total >= 75) {
    return "Excelente";
  }
  if (total >= 55) {
    return "Consistente";
  }
  if (total >= 35) {
    return "Em evolução";
  }
  return "Atenção";
}

function ScorePanel({ trades, tz }: { trades: Trade[]; tz: TimeZoneId }) {
  const score = useMemo(() => traderScore(trades, tz), [trades, tz]);
  const metrics = score.parts.map((p) => ({ key: p.key, label: p.label }));
  const data = [
    {
      label: "Você",
      color: KRAFT,
      values: Object.fromEntries(
        score.parts.map((p) => [p.key, Math.max(4, p.value)])
      ),
    },
  ];
  return (
    <Panel
      description="Seis pilares de 0 a 100: acerto, profit factor, payoff, recuperação, consistência e controle de drawdown."
      title="Nota do trader"
    >
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-full max-w-72">
            <Gauge
              activeFill={KRAFT}
              centerValue={Math.round(score.total)}
              defaultLabel={scoreVerdict(score.total)}
              inactiveFillOpacity={0.35}
              spacing={22}
              value={score.total}
            />
          </div>
          <ul className="grid w-full grid-cols-2 gap-1.5 text-xs">
            {score.parts.map((p) => (
              <li
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1"
                key={p.key}
              >
                <span className="truncate text-muted-foreground">
                  {p.label}
                </span>
                <span className="font-medium tabular-nums">{p.raw}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center">
          <RadarChart data={data} levels={4} metrics={metrics} size={300}>
            <RadarGrid showLabels={false} />
            <RadarAxis />
            <RadarLabels fontSize={11} offset={18} />
            <RadarArea index={0} />
          </RadarChart>
        </div>
      </div>
    </Panel>
  );
}

function RiskGrid({ trades, tz }: { trades: Trade[]; tz: TimeZoneId }) {
  const a = useMemo(() => advanced(trades, tz), [trades, tz]);
  const days = a.tradingDays || 1;
  const kelly = a.kelly === null ? "—" : pct(Math.max(-1, a.kelly), 1);
  return (
    <Panel
      description="Retorno ajustado ao risco, dias de trading, sequências e custos."
      title="Métricas avançadas"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          hint="diário, anualizado √252"
          label="Sharpe"
          value={ratio(a.sharpe)}
        />
        <Stat
          hint="só volatilidade negativa"
          label="Sortino"
          value={ratio(a.sortino)}
        />
        <Stat hint="System Quality Number" label="SQN" value={ratio(a.sqn)} />
        <Stat
          hint="líquido ÷ drawdown máx."
          label="Fator de recuperação"
          value={ratio(a.recoveryFactor)}
        />
        <Stat hint="fração ótima teórica" label="Kelly" value={kelly} />
        <Stat
          hint="por operação"
          label="Desvio padrão"
          value={money(a.stdDev)}
        />
        <Stat
          hint="média em R"
          label="Expectativa R"
          value={a.expectancyR === null ? "—" : `${a.expectancyR.toFixed(2)}R`}
        />
        <Stat
          className={tone(-a.currentDrawdown)}
          hint="abaixo do topo"
          label="Drawdown atual"
          value={money(-a.currentDrawdown, true)}
        />
        <Stat
          hint={`${a.greenDays} verdes · ${a.redDays} vermelhos`}
          label="Dias positivos"
          value={pct(a.greenDays / days)}
        />
        <Stat
          className={tone(a.bestDay?.net ?? 0)}
          hint={a.bestDay ? periodLabel(a.bestDay.key) : undefined}
          label="Melhor dia"
          value={a.bestDay ? money(a.bestDay.net, true) : "—"}
        />
        <Stat
          className={tone(a.worstDay?.net ?? 0)}
          hint={a.worstDay ? periodLabel(a.worstDay.key) : undefined}
          label="Pior dia"
          value={a.worstDay ? money(a.worstDay.net, true) : "—"}
        />
        <Stat
          hint={`${a.maxRedDayStreak} vermelhos seguidos`}
          label="Dias verdes seguidos"
          value={String(a.maxGreenDayStreak)}
        />
        <Stat
          hint={`${a.tradingDays} dias operados`}
          label="Operações por dia"
          value={a.avgTradesPerDay.toFixed(1)}
        />
        <Stat
          hint={`perdedoras: ${formatDuration(a.avgLossHoldMs)}`}
          label="Tempo nas vencedoras"
          value={formatDuration(a.avgWinHoldMs)}
        />
        <Stat
          hint="maior período abaixo do topo"
          label="Tempo em drawdown"
          value={formatDuration(a.maxDrawdownMs)}
        />
        <Stat
          hint={
            a.bestTradeShare === null
              ? "comissão por lote"
              : `melhor trade = ${pct(a.bestTradeShare)} do líquido`
          }
          label="Comissão / lote"
          value={
            a.commissionsPerLot === null ? "—" : money(a.commissionsPerLot)
          }
        />
      </div>
    </Panel>
  );
}

function TradeMap({ trades }: { trades: Trade[] }) {
  const points = useMemo(() => tradePoints(trades), [trades]);
  if (points.length < 2) {
    return <Empty>O mapa aparece a partir de duas operações fechadas.</Empty>;
  }
  return (
    <ScatterChart
      aspectRatio="5 / 2"
      data={points}
      margin={{ top: 12, right: 12, bottom: 32, left: 52 }}
    >
      <Grid horizontal />
      <Scatter
        dataKey="net"
        radius={4}
        yGradient={{ from: DOWN_HEX, to: UP_HEX }}
      />
      <YAxis formatValue={axisMoney} />
      <XAxis />
      <ChartTooltip
        rows={(p) => [
          {
            color: Number(p.net) >= 0 ? UP : DOWN,
            label: String(p.symbol ?? "Resultado"),
            value: money(Number(p.net), true),
          },
        ]}
      />
    </ScatterChart>
  );
}

function Activity({ trades }: { trades: Trade[] }) {
  const columns = useMemo(
    () => activityColumns(trades, 26, Date.now()),
    [trades]
  );
  const byDay = useMemo(() => {
    const m = new Map<string, { n: number; net: number }>();
    for (const t of trades) {
      if (t.closeTime !== null) {
        const k = dayKey(t.closeTime);
        const d = m.get(k) ?? { n: 0, net: 0 };
        d.n += 1;
        d.net += t.net;
        m.set(k, d);
      }
    }
    return m;
  }, [trades]);
  const label = (_count: number, date: Date) => {
    const d = byDay.get(dayKey(date.getTime()));
    if (!d) {
      return "Sem operações";
    }
    return `${d.n} ${d.n === 1 ? "operação" : "operações"} · ${money(d.net, true)}`;
  };
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <HeatmapChart
        className="w-full min-w-[560px]"
        data={columns}
        gap={3}
        layout="fluid"
        levelColors={LEVELS}
        margin={{ top: 24, right: 8, bottom: 8, left: 36 }}
      >
        <HeatmapCells cornerRadius={3} />
        <HeatmapXAxis />
        <HeatmapYAxis labelFormat="initial" tickFilter="odd" />
        <HeatmapTooltip formatLabel={label} />
      </HeatmapChart>
      <HeatmapLegend
        align="end"
        colorScale={(c) =>
          LEVELS[Math.min(4, Math.max(0, c ?? 0))] ?? LEVELS[0]
        }
        gap={3}
        lessLabel="Menos"
        moreLabel="Mais"
      />
    </div>
  );
}

export function JournalPerformance({
  trades,
  tz,
}: {
  trades: Trade[];
  tz: TimeZoneId;
}) {
  const equity = useMemo(() => equitySeries(trades), [trades]);
  const closed = equity.length;
  if (closed === 0) {
    return (
      <Empty>
        Nenhuma operação fechada no filtro. Assim que o EA enviar operações, a
        nota, as métricas e os gráficos aparecem aqui.
      </Empty>
    );
  }
  const last = equity.at(-1)?.pnl ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <ScorePanel trades={trades} tz={tz} />
      <RiskGrid trades={trades} tz={tz} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          action={
            <span
              className={cn("font-semibold text-sm tabular-nums", tone(last))}
            >
              {money(last, true)}
            </span>
          }
          description="Resultado acumulado após cada operação, verde acima de zero."
          title="Curva de capital"
        >
          <div className="flex flex-col gap-2">
            <PnlCurve data={equity} label="Acumulado" />
            <DrawdownCurve data={equity} />
          </div>
        </Panel>
        <Panel
          description="Cada ponto é uma operação: altura = resultado, cor do vermelho ao verde."
          title="Mapa de operações"
        >
          <TradeMap trades={trades} />
        </Panel>
      </div>
      <Panel
        description="Operações fechadas por dia nas últimas 26 semanas."
        title="Calendário de atividade"
      >
        <Activity trades={trades} />
      </Panel>
    </div>
  );
}
