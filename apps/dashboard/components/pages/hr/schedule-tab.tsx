"use client";

import {
  ChartTooltip,
  Grid,
  HeatmapCells,
  HeatmapChart,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  Scatter,
  ScatterChart,
  XAxis,
} from "@bklitui/ui/charts";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatPercent } from "@/lib/format";
import {
  absenceHeatmap,
  hrSummary,
  SECTORS,
  shiftTimes,
  timeClock,
  tipsAndHours,
  WEEKDAYS,
  weeklySchedule,
} from "@/lib/hr-data";
import { cn } from "@/lib/utils";
import { Avatar } from "./hr-shared";

const ALL = "todos";
const sectorItems = [
  { value: ALL, label: "Todos os setores" },
  ...SECTORS.map((s) => ({ value: s, label: s })),
];

const clockVariant = {
  "No horário": "outline",
  Atraso: "secondary",
  Ausente: "destructive",
  Aguardando: "default",
} as const;

export function HrScheduleTab() {
  const [sector, setSector] = useState<string>(ALL);
  const schedule = useMemo(
    () => weeklySchedule.filter((r) => sector === ALL || r.sector === sector),
    [sector]
  );

  const present = timeClock.filter((t) => t.status === "No horário").length;
  const late = timeClock.filter((t) => t.status === "Atraso").length;
  const absent = timeClock.filter((t) => t.status === "Ausente").length;
  const waiting = timeClock.filter((t) => t.status === "Aguardando").length;

  // Coverage per day = scheduled people per weekday
  const coverage = WEEKDAYS.map(
    (_, d) => schedule.filter((r) => r.days[d] !== null).length
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint="Bateram o ponto no horário"
          icon="IconCheckCircle2"
          label="Presentes"
          tone="good"
          value={String(present)}
        />
        <MetricTile
          hint="Tolerância de 5 minutos"
          icon="IconClockAlert"
          label="Atrasos hoje"
          tone={late > 1 ? "warn" : "good"}
          value={String(late)}
        />
        <MetricTile
          hint="Sem justificativa até agora"
          icon="IconWarningSign"
          label="Ausências"
          tone={absent > 0 ? "bad" : "good"}
          value={String(absent)}
        />
        <MetricTile
          hint={`Absenteísmo ${formatPercent(hrSummary.absenteeism)} no mês`}
          icon="IconClock"
          label="Turno da noite"
          tone="neutral"
          value={`${waiting} a entrar`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          action={
            <Select
              items={sectorItems}
              onValueChange={(v) => setSector(String(v))}
              value={sector}
            >
              <SelectTrigger className="w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sectorItems.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          className="xl:col-span-2"
          description="Turnos da semana · folgas em destaque"
          title="Escala semanal"
        >
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-left font-normal">Colaborador</th>
                  {WEEKDAYS.map((d, i) => (
                    <th className="py-2 text-center font-normal" key={d}>
                      {d}
                      <span className="block text-[10px] tabular-nums opacity-70">
                        {coverage[i]} pessoas
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr
                    className="border-border/50 border-b last:border-0"
                    key={row.id}
                  >
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          className="size-7 text-[10px]"
                          name={row.name}
                        />
                        <span className="truncate font-medium text-sm">
                          {row.name.split(" ")[0]}
                        </span>
                      </div>
                    </td>
                    {row.days.map((shift, d) => (
                      <td
                        className="px-0.5 py-1.5 text-center"
                        key={WEEKDAYS[d]}
                      >
                        <span
                          className={cn(
                            "inline-flex w-full justify-center rounded-md px-1 py-1",
                            shift
                              ? "bg-muted text-foreground"
                              : "border border-dashed text-muted-foreground"
                          )}
                          title={shift ? shiftTimes[shift] : "Folga"}
                        >
                          {shift ?? "Folga"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          description="Registro de entrada de hoje"
          title="Ponto do dia"
        >
          <ul className="flex flex-col divide-y">
            {timeClock.map((t) => (
              <li className="flex items-center gap-3 py-2" key={t.id}>
                <Avatar className="size-8 text-[10px]" name={t.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{t.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    Previsto {t.expected}
                    {t.clockIn ? ` · entrou ${t.clockIn}` : ""}
                  </p>
                </div>
                <Badge variant={clockVariant[t.status]}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Intensidade de faltas e atrasos por dia · 6 meses"
          title="Mapa de ausências"
        >
          <div className="flex flex-col gap-3 overflow-x-auto">
            <HeatmapChart
              className="w-full min-w-[560px]"
              data={absenceHeatmap}
              gap={3}
              layout="fluid"
              margin={{ top: 24, right: 8, bottom: 8, left: 36 }}
            >
              <HeatmapCells cornerRadius={3} />
              <HeatmapXAxis />
              <HeatmapYAxis labelFormat="initial" tickFilter="odd" />
              <HeatmapTooltip />
            </HeatmapChart>
            <HeatmapLegend align="end" gap={3} />
          </div>
        </ChartCard>

        <ChartCard
          description="Horas da equipe x gorjetas distribuídas · 30 dias"
          title="Horas x gorjetas"
        >
          <ScatterChart
            aspectRatio="4 / 3"
            data={tipsAndHours}
            margin={{ top: 12, right: 12, bottom: 36, left: 12 }}
          >
            <Grid horizontal />
            <Scatter dataKey="horas" fill="var(--chart-1)" />
            <Scatter dataKey="gorjetas" fill="var(--chart-4)" />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Horas",
                  value: `${p.horas} h`,
                },
                {
                  color: "var(--chart-4)",
                  label: "Gorjetas",
                  value: formatBRL(Number(p.gorjetas)),
                },
              ]}
            />
          </ScatterChart>
        </ChartCard>
      </section>
    </div>
  );
}
