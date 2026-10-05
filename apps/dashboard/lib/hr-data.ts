import type {
  FunnelStage,
  HeatmapColumn,
  PieData,
  RadarData,
  RadarMetric,
  RingData,
} from "@bklitui/ui/charts";
import { palette, TODAY } from "./data";

/** HR mock data for the Recursos Humanos page (deterministic). */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

const monthLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

/* -------------------------------------------------------------------------- */
/* Colaboradores                                                              */
/* -------------------------------------------------------------------------- */

export const SECTORS = [
  "Cozinha",
  "Salão",
  "Bar",
  "Delivery",
  "Administrativo",
] as const;
export type Sector = (typeof SECTORS)[number];

export const STATUSES = [
  "Ativo",
  "Férias",
  "Afastado",
  "Experiência",
  "Aviso prévio",
] as const;
export type EmployeeStatus = (typeof STATUSES)[number];

export type Contract = "CLT" | "Intermitente" | "Estágio" | "PJ";
export type Shift = "Manhã" | "Almoço" | "Tarde" | "Noite" | "Comercial";

export interface Employee {
  id: string;
  name: string;
  role: string;
  sector: Sector;
  admission: Date;
  salary: number;
  status: EmployeeStatus;
  shift: Shift;
  contract: Contract;
  /** Avaliação de desempenho 0–100. */
  performance: number;
  hoursMonth: number;
  overtime: number;
  absences: number;
  birthday: Date;
  email: string;
  phone: string;
  /** Pontuação por competência (0–100) para o radar individual. */
  skills: Record<string, number>;
}

type EmployeeSeed = [
  name: string,
  role: string,
  sector: Sector,
  admissionISO: string,
  salary: number,
  status: EmployeeStatus,
  shift: Shift,
  contract: Contract,
  performance: number,
  birthdayMonthDay: string,
];

const SEEDS: EmployeeSeed[] = [
  [
    "Ana Souza",
    "Chef executiva",
    "Cozinha",
    "2019-03-11",
    9800,
    "Ativo",
    "Noite",
    "CLT",
    94,
    "10-12",
  ],
  [
    "Bruno Lima",
    "Sous-chef",
    "Cozinha",
    "2021-06-02",
    6200,
    "Ativo",
    "Tarde",
    "CLT",
    88,
    "01-23",
  ],
  [
    "Rafael Costa",
    "Cozinheiro",
    "Cozinha",
    "2022-08-15",
    3400,
    "Ativo",
    "Noite",
    "CLT",
    81,
    "10-08",
  ],
  [
    "Juliana Alves",
    "Confeiteira",
    "Cozinha",
    "2023-02-20",
    3600,
    "Férias",
    "Manhã",
    "CLT",
    86,
    "07-30",
  ],
  [
    "Marcos Pereira",
    "Auxiliar de cozinha",
    "Cozinha",
    "2026-08-12",
    2100,
    "Experiência",
    "Almoço",
    "CLT",
    72,
    "12-03",
  ],
  [
    "Thiago Santos",
    "Steward",
    "Cozinha",
    "2024-04-01",
    1950,
    "Ativo",
    "Noite",
    "Intermitente",
    69,
    "05-17",
  ],
  [
    "Carla Mendes",
    "Maître",
    "Salão",
    "2020-01-07",
    5200,
    "Férias",
    "Noite",
    "CLT",
    92,
    "03-14",
  ],
  [
    "Elisa Torres",
    "Garçonete",
    "Salão",
    "2026-07-29",
    2300,
    "Experiência",
    "Almoço",
    "CLT",
    78,
    "10-19",
  ],
  [
    "Pedro Martins",
    "Garçom",
    "Salão",
    "2022-11-03",
    2400,
    "Ativo",
    "Noite",
    "CLT",
    83,
    "09-02",
  ],
  [
    "Larissa Rocha",
    "Hostess",
    "Salão",
    "2024-09-16",
    2200,
    "Ativo",
    "Noite",
    "CLT",
    87,
    "11-27",
  ],
  [
    "Gustavo Ribeiro",
    "Cumim",
    "Salão",
    "2025-05-05",
    1850,
    "Aviso prévio",
    "Almoço",
    "CLT",
    58,
    "02-09",
  ],
  [
    "Diego Rocha",
    "Bartender",
    "Bar",
    "2022-03-21",
    3200,
    "Ativo",
    "Noite",
    "CLT",
    90,
    "06-11",
  ],
  [
    "Camila Freitas",
    "Barista",
    "Bar",
    "2025-10-13",
    2300,
    "Ativo",
    "Manhã",
    "CLT",
    84,
    "10-25",
  ],
  [
    "Felipe Nunes",
    "Entregador",
    "Delivery",
    "2023-07-10",
    2000,
    "Afastado",
    "Noite",
    "CLT",
    74,
    "04-04",
  ],
  [
    "Lucas Oliveira",
    "Entregador",
    "Delivery",
    "2024-12-02",
    2000,
    "Ativo",
    "Noite",
    "Intermitente",
    80,
    "08-21",
  ],
  [
    "Gabriela Reis",
    "Gerente administrativa",
    "Administrativo",
    "2018-05-14",
    8200,
    "Ativo",
    "Comercial",
    "CLT",
    93,
    "10-31",
  ],
  [
    "Sofia Duarte",
    "Assistente de RH",
    "Administrativo",
    "2026-02-02",
    3100,
    "Ativo",
    "Comercial",
    "Estágio",
    85,
    "01-15",
  ],
  [
    "Henrique Prado",
    "Contador",
    "Administrativo",
    "2021-09-01",
    6500,
    "Ativo",
    "Comercial",
    "PJ",
    89,
    "07-07",
  ],
];

const rnd = seeded(31_415);

export const employees: Employee[] = SEEDS.map((seed, i) => {
  const [
    name,
    role,
    sector,
    admissionISO,
    salary,
    status,
    shift,
    contract,
    performance,
    bday,
  ] = seed;
  const [y, m, d] = admissionISO.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [bm, bd] = bday.split("-").map(Number) as [number, number];
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".");
  const away = status === "Férias" || status === "Afastado";
  const base = (v: number) =>
    Math.min(100, Math.max(35, Math.round(performance + v)));
  return {
    id: `C${String(1001 + i)}`,
    name,
    role,
    sector,
    admission: new Date(y, m - 1, d),
    salary,
    status,
    shift,
    contract,
    performance,
    hoursMonth: away ? Math.round(rnd() * 40) : Math.round(168 + rnd() * 30),
    overtime: away ? 0 : Math.round(rnd() * 22),
    absences: Math.round(rnd() * (performance < 75 ? 5 : 2)),
    birthday: new Date(TODAY.getFullYear(), bm - 1, bd),
    email: `${slug}@casabrasa.com.br`,
    phone: `(11) 9${String(8100 + i * 37).padStart(4, "0")}-${String(1200 + i * 211).slice(0, 4)}`,
    skills: {
      tecnica: base(rnd() * 10 - 4),
      agilidade: base(rnd() * 14 - 8),
      atendimento: base(sector === "Salão" || sector === "Bar" ? 6 : -10),
      pontualidade: base(rnd() * 12 - 6),
      equipe: base(rnd() * 10 - 3),
    },
  };
});

export const skillMetrics: RadarMetric[] = [
  { key: "tecnica", label: "Técnica" },
  { key: "agilidade", label: "Agilidade" },
  { key: "atendimento", label: "Atendimento" },
  { key: "pontualidade", label: "Pontualidade" },
  { key: "equipe", label: "Equipe" },
];

export function initials(name: string) {
  const parts = name.split(" ");
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function tenure(admission: Date) {
  const months =
    (TODAY.getFullYear() - admission.getFullYear()) * 12 +
    (TODAY.getMonth() - admission.getMonth());
  if (months < 12) {
    return `${Math.max(months, 0)} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "ano" : "anos"}`;
}

/* -------------------------------------------------------------------------- */
/* Indicadores                                                                */
/* -------------------------------------------------------------------------- */

const ENCARGOS = 0.368; // INSS patronal + FGTS + RAT/terceiros (aprox.)
const BENEFICIOS_PER_CAPITA = 980; // VR + VT + plano de saúde

export const hrSummary = (() => {
  const active = employees.filter((e) => e.status !== "Aviso prévio");
  const salaries = employees.reduce((a, e) => a + e.salary, 0);
  const encargos = Math.round(
    employees
      .filter((e) => e.contract === "CLT")
      .reduce((a, e) => a + e.salary, 0) * ENCARGOS
  );
  const beneficios = employees.length * BENEFICIOS_PER_CAPITA;
  const overtimeHours = employees.reduce((a, e) => a + e.overtime, 0);
  const overtimeCost = Math.round(
    employees.reduce((a, e) => a + (e.salary / 220) * 1.5 * e.overtime, 0)
  );
  const provisoes = Math.round(salaries * (1 / 12 + 1 / 12 / 3 + 1 / 12));
  const payroll = salaries + encargos + beneficios + overtimeCost + provisoes;
  const absences = employees.reduce((a, e) => a + e.absences, 0);
  const workdays = employees.length * 22;
  return {
    headcount: employees.length,
    active: active.length,
    onVacation: employees.filter((e) => e.status === "Férias").length,
    onLeave: employees.filter((e) => e.status === "Afastado").length,
    probation: employees.filter((e) => e.status === "Experiência").length,
    salaries,
    encargos,
    beneficios,
    overtimeCost,
    overtimeHours,
    provisoes,
    payroll,
    payrollPerCapita: payroll / employees.length,
    avgSalary: salaries / employees.length,
    absenteeism: (absences / workdays) * 100,
    turnover: 3.9,
    turnoverTrend: -0.8,
    enps: 64,
    avgPerformance:
      employees.reduce((a, e) => a + e.performance, 0) / employees.length,
    avgTenureYears:
      employees.reduce(
        (a, e) =>
          a + (TODAY.getTime() - e.admission.getTime()) / 31_557_600_000,
        0
      ) / employees.length,
    payrollOverRevenue: 26.8,
  };
})();

/** Composição da folha (rosca). */
export const payrollComposition: PieData[] = [
  { label: "Salários", value: hrSummary.salaries, color: palette.brasa },
  {
    label: "Encargos (INSS/FGTS)",
    value: hrSummary.encargos,
    color: palette.teal,
  },
  { label: "Benefícios", value: hrSummary.beneficios, color: palette.amber },
  {
    label: "Provisões 13º/férias",
    value: hrSummary.provisoes,
    color: palette.violet,
  },
  {
    label: "Horas extras",
    value: hrSummary.overtimeCost,
    color: palette.green,
  },
];

/* -------------------------------------------------------------------------- */
/* Séries                                                                     */
/* -------------------------------------------------------------------------- */

const hcRnd = seeded(2718);
/** Headcount, admissões e desligamentos — 12 meses. */
export const headcountSeries = (() => {
  let hc = 15;
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(TODAY.getFullYear(), TODAY.getMonth() - 11 + i, 1);
    const hires = Math.round(hcRnd() * 2.4 + (i === 7 || i === 9 ? 1 : 0));
    const terminations = Math.round(hcRnd() * 1.6);
    hc = Math.max(12, hc + hires - terminations);
    if (i === 11) {
      hc = employees.length;
    }
    return {
      date,
      label: monthLabel(date),
      headcount: hc,
      admissoes: hires,
      desligamentos: terminations,
      turnover: Math.round(((hires + terminations) / 2 / hc) * 1000) / 10,
    };
  });
})();

export const teamBySector: PieData[] = SECTORS.map((sector, i) => ({
  label: sector,
  value: employees.filter((e) => e.sector === sector).length,
  color: [
    palette.brasa,
    palette.teal,
    palette.amber,
    palette.violet,
    palette.green,
  ][i],
}));

export const contractMix = (
  ["CLT", "Intermitente", "Estágio", "PJ"] as Contract[]
).map((c, i) => ({
  label: c,
  value: employees.filter((e) => e.contract === c).length,
  maxValue: employees.length,
  color:
    [palette.brasa, palette.teal, palette.amber, palette.violet][i] ??
    palette.stone,
}));

/** Horas extras por setor — 6 meses. */
export const overtimeBySector = headcountSeries.slice(-6).map((m, i) => ({
  month: m.label,
  cozinha: 58 + ((i * 17) % 30),
  salao: 36 + ((i * 11) % 24),
  bar: 12 + ((i * 7) % 12),
  delivery: 8 + ((i * 5) % 10),
}));

/** Salário médio por cargo (faixas). */
export const salaryByRole = [
  { cargo: "Chef", salario: 9800 },
  { cargo: "Gerência", salario: 8200 },
  { cargo: "Sous-chef", salario: 6200 },
  { cargo: "Maître", salario: 5200 },
  { cargo: "Cozinheiro", salario: 3500 },
  { cargo: "Bartender", salario: 3200 },
  { cargo: "Garçom", salario: 2350 },
  { cargo: "Auxiliar", salario: 2000 },
];

export const turnoverReasons: PieData[] = [
  { label: "Proposta melhor", value: 5, color: palette.brasa },
  { label: "Horário/escala", value: 4, color: palette.teal },
  { label: "Desempenho", value: 3, color: palette.amber },
  { label: "Mudança de cidade", value: 2, color: palette.violet },
  { label: "Fim de contrato", value: 2, color: palette.green },
];

const tipsRnd = seeded(1618);
/** Horas trabalhadas x gorjetas distribuídas por dia (30 dias). */
export const tipsAndHours = Array.from({ length: 30 }, (_, i) => {
  const date = addDays(TODAY, i - 29);
  const weekend = [0, 5, 6].includes(date.getDay());
  return {
    date,
    gorjetas: Math.round((weekend ? 2600 : 1400) + tipsRnd() * 900),
    horas: Math.round((weekend ? 2300 : 1700) + tipsRnd() * 500),
  };
});

const absRnd = seeded(4242);
/** Faltas/atrasos por dia (26 semanas), intensidade 0–4. */
export const absenceHeatmap: HeatmapColumn[] = (() => {
  const columns: HeatmapColumn[] = [];
  const start = addDays(TODAY, -TODAY.getDay() - 25 * 7);
  const cursor = new Date(start);
  for (let week = 0; week < 26; week++) {
    const bins = Array.from({ length: 7 }, (_, day) => {
      const date = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      if (date > TODAY) {
        return { bin: day, count: 0, date };
      }
      const monday = day === 1;
      const weekend = day === 0 || day === 6;
      const v = absRnd();
      let count = 0;
      if (v > 0.55) {
        count = 1;
      }
      if (v > 0.8) {
        count = 2;
      }
      if (v > 0.93 || (weekend && v > 0.7)) {
        count = 3;
      }
      if (monday && v > 0.85) {
        count = 4;
      }
      return { bin: day, count, date };
    });
    columns.push({ bin: week, bins });
  }
  return columns;
})();

/* -------------------------------------------------------------------------- */
/* Desempenho e desenvolvimento                                               */
/* -------------------------------------------------------------------------- */

export const performanceMetrics: RadarMetric[] = [
  { key: "agilidade", label: "Agilidade" },
  { key: "qualidade", label: "Qualidade" },
  { key: "atendimento", label: "Atendimento" },
  { key: "pontualidade", label: "Pontualidade" },
  { key: "higiene", label: "Higiene" },
  { key: "equipe", label: "Trabalho em equipe" },
];

export const teamPerformance: RadarData[] = [
  {
    label: "Cozinha",
    color: palette.brasa,
    values: {
      agilidade: 82,
      qualidade: 94,
      atendimento: 60,
      pontualidade: 88,
      higiene: 96,
      equipe: 85,
    },
  },
  {
    label: "Salão",
    color: palette.teal,
    values: {
      agilidade: 78,
      qualidade: 80,
      atendimento: 95,
      pontualidade: 76,
      higiene: 84,
      equipe: 90,
    },
  },
  {
    label: "Bar",
    color: palette.amber,
    values: {
      agilidade: 90,
      qualidade: 86,
      atendimento: 84,
      pontualidade: 70,
      higiene: 80,
      equipe: 74,
    },
  },
];

/** Distribuição das notas da última avaliação (9-box simplificado). */
export const performanceDistribution = [
  {
    faixa: "Abaixo",
    pessoas: employees.filter((e) => e.performance < 70).length,
  },
  {
    faixa: "Em desenv.",
    pessoas: employees.filter((e) => e.performance >= 70 && e.performance < 80)
      .length,
  },
  {
    faixa: "Atende",
    pessoas: employees.filter((e) => e.performance >= 80 && e.performance < 88)
      .length,
  },
  {
    faixa: "Supera",
    pessoas: employees.filter((e) => e.performance >= 88 && e.performance < 93)
      .length,
  },
  {
    faixa: "Destaque",
    pessoas: employees.filter((e) => e.performance >= 93).length,
  },
];

export const trainings: RingData[] = [
  {
    label: "Boas práticas (ANVISA)",
    value: 16,
    maxValue: 18,
    color: palette.brasa,
  },
  { label: "Segurança e NR", value: 13, maxValue: 18, color: palette.teal },
  { label: "Atendimento", value: 9, maxValue: 12, color: palette.amber },
  {
    label: "Vinhos e harmonização",
    value: 3,
    maxValue: 6,
    color: palette.violet,
  },
];

export const trainingCatalog = [
  {
    name: "Boas práticas de manipulação",
    hours: 8,
    due: addDays(TODAY, 12),
    mandatory: true,
    enrolled: 18,
    done: 16,
  },
  {
    name: "Brigada de incêndio",
    hours: 4,
    due: addDays(TODAY, 20),
    mandatory: true,
    enrolled: 6,
    done: 2,
  },
  {
    name: "Atendimento de excelência",
    hours: 6,
    due: addDays(TODAY, 30),
    mandatory: false,
    enrolled: 12,
    done: 9,
  },
  {
    name: "Harmonização de vinhos",
    hours: 10,
    due: addDays(TODAY, 45),
    mandatory: false,
    enrolled: 6,
    done: 3,
  },
];

export const enpsBreakdown = [
  { label: "Promotores", value: 12, maxValue: 18, color: palette.brasa },
  { label: "Neutros", value: 4, maxValue: 18, color: palette.amber },
  { label: "Detratores", value: 2, maxValue: 18, color: palette.stone },
];

/* -------------------------------------------------------------------------- */
/* Recrutamento                                                               */
/* -------------------------------------------------------------------------- */

export const recruitmentFunnel: FunnelStage[] = [
  { label: "Candidaturas", value: 248, displayValue: "248" },
  { label: "Triagem", value: 96, displayValue: "96" },
  { label: "Entrevista", value: 38, displayValue: "38" },
  { label: "Teste prático", value: 17, displayValue: "17" },
  { label: "Contratados", value: 6, displayValue: "6" },
];

export const openPositions = [
  {
    role: "Cozinheiro(a) de linha",
    sector: "Cozinha" as Sector,
    candidates: 42,
    stage: 3,
    openedDays: 12,
    urgency: "Alta" as const,
  },
  {
    role: "Garçom/Garçonete",
    sector: "Salão" as Sector,
    candidates: 64,
    stage: 2,
    openedDays: 6,
    urgency: "Média" as const,
  },
  {
    role: "Entregador (moto)",
    sector: "Delivery" as Sector,
    candidates: 29,
    stage: 4,
    openedDays: 18,
    urgency: "Alta" as const,
  },
  {
    role: "Sommelier",
    sector: "Bar" as Sector,
    candidates: 8,
    stage: 1,
    openedDays: 3,
    urgency: "Baixa" as const,
  },
];

export const RECRUITMENT_STAGES = [
  "Triagem",
  "Entrevista",
  "Teste prático",
  "Proposta",
] as const;

export const candidates = [
  {
    name: "Mariana Lopes",
    role: "Cozinheiro(a) de linha",
    stage: "Teste prático",
    score: 86,
    source: "Indicação",
  },
  {
    name: "João Vitor",
    role: "Cozinheiro(a) de linha",
    stage: "Entrevista",
    score: 78,
    source: "LinkedIn",
  },
  {
    name: "Patrícia Gomes",
    role: "Garçom/Garçonete",
    stage: "Triagem",
    score: 71,
    source: "Site",
  },
  {
    name: "Renan Moraes",
    role: "Garçom/Garçonete",
    stage: "Entrevista",
    score: 82,
    source: "Indeed",
  },
  {
    name: "Aline Barros",
    role: "Entregador (moto)",
    stage: "Proposta",
    score: 90,
    source: "Indicação",
  },
  {
    name: "Caio Teixeira",
    role: "Entregador (moto)",
    stage: "Teste prático",
    score: 74,
    source: "Site",
  },
  {
    name: "Beatriz Melo",
    role: "Sommelier",
    stage: "Triagem",
    score: 88,
    source: "LinkedIn",
  },
  {
    name: "Otávio Reis",
    role: "Garçom/Garçonete",
    stage: "Proposta",
    score: 84,
    source: "Indeed",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Escala e ponto                                                             */
/* -------------------------------------------------------------------------- */

export const WEEKDAYS = [
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
  "Dom",
] as const;

const shiftRnd = seeded(8080);
/** Escala semanal: para cada colaborador, turno por dia (null = folga). */
export const weeklySchedule = employees
  .filter((e) => e.status !== "Férias" && e.status !== "Afastado")
  .map((e) => {
    const dayOff = Math.floor(shiftRnd() * 3); // Seg, Ter ou Qua
    return {
      id: e.id,
      name: e.name,
      sector: e.sector,
      days: WEEKDAYS.map((_, d) => (d === dayOff ? null : e.shift)),
    };
  });

export const shiftTimes: Record<Shift, string> = {
  Manhã: "07h–15h",
  Almoço: "10h–16h",
  Tarde: "14h–22h",
  Noite: "16h–00h",
  Comercial: "09h–18h",
};

/** Ponto de hoje. */
export const timeClock = employees
  .filter(
    (e) =>
      e.status === "Ativo" ||
      e.status === "Experiência" ||
      e.status === "Aviso prévio"
  )
  .slice(0, 10)
  .map((e, i) => {
    const expected = {
      Manhã: "07:00",
      Almoço: "10:00",
      Tarde: "14:00",
      Noite: "16:00",
      Comercial: "09:00",
    }[e.shift];
    const [hh, mm] = expected.split(":").map(Number) as [number, number];
    const delay = [0, 3, 0, 12, 0, -2, 0, 25, 0, 0][i] ?? 0;
    const absent = i === 6;
    const t = new Date(TODAY);
    t.setHours(hh, mm + delay);
    let status: "No horário" | "Atraso" | "Ausente" | "Aguardando" =
      "No horário";
    if (absent) {
      status = "Ausente";
    } else if (delay > 5) {
      status = "Atraso";
    }
    if (e.shift === "Noite" && !absent) {
      status = "Aguardando";
    }
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      expected,
      clockIn:
        status === "Ausente" || status === "Aguardando"
          ? null
          : t.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
      status,
    };
  });

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

export const upcomingEvents = [
  {
    date: addDays(TODAY, 3),
    title: "Fim do período de experiência",
    who: "Marcos Pereira",
    kind: "Experiência",
  },
  {
    date: addDays(TODAY, 5),
    title: "Retorno de férias",
    who: "Juliana Alves",
    kind: "Férias",
  },
  {
    date: addDays(TODAY, 7),
    title: "Aniversário",
    who: "Ana Souza",
    kind: "Aniversário",
  },
  {
    date: addDays(TODAY, 9),
    title: "Exame periódico (ASO)",
    who: "Equipe da cozinha",
    kind: "Saúde",
  },
  {
    date: addDays(TODAY, 14),
    title: "Avaliação de desempenho Q4",
    who: "Todos os setores",
    kind: "Avaliação",
  },
  {
    date: addDays(TODAY, 20),
    title: "Início das férias",
    who: "Pedro Martins",
    kind: "Férias",
  },
  {
    date: addDays(TODAY, 26),
    title: "Aniversário",
    who: "Gabriela Reis",
    kind: "Aniversário",
  },
] as const;
