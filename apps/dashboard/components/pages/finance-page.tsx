"use client";

import { Icon } from "@bklitui/icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarXAxis,
  BarYAxis,
  buildProjectionPath,
  Candlestick,
  CandlestickChart,
  ChartTooltip,
  FunnelChart,
  Gauge,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  Line,
  LinearGradient,
  LineChart,
  LineSeriesTerminalMarker,
  PieCenter,
  PieChart,
  PieSlice,
  ProfitLossLegendHoverProvider,
  ProfitLossLine,
  ProjectionLine,
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
  ReferenceArea,
  Ring,
  RingCenter,
  RingChart,
  SankeyChart,
  SankeyLink,
  SankeyNode,
  SankeyTooltip,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveLinear, curveMonotoneX } from "@visx/curve";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MetricBar, MetricTile } from "@/components/dashboard/metric-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { beefPrice } from "@/lib/data";
import {
  type BillStatus,
  bills,
  budgetLines,
  budgetRing,
  cashBalanceSeries,
  cashFlowSankey,
  dreFunnel,
  dreRows,
  expenseBreakdown,
  type FinancePeriod,
  fundamentalIndicators,
  healthMetrics,
  healthScores,
  ledger,
  minimumReserve,
  netIncomeSeries,
  periodLabels,
  receivablesAging,
  receivablesByChannel,
  revenueVsExpenses,
  sparkSeries,
  summarize,
  weeklyCashForecast,
} from "@/lib/finance-data";
import {
  brlFormatOptions,
  formatBRL,
  formatCompact,
  formatDate,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const billVariant: Record<
  BillStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  Pago: "outline",
  Agendado: "secondary",
  Pendente: "default",
  Atrasado: "destructive",
};

const unitItems = [
  { value: "matriz", label: "Casa Brasa — Matriz" },
  { value: "todas", label: "Todas as unidades" },
];

const kFormat = (v: number) => `${formatCompact(v / 1000)}k`;

const cashProjection = buildProjectionPath({
  sourceData: cashBalanceSeries,
  seriesKey: "caixa",
  mode: "auto",
  autoMethod: "lastSegment",
  pathDensity: "endpoints",
  horizonPoints: 3,
});

function delinquencyTone(value: number) {
  if (value < 3) {
    return "good";
  }
  return value < 6 ? "warn" : "bad";
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <h3 className="font-semibold text-base tracking-tight">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function FinancePage() {
  const [period, setPeriod] = useState<FinancePeriod>("mes");
  const [expenseHover, setExpenseHover] = useState<number | null>(null);
  const [budgetHover, setBudgetHover] = useState<number | null>(null);
  const [healthHover, setHealthHover] = useState<number | null>(null);
  const [funnelHover, setFunnelHover] = useState<number | null>(null);

  const s = useMemo(() => summarize(period), [period]);
  const ind = useMemo(() => fundamentalIndicators(), []);
  const funnel = useMemo(() => dreFunnel(period), [period]);
  const dre = useMemo(() => dreRows(period), [period]);
  const expenses = useMemo(() => expenseBreakdown(period), [period]);
  const sankey = useMemo(() => cashFlowSankey(period), [period]);
  const spark = sparkSeries.slice(period === "ano" ? 0 : -6);

  const payables = bills.filter((b) => b.kind === "pagar");
  const receivables = bills.filter((b) => b.kind === "receber");
  const overdue = bills.filter((b) => b.status === "Atrasado");
  const overBudget = budgetLines.filter((b) => b.value > b.maxValue);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Cabeçalho -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Painel financeiro
          </h2>
          <p className="text-muted-foreground text-sm">
            Resultado, rentabilidade, caixa e indicadores fundamentais do
            negócio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            onValueChange={(v) => setPeriod(v as FinancePeriod)}
            value={period}
          >
            <TabsList>
              {(Object.keys(periodLabels) as FinancePeriod[]).map((p) => (
                <TabsTrigger key={p} value={p}>
                  {periodLabels[p]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select defaultValue="matriz" items={unitItems}>
            <SelectTrigger className="w-48" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {unitItems.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Icon className="size-4" name="IconFileDownload" />
            Relatório
          </Button>
        </div>
      </div>

      {overdue.length > 0 ? (
        <Alert>
          <Icon className="size-4" name="IconWarningSign" />
          <AlertTitle>
            {overdue.length} contas em atraso somando{" "}
            {formatBRL(overdue.reduce((a, b) => a + b.amount, 0))}
          </AlertTitle>
          <AlertDescription>
            {overdue.map((b) => `${b.description} (${b.supplier})`).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPIs principais ------------------------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dataKey="netRevenue"
          formatOptions={brlFormatOptions}
          icon="IconCoins"
          label={`Receita líquida · ${periodLabels[period]}`}
          series={spark}
          title="Receita líquida"
          trend={s.trends.netRevenue}
          value={s.netRevenue}
        />
        <KpiCard
          color="var(--kpi-2)"
          dataKey="netIncome"
          formatOptions={brlFormatOptions}
          icon="IconPiggyBankCoin"
          label={`Margem líquida ${formatPercent(s.netMargin)}`}
          series={spark}
          title="Lucro líquido"
          trend={s.trends.netIncome}
          value={s.netIncome}
        />
        <KpiCard
          color="var(--kpi-3)"
          dataKey="ebitdaMargin"
          formatOptions={{ maximumFractionDigits: 1 }}
          icon="IconChart3"
          label={`EBITDA ${formatBRL(s.ebitda)}`}
          series={spark}
          suffix="%"
          title="Margem EBITDA"
          trend={s.trends.ebitdaMargin}
          value={Math.round(s.ebitdaMargin * 10) / 10}
        />
        <KpiCard
          color="var(--kpi-4)"
          dataKey="cashBalance"
          formatOptions={brlFormatOptions}
          icon="IconMoneybag"
          label={`Cobre ${ind.runwayMonths.toFixed(1).replace(".", ",")} mês(es) de custos`}
          series={spark}
          title="Saldo em caixa"
          trend={s.trends.cash}
          value={s.cashBalance}
        />
      </section>

      {/* Indicadores fundamentais --------------------------------------- */}
      <SectionTitle
        description="Liquidez, rentabilidade, endividamento e ciclo financeiro com referência de mercado."
        title="Indicadores fundamentais"
      />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          hint="Ativo ÷ passivo circulante · ideal > 1,5"
          icon="IconDrop"
          label="Liquidez corrente"
          tone={ind.currentRatio >= 1.5 ? "good" : "warn"}
          value={`${ind.currentRatio.toFixed(2).replace(".", ",")}x`}
        />
        <MetricTile
          hint="Sem estoques · ideal > 1,0"
          icon="IconLightning"
          label="Liquidez seca"
          tone={ind.quickRatio >= 1 ? "good" : "warn"}
          value={`${ind.quickRatio.toFixed(2).replace(".", ",")}x`}
        />
        <MetricTile
          hint="Dívida ÷ patrimônio · ideal < 50%"
          icon="IconCreditCard1"
          label="Endividamento"
          tone={ind.debtToEquity < 50 ? "good" : "bad"}
          value={formatPercent(ind.debtToEquity)}
        >
          <MetricBar value={ind.debtToEquity} />
        </MetricTile>
        <MetricTile
          hint="Lucro 12m ÷ capital investido"
          icon="IconChartCompare"
          label="ROI anual"
          tone={ind.roi >= 15 ? "good" : "warn"}
          value={formatPercent(ind.roi)}
        />
        <MetricTile
          hint="Lucro 12m ÷ patrimônio líquido"
          icon="IconLineChart2"
          label="ROE"
          tone={ind.roe >= 15 ? "good" : "warn"}
          value={formatPercent(ind.roe)}
        />
        <MetricTile
          hint="Ativo − passivo circulante"
          icon="IconWallet1"
          label="Capital de giro"
          tone="good"
          value={formatBRL(ind.workingCapital)}
        />
        <MetricTile
          hint={`PMR ${ind.pmr}d + PME ${ind.pme}d − PMP ${ind.pmp}d`}
          icon="IconArrowsRepeatCircle"
          label="Ciclo de caixa"
          tone={ind.cashCycle <= 0 ? "good" : "warn"}
          value={`${ind.cashCycle} dias`}
        />
        <MetricTile
          hint="Receber em média"
          icon="IconCalendarClock"
          label="Prazo médio receb."
          tone="good"
          value={`${ind.pmr} dias`}
        />
        <MetricTile
          hint="Pagar em média"
          icon="IconCalendarCheck"
          label="Prazo médio pagto."
          tone="good"
          value={`${ind.pmp} dias`}
        />
        <MetricTile
          hint="Vencidos ÷ total a receber · ideal < 3%"
          icon="IconClockAlert"
          label="Inadimplência"
          tone={delinquencyTone(ind.delinquency)}
          value={formatPercent(ind.delinquency)}
        >
          <MetricBar max={10} value={ind.delinquency} />
        </MetricTile>
        <MetricTile
          hint="CMV ÷ receita líquida · ideal 28–35%"
          icon="IconForkKnife"
          label="CMV"
          tone={s.cmvRatio <= 35 ? "good" : "warn"}
          value={formatPercent(s.cmvRatio)}
        >
          <MetricBar max={50} value={s.cmvRatio} />
        </MetricTile>
        <MetricTile
          hint="Lucro bruto ÷ receita líquida"
          icon="IconPieChart2"
          label="Margem bruta"
          tone={s.grossMargin >= 60 ? "good" : "warn"}
          value={formatPercent(s.grossMargin)}
        >
          <MetricBar value={s.grossMargin} />
        </MetricTile>
      </section>

      {/* Resultado ------------------------------------------------------- */}
      <SectionTitle
        description="Como a receita se transforma em lucro e onde o resultado oscila."
        title="Resultado e rentabilidade"
      />
      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Receita líquida x despesas totais (CMV + operacionais) · 12 meses"
          title="Receita x despesas"
        >
          <AreaChart
            aspectRatio="2.2 / 1"
            data={revenueVsExpenses}
            margin={{ top: 12, right: 12, bottom: 36, left: 52 }}
          >
            <LinearGradient
              from="var(--chart-1)"
              fromOpacity={0.35}
              id="fin-revenue"
              to="var(--chart-1)"
              toOpacity={0}
            />
            <LinearGradient
              from="var(--chart-4)"
              fromOpacity={0.3}
              id="fin-expenses"
              to="var(--chart-4)"
              toOpacity={0}
            />
            <Grid horizontal />
            <Area
              curve={curveMonotoneX}
              dataKey="receita"
              fill="url(#fin-revenue)"
              fillOpacity={1}
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
            <Area
              curve={curveMonotoneX}
              dashArray="4 4"
              dataKey="despesas"
              fill="url(#fin-expenses)"
              fillOpacity={1}
              stroke="var(--chart-4)"
              strokeWidth={2}
            />
            <YAxis formatValue={kFormat} />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Receita",
                  value: formatBRL(Number(p.receita)),
                },
                {
                  color: "var(--chart-4)",
                  label: "Despesas",
                  value: formatBRL(Number(p.despesas)),
                },
                {
                  color: "var(--chart-2)",
                  label: "Diferença",
                  value: formatBRL(Number(p.receita) - Number(p.despesas)),
                },
              ]}
            />
          </AreaChart>
          <Legend
            className="mt-2 flex-row justify-center gap-6"
            items={[
              { label: "Receita líquida", value: 0, color: "var(--chart-1)" },
              { label: "Despesas", value: 0, color: "var(--chart-4)" },
            ]}
          >
            <LegendItemComponent className="flex items-center gap-2">
              <LegendMarker />
              <LegendLabel className="text-xs" />
            </LegendItemComponent>
          </Legend>
        </ChartCard>

        <ChartCard
          description="Receita bruta do mês ÷ receita necessária para cobrir custos fixos"
          title="Ponto de equilíbrio"
        >
          <div className="flex flex-col items-center gap-4">
            <Gauge
              centerValue={Math.round(ind.breakEvenCoverage)}
              className="mx-auto"
              defaultLabel="de cobertura"
              height={170}
              inactiveFillOpacity={0.3}
              suffix="%"
              value={Math.min(100, (ind.breakEvenCoverage / 200) * 100)}
              width={280}
            />
            <dl className="grid w-full grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 p-3">
                <dt className="text-muted-foreground text-xs">
                  Equilíbrio mensal
                </dt>
                <dd className="font-semibold tabular-nums">
                  {formatBRL(ind.breakEven)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <dt className="text-muted-foreground text-xs">
                  Margem de segurança
                </dt>
                <dd className="font-semibold tabular-nums">
                  {formatPercent(ind.safetyMargin)}
                </dd>
              </div>
            </dl>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Lucro (acima de zero) e prejuízo (abaixo) por mês"
          title="Resultado líquido mensal"
        >
          <LineChart
            aspectRatio="2.6 / 1"
            data={netIncomeSeries}
            margin={{ top: 12, right: 12, bottom: 36, left: 52 }}
          >
            <Grid
              highlightRowStroke="var(--foreground)"
              highlightRowStrokeOpacity={0.35}
              highlightRowValues={[0]}
              horizontal
            />
            <Line
              curve={curveLinear}
              dataKey="resultado"
              fadeEdges={false}
              showHighlight={false}
              stroke="transparent"
              strokeWidth={0}
            />
            <ProfitLossLegendHoverProvider hoveredIndex={null}>
              <ProfitLossLine
                dataKey="resultado"
                negativeColor="var(--chart-4)"
                positiveColor="var(--chart-1)"
              />
            </ProfitLossLegendHoverProvider>
            <YAxis formatValue={kFormat} />
            <XAxis />
            <ChartTooltip
              rows={(p) => {
                const v = Number(p.resultado);
                return [
                  {
                    color: v >= 0 ? "var(--chart-1)" : "var(--chart-4)",
                    label: v >= 0 ? "Lucro" : "Prejuízo",
                    value: formatBRL(v),
                  },
                ];
              }}
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          description={`Da receita bruta ao lucro líquido · ${periodLabels[period]}`}
          title="DRE em cascata"
        >
          <div className="flex flex-col gap-3">
            <FunnelChart
              className="max-h-[220px]"
              color="var(--chart-1)"
              data={funnel}
              hoveredIndex={funnelHover}
              layers={3}
              onHoverChange={setFunnelHover}
              orientation="horizontal"
              showLabels={false}
              showValues={false}
            />
            <Legend
              hoveredIndex={funnelHover}
              items={funnel.map((f) => ({
                label: f.label,
                value: f.value,
                color: "var(--chart-1)",
              }))}
              onHoverChange={setFunnelHover}
            >
              <LegendItemComponent className="flex items-center gap-2">
                <LegendLabel className="flex-1 text-xs" />
                <LegendValue
                  className="text-xs"
                  formatValue={(v) => formatBRL(v)}
                />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>

      {/* Caixa ----------------------------------------------------------- */}
      <SectionTitle
        description="Saldo, projeção, entradas e saídas para garantir a operação."
        title="Fluxo de caixa"
      />
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          action={<Badge variant="outline">Projeção 3 meses</Badge>}
          description={`Faixa tracejada = reserva mínima recomendada (${formatBRL(minimumReserve)})`}
          title="Saldo de caixa"
        >
          <LineChart
            aspectRatio="2 / 1"
            data={cashBalanceSeries}
            margin={{ top: 12, right: 24, bottom: 36, left: 52 }}
          >
            <Grid horizontal />
            <ReferenceArea
              fill="var(--chart-3)"
              fillOpacity={0.12}
              stroke="var(--chart-3)"
              strokeStyle="dashed"
              y1={0}
              y2={minimumReserve}
            />
            <Line dataKey="caixa" stroke="var(--chart-1)" strokeWidth={2} />
            <LineSeriesTerminalMarker dataKey="caixa" stroke="var(--chart-1)" />
            <ProjectionLine
              curveKind="bezier"
              data={cashProjection}
              showEndMarker
              stroke="var(--chart-3)"
              strokeDasharray="2,4"
              strokeWidth={2}
            />
            <YAxis formatValue={kFormat} />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Caixa",
                  value: formatBRL(Number(p.caixa)),
                },
              ]}
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          description={`De onde vem e para onde vai o dinheiro · ${periodLabels[period]}`}
          title="Origem e destino do caixa"
        >
          <SankeyChart
            aspectRatio="16 / 10"
            data={sankey}
            margin={{ top: 8, right: 96, bottom: 8, left: 72 }}
            nodePadding={16}
            nodeWidth={12}
          >
            <SankeyLink />
            <SankeyNode lineCap={4} showValueLabels={false} />
            <SankeyTooltip formatValue={formatBRL} />
          </SankeyChart>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="Entradas x saídas previstas"
          title="Próximas 6 semanas"
        >
          <BarChart
            aspectRatio="4 / 3"
            barGap={0.25}
            data={weeklyCashForecast}
            xDataKey="week"
          >
            <Grid horizontal />
            <Bar dataKey="recebimentos" fill="var(--chart-1)" lineCap={4} />
            <Bar dataKey="pagamentos" fill="var(--chart-4)" lineCap={4} />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Recebimentos",
                  value: formatBRL(Number(p.recebimentos)),
                },
                {
                  color: "var(--chart-4)",
                  label: "Pagamentos",
                  value: formatBRL(Number(p.pagamentos)),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          description={`${formatBRL(ind.receivables)} a receber · ${formatPercent(ind.delinquency)} vencido`}
          title="Aging de recebíveis"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={receivablesAging}
            margin={{ left: 80 }}
            orientation="horizontal"
            xDataKey="faixa"
          >
            <LinearGradient
              from="var(--chart-1)"
              id="aging-gradient"
              to="var(--chart-3)"
              vertical={false}
            />
            <Grid fadeVertical horizontal={false} vertical />
            <Bar dataKey="valor" fill="url(#aging-gradient)" lineCap={4} />
            <BarYAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Valor",
                  value: formatBRL(Number(p.valor)),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description="Receita bruta por canal · 6 meses"
          title="Receita por canal"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={receivablesByChannel}
            stacked
            stackGap={2}
            xDataKey="month"
          >
            <Grid horizontal />
            <Bar
              dataKey="salao"
              fill="var(--chart-1)"
              lineCap={4}
              stackGap={2}
            />
            <Bar
              dataKey="delivery"
              fill="var(--chart-3)"
              lineCap={4}
              stackGap={2}
            />
            <Bar
              dataKey="eventos"
              fill="var(--chart-5)"
              lineCap={4}
              stackGap={2}
            />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Salão",
                  value: formatBRL(Number(p.salao)),
                },
                {
                  color: "var(--chart-3)",
                  label: "Delivery",
                  value: formatBRL(Number(p.delivery)),
                },
                {
                  color: "var(--chart-5)",
                  label: "Eventos",
                  value: formatBRL(Number(p.eventos)),
                },
              ]}
            />
          </BarChart>
        </ChartCard>
      </section>

      {/* Custos e orçamento ---------------------------------------------- */}
      <SectionTitle
        description="Para onde vão os gastos e como estão frente ao orçamento."
        title="Custos e orçamento"
      />
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description={periodLabels[period]}
          title="Composição das despesas"
        >
          <div className="flex flex-col items-center gap-4">
            <PieChart
              data={expenses}
              hoveredIndex={expenseHover}
              innerRadius={62}
              onHoverChange={setExpenseHover}
              size={220}
            >
              {expenses.map((e, i) => (
                <PieSlice index={i} key={e.label} />
              ))}
              <PieCenter
                defaultLabel="Total"
                formatOptions={{ notation: "compact" }}
                prefix="R$ "
              />
            </PieChart>
            <Legend
              className="w-full"
              hoveredIndex={expenseHover}
              items={expenses.map((e) => ({
                label: e.label,
                value: e.value,
                color: e.color ?? "",
              }))}
              onHoverChange={setExpenseHover}
            >
              <LegendItemComponent className="flex items-center gap-3">
                <LegendMarker />
                <LegendLabel className="flex-1 text-sm" />
                <LegendValue
                  className="text-sm"
                  formatValue={formatBRL}
                  showPercentage
                />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>

        <ChartCard
          description="Realizado do mês ÷ orçamento"
          title="Orçado x realizado"
        >
          <Legend
            hoveredIndex={budgetHover}
            items={budgetLines.map((b) => ({
              label: b.label,
              value: b.value,
              maxValue: b.maxValue,
              color: b.color,
            }))}
            onHoverChange={setBudgetHover}
          >
            <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
              <LegendMarker />
              <LegendLabel className="text-sm" />
              <LegendValue
                className="text-sm"
                formatValue={formatBRL}
                showPercentage
              />
              <div className="col-span-full">
                <LegendProgress />
              </div>
            </LegendItemComponent>
          </Legend>
          <p className="mt-4 text-muted-foreground text-xs">
            {overBudget.length > 0
              ? `Acima do orçamento: ${overBudget.map((b) => b.label).join(", ")} — revise antes do próximo ciclo.`
              : "Todas as categorias dentro do orçamento."}
          </p>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description="Metas do mês (R$ mil)"
          title="Metas financeiras"
        >
          <div className="flex flex-col items-center gap-4">
            <RingChart
              data={budgetRing}
              ringGap={6}
              size={210}
              strokeWidth={13}
            >
              {budgetRing.map((r, i) => (
                <Ring index={i} key={r.label} />
              ))}
              <RingCenter defaultLabel="Receita" prefix="R$ " suffix=" mil" />
            </RingChart>
            <Legend
              className="w-full"
              items={budgetRing.map((r) => ({
                label: r.label,
                value: r.value,
                maxValue: r.maxValue,
                color: r.color ?? "",
              }))}
            >
              <LegendItemComponent className="flex items-center gap-3">
                <LegendMarker />
                <LegendLabel className="flex-1 text-sm" />
                <LegendValue
                  className="text-sm"
                  formatValue={(v) => `R$ ${Math.round(v)} mil`}
                />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          description="Pontuação 0–100 por dimensão: atual x meta"
          title="Saúde financeira"
        >
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center">
            <RadarChart
              data={healthScores}
              hoveredIndex={healthHover}
              metrics={healthMetrics}
              onHoverChange={setHealthHover}
              size={300}
            >
              <RadarGrid showLabels={false} />
              <RadarAxis />
              <RadarLabels fontSize={11} interactive />
              {healthScores.map((h, i) => (
                <RadarArea index={i} key={h.label} />
              ))}
            </RadarChart>
            <Legend
              className="min-w-40"
              hoveredIndex={healthHover}
              items={healthScores.map((h) => ({
                label: h.label,
                value:
                  Object.values(h.values).reduce((a, b) => a + b, 0) /
                  healthMetrics.length,
                maxValue: 100,
                color: h.color ?? "",
              }))}
              onHoverChange={setHealthHover}
              title="Nota média"
            >
              <LegendItemComponent className="flex items-center gap-3">
                <LegendMarker />
                <LegendLabel className="flex-1" />
                <LegendValue formatValue={(v) => v.toFixed(0)} />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>

        <ChartCard
          action={<Badge variant="secondary">R$/kg</Badge>}
          description="Variação semanal do principal insumo (picanha) · 20 semanas"
          title="Custo do insumo-chave"
        >
          <CandlestickChart
            data={beefPrice}
            margin={{ top: 16, right: 16, bottom: 40, left: 16 }}
            style={{ height: 300 }}
          >
            <Candlestick
              fadedOpacity={0.25}
              negativeFill="var(--chart-4)"
              positiveFill="var(--chart-1)"
            />
            <ChartTooltip />
            <XAxis />
          </CandlestickChart>
        </ChartCard>
      </section>

      {/* DRE e contas ---------------------------------------------------- */}
      <SectionTitle
        description="Demonstrativo de resultado, contas a pagar/receber e lançamentos."
        title="Demonstrativos e contas"
      />
      <section className="grid gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-2"
          description={`Demonstração do resultado · ${periodLabels[period]}`}
          title="DRE"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Conta</th>
                <th className="py-2 text-right font-normal">Valor</th>
                <th className="w-16 py-2 text-right font-normal">% RL</th>
              </tr>
            </thead>
            <tbody>
              {dre.map((r) => (
                <tr
                  className={cn(
                    "border-border/50 border-b last:border-0",
                    r.kind !== "minus" && "font-medium",
                    r.kind === "result" && "bg-muted/40"
                  )}
                  key={r.label}
                >
                  <td
                    className={cn(
                      "py-1.5",
                      r.kind === "minus" && "pl-3 text-muted-foreground"
                    )}
                  >
                    {r.label}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      r.kind === "result" && r.value < 0 && "text-destructive"
                    )}
                  >
                    {formatBRL(r.value)}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {formatPercent(r.share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard
          className="xl:col-span-3"
          description="Vencimentos dos próximos 15 dias"
          title="Contas"
        >
          <Tabs defaultValue="pagar">
            <TabsList>
              <TabsTrigger value="pagar">
                A pagar ·{" "}
                {formatBRL(
                  payables
                    .filter((b) => b.status !== "Pago")
                    .reduce((a, b) => a + b.amount, 0)
                )}
              </TabsTrigger>
              <TabsTrigger value="receber">
                A receber ·{" "}
                {formatBRL(receivables.reduce((a, b) => a + b.amount, 0))}
              </TabsTrigger>
            </TabsList>
            {(["pagar", "receber"] as const).map((kind) => (
              <TabsContent className="pt-3" key={kind} value={kind}>
                <ul className="flex flex-col divide-y">
                  {(kind === "pagar" ? payables : receivables).map((b) => (
                    <li
                      className="flex items-center gap-3 py-2.5"
                      key={b.description}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon
                          className="size-4"
                          name={
                            kind === "pagar"
                              ? "IconArrowUpRight"
                              : "IconArrowDownLeft"
                          }
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {b.description}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {b.supplier} · vence {formatDate(b.due)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-medium text-sm tabular-nums">
                          {formatBRL(b.amount)}
                        </span>
                        <Badge variant={billVariant[b.status]}>
                          {b.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            ))}
          </Tabs>
        </ChartCard>
      </section>

      <ChartCard
        action={
          <Button size="sm" variant="ghost">
            Ver extrato
          </Button>
        }
        description="Últimos lançamentos conciliados"
        title="Lançamentos"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Data</th>
                <th className="py-2 text-left font-normal">Descrição</th>
                <th className="py-2 text-left font-normal">Categoria</th>
                <th className="py-2 text-left font-normal">Conta</th>
                <th className="py-2 text-right font-normal">Valor</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr
                  className="border-border/50 border-b last:border-0"
                  key={`${l.description}-${l.amount}`}
                >
                  <td className="py-2 text-muted-foreground tabular-nums">
                    {formatDate(l.date)}
                  </td>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2">
                    <Badge variant="outline">{l.category}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">{l.account}</td>
                  <td
                    className={cn(
                      "py-2 text-right font-medium tabular-nums",
                      l.amount < 0 ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {l.amount < 0 ? "−" : "+"}
                    {formatBRL(Math.abs(l.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
