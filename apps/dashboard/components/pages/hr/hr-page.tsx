"use client";

import { Icon } from "@bklitui/icons";
import { Gauge } from "@bklitui/ui/charts";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brlFormatOptions } from "@/lib/format";
import {
  type Employee,
  headcountSeries,
  hrSummary,
  employees as initialEmployees,
} from "@/lib/hr-data";
import { HrDevelopmentTab } from "./development-tab";
import { HrOverviewTab } from "./overview-tab";
import { HrPeopleTab, NewEmployeeSheet } from "./people-tab";
import { HrRecruitmentTab } from "./recruitment-tab";
import { HrScheduleTab } from "./schedule-tab";

const TABS = [
  { value: "geral", label: "Visão geral" },
  { value: "colaboradores", label: "Colaboradores" },
  { value: "escala", label: "Escala & ponto" },
  { value: "recrutamento", label: "Recrutamento" },
  { value: "desenvolvimento", label: "Desenvolvimento" },
] as const;

const payrollSeries = headcountSeries.map((m, i) => ({
  date: m.date,
  folha: Math.round(hrSummary.payroll * (0.86 + i * 0.013)),
  headcount: m.headcount,
  turnover: m.turnover,
}));

export function HrPage() {
  const [tab, setTab] = useState<string>("geral");
  const [people, setPeople] = useState<Employee[]>(initialEmployees);
  const [newOpen, setNewOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const addEmployee = (e: Employee) => {
    setPeople((prev) => [e, ...prev]);
    setJustAdded(e.name);
    setTab("colaboradores");
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Gestão de pessoas
          </h2>
          <p className="text-muted-foreground text-sm">
            Equipe, custos, escalas, recrutamento e desenvolvimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Icon className="size-4" name="IconFileDownload" />
            Exportar folha
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Icon className="size-4" name="IconPeopleAdd" />
            Novo colaborador
          </Button>
        </div>
      </div>

      {justAdded ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-success" name="IconCheckCircle2" />
            <span>
              <strong className="font-medium">{justAdded}</strong> cadastrado(a)
              em período de experiência.
            </span>
          </span>
          <Button onClick={() => setJustAdded(null)} size="xs" variant="ghost">
            Fechar
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dataKey="headcount"
          icon="IconPeople"
          label={`${hrSummary.onVacation} em férias · ${hrSummary.onLeave} afastado(s)`}
          series={payrollSeries}
          title="Colaboradores"
          trend={8.3}
          value={people.length}
        />
        <KpiCard
          color="var(--kpi-2)"
          dataKey="folha"
          formatOptions={brlFormatOptions}
          icon="IconMoneyHand"
          invertTrend
          label="Salários + encargos + benefícios"
          series={payrollSeries}
          title="Folha mensal"
          trend={3.1}
          value={hrSummary.payroll}
        />
        <KpiCard
          color="var(--kpi-3)"
          dataKey="turnover"
          formatOptions={{ maximumFractionDigits: 1 }}
          icon="IconArrowsRepeatCircle"
          invertTrend
          label="Média mensal · ideal < 5%"
          series={payrollSeries}
          suffix="%"
          title="Turnover"
          trend={hrSummary.turnoverTrend}
          value={hrSummary.turnover}
        />
        <ChartCard
          action={<Badge variant="secondary">Clima</Badge>}
          className="gap-2"
          title="eNPS da equipe"
        >
          <Gauge
            centerValue={hrSummary.enps}
            className="mx-auto"
            defaultLabel="excelente"
            height={150}
            inactiveFillOpacity={0.3}
            value={(hrSummary.enps + 100) / 2}
            width={260}
          />
        </ChartCard>
      </section>

      <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent className="pt-4" value="geral">
          <HrOverviewTab />
        </TabsContent>
        <TabsContent className="pt-4" value="colaboradores">
          <HrPeopleTab people={people} />
        </TabsContent>
        <TabsContent className="pt-4" value="escala">
          <HrScheduleTab />
        </TabsContent>
        <TabsContent className="pt-4" value="recrutamento">
          <HrRecruitmentTab />
        </TabsContent>
        <TabsContent className="pt-4" value="desenvolvimento">
          <HrDevelopmentTab />
        </TabsContent>
      </Tabs>

      <NewEmployeeSheet
        onCreate={addEmployee}
        onOpenChange={setNewOpen}
        open={newOpen}
      />
    </div>
  );
}
