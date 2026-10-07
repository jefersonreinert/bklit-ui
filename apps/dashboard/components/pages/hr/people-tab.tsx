"use client";

import {
  Bar,
  BarChart,
  BarYAxis,
  ChartTooltip,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  LinearGradient,
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
} from "@bklitui/ui/charts";
import { type FormEvent, useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TODAY } from "@/lib/data";
import { formatBRL, formatDate } from "@/lib/format";
import {
  type Contract,
  contractMix,
  type Employee,
  type EmployeeStatus,
  SECTORS,
  type Sector,
  type Shift,
  STATUSES,
  salaryByRole,
  shiftTimes,
  skillMetrics,
  tenure,
} from "@/lib/hr-data";
import { Icon } from "@/lib/icons";
import { Avatar, ScoreBar, StatusBadge } from "./hr-shared";

const ALL = "todos";
const sectorItems = [
  { value: ALL, label: "Todos os setores" },
  ...SECTORS.map((s) => ({ value: s, label: s })),
];
const statusItems = [
  { value: ALL, label: "Todos os status" },
  ...STATUSES.map((s) => ({ value: s, label: s })),
];
const SHIFTS: Shift[] = ["Manhã", "Almoço", "Tarde", "Noite", "Comercial"];
const CONTRACTS: Contract[] = ["CLT", "Intermitente", "Estágio", "PJ"];

function EmployeeSheet({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={employee !== null}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        {employee ? (
          <>
            <SheetHeader className="gap-3 border-b p-5">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 text-sm" name={employee.name} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{employee.name}</SheetTitle>
                  <SheetDescription>
                    {employee.role} · {employee.sector}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={employee.status} />
                <Badge variant="outline">{employee.contract}</Badge>
                <Badge variant="outline">
                  {employee.shift} · {shiftTimes[employee.shift]}
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 p-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Matrícula", employee.id],
                  ["Admissão", formatDate(employee.admission)],
                  ["Tempo de casa", tenure(employee.admission)],
                  ["Salário base", formatBRL(employee.salary)],
                  ["Horas no mês", `${employee.hoursMonth} h`],
                  ["Horas extras", `${employee.overtime} h`],
                  ["Faltas (90d)", String(employee.absences)],
                  ["Aniversário", formatDate(employee.birthday).slice(0, 5)],
                ].map(([k, v]) => (
                  <div className="rounded-lg bg-muted/60 p-3" key={k}>
                    <dt className="text-muted-foreground text-xs">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="mb-1 font-medium text-sm">Competências</p>
                <p className="mb-2 text-muted-foreground text-xs">
                  Desempenho geral {employee.performance}/100
                </p>
                <div className="flex justify-center">
                  <RadarChart
                    data={[
                      {
                        label: employee.name,
                        color: "var(--series-1)",
                        values: employee.skills,
                      },
                    ]}
                    levels={4}
                    metrics={skillMetrics}
                    size={260}
                  >
                    <RadarGrid showLabels={false} />
                    <RadarAxis />
                    <RadarLabels fontSize={11} />
                    <RadarArea index={0} />
                  </RadarChart>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <p className="font-medium">Contato</p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4" name="IconEmailPlus" />
                  {employee.email}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4" name="IconBell" />
                  {employee.phone}
                </p>
              </div>
            </div>

            <SheetFooter className="mt-auto flex-row gap-2 border-t p-4">
              <Button className="flex-1" variant="outline">
                <Icon className="size-4" name="IconCalendarAdd4" />
                Agendar férias
              </Button>
              <Button className="flex-1">
                <Icon className="size-4" name="IconFileText" />
                Holerite
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function NewEmployeeSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (employee: Employee) => void;
}) {
  const [sector, setSector] = useState<Sector>("Salão");
  const [shift, setShift] = useState<Shift>("Noite");
  const [contract, setContract] = useState<Contract>("CLT");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();
    const salary = Number(form.get("salary") ?? 0);
    if (!(name && role)) {
      return;
    }
    onCreate({
      id: `C${Math.floor(2000 + Math.random() * 7000)}`,
      name,
      role,
      sector,
      shift,
      contract,
      salary: Number.isFinite(salary) ? salary : 0,
      admission: TODAY,
      status: "Experiência",
      performance: 75,
      hoursMonth: 0,
      overtime: 0,
      absences: 0,
      birthday: TODAY,
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      skills: {
        tecnica: 70,
        agilidade: 70,
        atendimento: 70,
        pontualidade: 80,
        equipe: 75,
      },
    });
    event.currentTarget.reset();
    onOpenChange(false);
  };

  const field = "flex flex-col gap-1.5";

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Novo colaborador</SheetTitle>
          <SheetDescription>
            Admissão em período de experiência (45 + 45 dias).
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 p-5" onSubmit={submit}>
          <div className={field}>
            <Label htmlFor="new-name">Nome completo</Label>
            <Input
              id="new-name"
              name="name"
              placeholder="Ex.: Maria Silva"
              required
            />
          </div>
          <div className={field}>
            <Label htmlFor="new-role">Cargo</Label>
            <Input
              id="new-role"
              name="role"
              placeholder="Ex.: Garçonete"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <Label>Setor</Label>
              <Select
                items={SECTORS.map((s) => ({ value: s, label: s }))}
                onValueChange={(v) => setSector(v as Sector)}
                value={sector}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label>Turno</Label>
              <Select
                items={SHIFTS.map((s) => ({ value: s, label: s }))}
                onValueChange={(v) => setShift(v as Shift)}
                value={shift}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} · {shiftTimes[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label>Contrato</Label>
              <Select
                items={CONTRACTS.map((c) => ({ value: c, label: c }))}
                onValueChange={(v) => setContract(v as Contract)}
                value={contract}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACTS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="new-salary">Salário (R$)</Label>
              <Input
                defaultValue={2200}
                id="new-salary"
                inputMode="numeric"
                min={0}
                name="salary"
                type="number"
              />
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="new-email">E-mail</Label>
            <Input
              id="new-email"
              name="email"
              placeholder="nome@casabrasa.com.br"
              type="email"
            />
          </div>
          <div className={field}>
            <Label htmlFor="new-phone">Telefone</Label>
            <Input
              id="new-phone"
              inputMode="tel"
              name="phone"
              placeholder="(11) 90000-0000"
            />
          </div>
          <div className="mt-auto flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button className="flex-1" type="submit">
              <Icon className="size-4" name="IconPeopleAdd" />
              Cadastrar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function HrPeopleTab({ people }: { people: Employee[] }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [selected, setSelected] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return people.filter((e) => {
      const hay = `${e.name} ${e.role} ${e.id}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      return (
        (q === "" || hay.includes(q)) &&
        (sector === ALL || e.sector === sector) &&
        (status === ALL || e.status === (status as EmployeeStatus))
      );
    });
  }, [people, query, sector, status]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ChartCard
        description={`${filtered.length} de ${people.length} colaboradores`}
        title="Quadro de colaboradores"
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              name="IconSearchMenu"
            />
            <Input
              aria-label="Buscar colaborador"
              className="pl-8"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, cargo ou matrícula"
              value={query}
            />
          </div>
          <Select
            items={sectorItems}
            onValueChange={(v) => setSector(String(v))}
            value={sector}
          >
            <SelectTrigger className="w-full sm:w-44">
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
          <Select
            items={statusItems}
            onValueChange={(v) => setStatus(String(v))}
            value={status}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Colaborador</th>
                <th className="py-2 text-left font-normal">Setor</th>
                <th className="py-2 text-left font-normal">Contrato</th>
                <th className="py-2 text-left font-normal">Tempo de casa</th>
                <th className="py-2 text-left font-normal">Desempenho</th>
                <th className="py-2 text-right font-normal">Salário</th>
                <th className="py-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  className="cursor-pointer border-border/50 border-b transition-colors last:border-0 hover:bg-muted/50"
                  key={e.id}
                  onClick={() => setSelected(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelected(e);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.name}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          {e.role} · {e.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2">{e.sector}</td>
                  <td className="py-2">
                    <Badge variant="outline">{e.contract}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {tenure(e.admission)}
                  </td>
                  <td className="py-2">
                    <ScoreBar value={e.performance} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRL(e.salary)}
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={e.status} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    className="py-10 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    Nenhum colaborador encontrado com esses filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard description="Média por cargo (R$)" title="Faixas salariais">
          <BarChart
            aspectRatio="4 / 3"
            data={salaryByRole}
            margin={{ left: 80 }}
            orientation="horizontal"
            xDataKey="cargo"
          >
            <LinearGradient
              from="var(--chart-1)"
              id="salary-gradient"
              to="var(--chart-3)"
              vertical={false}
            />
            <Grid fadeVertical horizontal={false} vertical />
            <Bar dataKey="salario" fill="url(#salary-gradient)" lineCap={4} />
            <BarYAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Salário médio",
                  value: formatBRL(Number(p.salario)),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>

        <ChartCard description="Tipo de vínculo da equipe" title="Contratos">
          <Legend
            items={contractMix.map((c) => ({
              label: c.label,
              value: c.value,
              maxValue: c.maxValue,
              color: c.color,
            }))}
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
          <p className="mt-4 text-muted-foreground text-xs">
            Intermitentes cobrem picos de sexta a domingo; PJ apenas para
            serviços especializados (contabilidade).
          </p>
        </ChartCard>
      </section>

      <EmployeeSheet employee={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
