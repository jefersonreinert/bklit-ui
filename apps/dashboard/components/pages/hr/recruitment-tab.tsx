"use client";

import {
  FunnelChart,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendValue,
} from "@bklitui/ui/charts";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import {
  candidates as initialCandidates,
  openPositions,
  RECRUITMENT_STAGES,
  recruitmentFunnel,
} from "@/lib/hr-data";
import { Icon } from "@/lib/icons";
import { Avatar } from "./hr-shared";

type Stage = (typeof RECRUITMENT_STAGES)[number];

const urgencyVariant = {
  Alta: "destructive",
  Média: "secondary",
  Baixa: "outline",
} as const;

export function HrRecruitmentTab() {
  const [hover, setHover] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState(() =>
    initialCandidates.map((c) => ({
      ...c,
      stage: c.stage as Stage | "Contratado",
    }))
  );

  const advance = (name: string) => {
    setPipeline((prev) =>
      prev.map((c) => {
        if (c.name !== name || c.stage === "Contratado") {
          return c;
        }
        const idx = RECRUITMENT_STAGES.indexOf(c.stage);
        const next = RECRUITMENT_STAGES[idx + 1] ?? "Contratado";
        return { ...c, stage: next };
      })
    );
  };

  const first = recruitmentFunnel[0]?.value ?? 1;
  const last = recruitmentFunnel.at(-1)?.value ?? 0;
  const hired = pipeline.filter((c) => c.stage === "Contratado");

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint="Abertas no momento"
          icon="IconPeopleAdd"
          label="Vagas abertas"
          tone="neutral"
          value={String(openPositions.length)}
        />
        <MetricTile
          hint="Da abertura à contratação"
          icon="IconCalendarClock"
          label="Tempo médio"
          tone="good"
          value="19 dias"
        />
        <MetricTile
          hint="Contratados ÷ candidaturas"
          icon="IconChartCompare"
          label="Conversão"
          tone="neutral"
          value={formatPercent((last / first) * 100)}
        />
        <MetricTile
          hint="Anúncios + integração"
          icon="IconCoins"
          label="Custo por contratação"
          tone="good"
          value="R$ 640"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard description="Últimos 90 dias" title="Funil de recrutamento">
          <div className="flex flex-col gap-3">
            <FunnelChart
              className="max-h-[220px]"
              color="var(--chart-1)"
              data={recruitmentFunnel}
              hoveredIndex={hover}
              layers={3}
              onHoverChange={setHover}
              orientation="horizontal"
              showLabels={false}
              showValues={false}
            />
            <Legend
              hoveredIndex={hover}
              items={recruitmentFunnel.map((f) => ({
                label: f.label,
                value: f.value,
                color: "var(--chart-1)",
              }))}
              onHoverChange={setHover}
            >
              <LegendItemComponent className="flex items-center gap-2">
                <LegendLabel className="flex-1 text-sm" />
                <LegendValue className="text-sm" showPercentage />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          description="Andamento por vaga"
          title="Vagas abertas"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {openPositions.map((p) => (
              <Card className="gap-3 px-4 py-3.5" key={p.role} size="sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.role}</p>
                    <p className="text-muted-foreground text-xs">
                      {p.sector} · aberta há {p.openedDays} dias
                    </p>
                  </div>
                  <Badge variant={urgencyVariant[p.urgency]}>{p.urgency}</Badge>
                </div>
                <div className="flex gap-1">
                  {RECRUITMENT_STAGES.map((s, i) => (
                    <div className="flex flex-1 flex-col gap-1" key={s}>
                      <div
                        className={
                          i < p.stage
                            ? "h-1.5 rounded-full bg-[var(--chart-1)] dark:bg-foreground"
                            : "h-1.5 rounded-full bg-muted"
                        }
                      />
                      <span className="truncate text-[10px] text-muted-foreground">
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium text-foreground">
                    {p.candidates}
                  </span>{" "}
                  candidatos
                </p>
              </Card>
            ))}
          </div>
        </ChartCard>
      </section>

      <ChartCard
        action={
          hired.length > 0 ? (
            <Badge variant="outline">
              {hired.length} contratado{hired.length > 1 ? "s" : ""} nesta
              sessão
            </Badge>
          ) : null
        }
        description="Clique em “Avançar” para mover o candidato à próxima etapa"
        title="Pipeline de candidatos"
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="grid min-w-[760px] grid-cols-5 gap-3">
            {[...RECRUITMENT_STAGES, "Contratado" as const].map((stage) => {
              const items = pipeline.filter((c) => c.stage === stage);
              return (
                <div
                  className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2"
                  key={stage}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="font-medium text-xs">{stage}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  {items.map((c) => (
                    <Card className="gap-2 px-3 py-2.5" key={c.name} size="sm">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7 text-[10px]" name={c.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-xs">
                            {c.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {c.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {c.source} · nota {c.score}
                        </span>
                        {stage === "Contratado" ? (
                          <Icon
                            className="size-4 text-success"
                            name="IconCheckCircle2"
                          />
                        ) : (
                          <Button
                            className="h-6 px-2 text-[11px]"
                            onClick={() => advance(c.name)}
                            size="xs"
                            variant="outline"
                          >
                            Avançar
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">
                      Vazio
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
