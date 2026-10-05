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
  LegendProgress,
  LegendValue,
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
  Ring,
  RingCenter,
  RingChart,
} from "@bklitui/ui/charts";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  enpsBreakdown,
  performanceDistribution,
  performanceMetrics,
  teamPerformance,
  trainingCatalog,
  trainings,
} from "@/lib/hr-data";
import { ScoreBar } from "./hr-shared";

export function HrDevelopmentTab() {
  const [radarHover, setRadarHover] = useState<number | null>(null);
  const [ringHover, setRingHover] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          description="Média por competência (0–100)"
          title="Desempenho por setor"
        >
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center">
            <RadarChart
              data={teamPerformance}
              hoveredIndex={radarHover}
              metrics={performanceMetrics}
              onHoverChange={setRadarHover}
              size={300}
            >
              <RadarGrid showLabels={false} />
              <RadarAxis />
              <RadarLabels fontSize={11} interactive />
              {teamPerformance.map((t, i) => (
                <RadarArea index={i} key={t.label} />
              ))}
            </RadarChart>
            <Legend
              className="min-w-40"
              hoveredIndex={radarHover}
              items={teamPerformance.map((t) => ({
                label: t.label,
                value:
                  Object.values(t.values).reduce((a, b) => a + b, 0) /
                  performanceMetrics.length,
                maxValue: 100,
                color: t.color ?? "",
              }))}
              onHoverChange={setRadarHover}
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
          description="Colaboradores por faixa na última avaliação"
          title="Distribuição de desempenho"
        >
          <BarChart
            aspectRatio="16 / 9"
            data={performanceDistribution}
            xDataKey="faixa"
          >
            <Grid horizontal />
            <Bar dataKey="pessoas" fill="var(--chart-1)" lineCap={4} />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Pessoas",
                  value: Number(p.pessoas),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard description="Concluíram ÷ inscritos" title="Treinamentos">
          <div className="flex flex-col items-center gap-4">
            <RingChart
              data={trainings}
              hoveredIndex={ringHover}
              onHoverChange={setRingHover}
              ringGap={6}
              size={200}
              strokeWidth={12}
            >
              {trainings.map((t, i) => (
                <Ring index={i} key={t.label} />
              ))}
              <RingCenter defaultLabel="Concluídos" />
            </RingChart>
            <Legend
              className="w-full"
              hoveredIndex={ringHover}
              items={trainings.map((t) => ({
                label: t.label,
                value: t.value,
                maxValue: t.maxValue,
                color: t.color ?? "",
              }))}
              onHoverChange={setRingHover}
            >
              <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
                <LegendMarker />
                <LegendLabel className="text-sm" />
                <LegendValue className="text-sm" showPercentage />
                <div className="col-span-full">
                  <LegendProgress />
                </div>
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>

        <ChartCard description="Próximas turmas" title="Agenda de capacitação">
          <ul className="flex flex-col divide-y">
            {trainingCatalog.map((t) => (
              <li className="flex flex-col gap-1.5 py-3" key={t.name}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{t.name}</p>
                  {t.mandatory ? (
                    <Badge variant="secondary">Obrigatório</Badge>
                  ) : (
                    <Badge variant="outline">Opcional</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t.hours} h · prazo {formatDate(t.due)} · {t.done}/
                  {t.enrolled} concluíram
                </p>
                <ScoreBar value={Math.round((t.done / t.enrolled) * 100)} />
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description="Pesquisa de clima trimestral (18 respostas)"
          title="eNPS · satisfação"
        >
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-semibold text-4xl tabular-nums tracking-tight">
              64
            </span>
            <span className="text-muted-foreground text-sm">
              Zona de excelência (&gt; 50)
            </span>
          </div>
          <Legend items={enpsBreakdown}>
            <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
              <LegendMarker />
              <LegendLabel className="text-sm" />
              <LegendValue className="text-sm" showPercentage />
              <div className="col-span-full">
                <LegendProgress />
              </div>
            </LegendItemComponent>
          </Legend>
          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs">
            <p className="mb-1 font-medium">Principais comentários</p>
            <p className="text-muted-foreground">
              “Ambiente de equipe muito bom” · “Escala de fim de semana pesada”
              · “Quero mais treinamentos de vinho”
            </p>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
