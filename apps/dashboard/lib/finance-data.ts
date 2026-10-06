import type {
  FunnelStage,
  PieData,
  RadarData,
  RadarMetric,
  RingData,
  SankeyData,
} from "@bklitui/ui/charts";
import { palette, TODAY } from "./data";

/**
 * Financial model for the Finanças page. Every figure is derived from one
 * deterministic monthly series so DRE, margins, KPIs and charts agree.
 */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

function monthStart(offset: number) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth() - offset, 1);
}

export const monthLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

/* -------------------------------------------------------------------------- */
/* Série mensal (12 meses)                                                    */
/* -------------------------------------------------------------------------- */

const rnd = seeded(2026);

/** Sazonalidade de restaurante: alta em dez/jul, baixa em fev/mar. */
const SEASON = [
  0.86, 0.8, 0.84, 0.9, 0.95, 1.0, 1.08, 1.0, 0.96, 1.02, 1.06, 1.22,
];

export interface FinanceMonth {
  date: Date;
  label: string;
  grossRevenue: number;
  taxes: number;
  netRevenue: number;
  cmv: number;
  grossProfit: number;
  payroll: number;
  rent: number;
  utilities: number;
  marketing: number;
  maintenance: number;
  admin: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  financial: number;
  incomeTax: number;
  netIncome: number;
  cashBalance: number;
  /** Despesas totais (CMV + opex + depreciação + financeiro + IR + impostos). */
  expenses: number;
}

export const financeMonths: FinanceMonth[] = (() => {
  const months: FinanceMonth[] = [];
  let cash = 182_000;
  for (let i = 0; i < 12; i++) {
    const date = monthStart(11 - i);
    const season = SEASON[date.getMonth()] ?? 1;
    const growth = 1 + i * 0.012;
    const grossRevenue =
      Math.round((338_000 * season * growth + rnd() * 18_000) / 100) * 100;
    const taxes = Math.round(grossRevenue * 0.08);
    const netRevenue = grossRevenue - taxes;
    const cmv = Math.round(netRevenue * (0.3 + rnd() * 0.035));
    const grossProfit = netRevenue - cmv;
    const payroll = Math.round(92_000 + i * 380 + rnd() * 3000);
    const rent = 38_000;
    const utilities = Math.round(19_000 + season * 2600 + rnd() * 1500);
    // Campanha de inverno: marketing alto em um mês com prejuízo
    const marketing = Math.round(i === 4 ? 46_000 : 10_500 + rnd() * 3500);
    const maintenance = Math.round(i === 1 ? 31_000 : 6500 + rnd() * 3000);
    const admin = Math.round(9800 + rnd() * 1400);
    const opex = payroll + rent + utilities + marketing + maintenance + admin;
    const ebitda = grossProfit - opex;
    const depreciation = 6200;
    const financial = 3600 + Math.round(rnd() * 600);
    const ebt = ebitda - depreciation - financial;
    const incomeTax = ebt > 0 ? Math.round(ebt * 0.15) : 0;
    const netIncome = ebt - incomeTax;
    cash += netIncome + depreciation - 9500; // amortização de dívida
    months.push({
      date,
      label: monthLabel(date),
      grossRevenue,
      taxes,
      netRevenue,
      cmv,
      grossProfit,
      payroll,
      rent,
      utilities,
      marketing,
      maintenance,
      admin,
      opex,
      ebitda,
      depreciation,
      financial,
      incomeTax,
      netIncome,
      cashBalance: Math.round(cash),
      expenses: grossRevenue - netIncome,
    });
  }
  return months;
})();

export type FinancePeriod = "mes" | "trimestre" | "ano";

export const periodMonths: Record<FinancePeriod, number> = {
  mes: 1,
  trimestre: 3,
  ano: 12,
};

export const periodLabels: Record<FinancePeriod, string> = {
  mes: "Mês",
  trimestre: "Trimestre",
  ano: "12 meses",
};

type SummableKey = Exclude<
  keyof FinanceMonth,
  "date" | "label" | "cashBalance"
>;

function sumKey(months: FinanceMonth[], key: SummableKey) {
  return months.reduce((acc, m) => acc + m[key], 0);
}

/** Aggregates the trailing `n` months (and the `n` before that for trends). */
export function summarize(period: FinancePeriod) {
  const n = periodMonths[period];
  const current = financeMonths.slice(-n);
  const previous = financeMonths.slice(-2 * n, -n);
  const hasPrevious = previous.length > 0;
  const prevOrSame = hasPrevious ? previous : current;

  const agg = (months: FinanceMonth[]) => {
    const keys: SummableKey[] = [
      "grossRevenue",
      "taxes",
      "netRevenue",
      "cmv",
      "grossProfit",
      "payroll",
      "rent",
      "utilities",
      "marketing",
      "maintenance",
      "admin",
      "opex",
      "ebitda",
      "depreciation",
      "financial",
      "incomeTax",
      "netIncome",
      "expenses",
    ];
    return Object.fromEntries(
      keys.map((k) => [k, sumKey(months, k)])
    ) as Record<SummableKey, number>;
  };

  const cur = agg(current);
  const prev = agg(prevOrSame);
  const pct = (a: number, b: number) =>
    b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100;
  const margin = (v: number, base: number) =>
    base === 0 ? 0 : (v / base) * 100;

  const last = financeMonths.at(-1) as FinanceMonth;
  const prevLast =
    financeMonths.at(-1 - n) ?? (financeMonths[0] as FinanceMonth);

  return {
    months: current,
    ...cur,
    grossMargin: margin(cur.grossProfit, cur.netRevenue),
    ebitdaMargin: margin(cur.ebitda, cur.netRevenue),
    netMargin: margin(cur.netIncome, cur.netRevenue),
    cmvRatio: margin(cur.cmv, cur.netRevenue),
    // No comparable prior window (e.g. 12 months of history) → no trend badge.
    trends: hasPrevious
      ? {
          netRevenue: pct(cur.netRevenue, prev.netRevenue),
          netIncome: pct(cur.netIncome, prev.netIncome),
          opex: pct(cur.opex, prev.opex),
          ebitdaMargin:
            margin(cur.ebitda, cur.netRevenue) -
            margin(prev.ebitda, prev.netRevenue),
          cash: pct(last.cashBalance, prevLast.cashBalance),
        }
      : {
          netRevenue: undefined,
          netIncome: undefined,
          opex: undefined,
          ebitdaMargin: undefined,
          cash: pct(last.cashBalance, financeMonths[0]?.cashBalance ?? 1),
        },
    cashBalance: last.cashBalance,
  };
}

/** Série diária-like para sparklines (usa meses como pontos). */
export const sparkSeries = financeMonths.map((m) => ({
  date: m.date,
  netRevenue: m.netRevenue,
  netIncome: m.netIncome,
  ebitdaMargin: Math.round((m.ebitda / m.netRevenue) * 1000) / 10,
  cashBalance: m.cashBalance,
  opex: m.opex,
}));

/** Receita x despesas (área). */
export const revenueVsExpenses = financeMonths.map((m) => ({
  date: m.date,
  receita: m.netRevenue,
  despesas: m.cmv + m.opex,
}));

/** Resultado líquido mensal (lucro/prejuízo). */
export const netIncomeSeries = financeMonths.map((m) => ({
  date: m.date,
  resultado: m.netIncome,
}));

/* -------------------------------------------------------------------------- */
/* Indicadores fundamentais                                                   */
/* -------------------------------------------------------------------------- */

export const balance = {
  currentAssets: 486_000,
  currentLiabilities: 268_000,
  inventory: 41_000,
  totalDebt: 214_000,
  equity: 652_000,
  investedCapital: 1_120_000,
  receivables: 96_400,
  payables: 128_700,
  overdueReceivables: 6800,
  pmr: 12, // prazo médio de recebimento (dias)
  pmp: 31, // prazo médio de pagamento (dias)
  pme: 6, // prazo médio de estocagem (dias)
};

export function fundamentalIndicators() {
  const year = summarize("ano");
  const month = summarize("mes");
  const avgMonthlyFixed =
    (year.payroll +
      year.rent +
      year.utilities +
      year.admin +
      year.maintenance) /
    12;
  const contributionMargin = 1 - (year.cmv + year.taxes) / year.grossRevenue;
  const breakEven = avgMonthlyFixed / contributionMargin;
  const avgBurn = (year.opex + year.cmv + year.financial + year.taxes) / 12;

  return {
    currentRatio: balance.currentAssets / balance.currentLiabilities,
    quickRatio:
      (balance.currentAssets - balance.inventory) / balance.currentLiabilities,
    debtToEquity: (balance.totalDebt / balance.equity) * 100,
    roi: (year.netIncome / balance.investedCapital) * 100,
    roe: (year.netIncome / balance.equity) * 100,
    breakEven,
    breakEvenCoverage: (month.grossRevenue / breakEven) * 100,
    safetyMargin: ((month.grossRevenue - breakEven) / month.grossRevenue) * 100,
    runwayMonths: month.cashBalance / avgBurn,
    delinquency: (balance.overdueReceivables / balance.receivables) * 100,
    cashCycle: balance.pmr + balance.pme - balance.pmp,
    pmr: balance.pmr,
    pmp: balance.pmp,
    pme: balance.pme,
    receivables: balance.receivables,
    payables: balance.payables,
    workingCapital: balance.currentAssets - balance.currentLiabilities,
  };
}

/* -------------------------------------------------------------------------- */
/* DRE em cascata (funil)                                                     */
/* -------------------------------------------------------------------------- */

export function dreFunnel(period: FinancePeriod): FunnelStage[] {
  const s = summarize(period);
  const k = (v: number) =>
    `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
      Math.round(v / 1000)
    )} mil`;
  return [
    {
      label: "Receita bruta",
      value: s.grossRevenue,
      displayValue: k(s.grossRevenue),
    },
    {
      label: "Receita líquida",
      value: s.netRevenue,
      displayValue: k(s.netRevenue),
    },
    {
      label: "Lucro bruto",
      value: s.grossProfit,
      displayValue: k(s.grossProfit),
    },
    {
      label: "EBITDA",
      value: Math.max(s.ebitda, 0),
      displayValue: k(s.ebitda),
    },
    {
      label: "Lucro líquido",
      value: Math.max(s.netIncome, 0),
      displayValue: k(s.netIncome),
    },
  ];
}

/** Linhas da DRE para a tabela. */
export function dreRows(period: FinancePeriod) {
  const s = summarize(period);
  const base = s.netRevenue;
  const row = (
    label: string,
    value: number,
    kind: "total" | "minus" | "result" = "minus"
  ) => ({ label, value, share: base === 0 ? 0 : (value / base) * 100, kind });
  return [
    row("Receita bruta", s.grossRevenue, "total"),
    row("(−) Impostos sobre vendas", -s.taxes),
    row("Receita líquida", s.netRevenue, "total"),
    row("(−) CMV (insumos)", -s.cmv),
    row("Lucro bruto", s.grossProfit, "result"),
    row("(−) Folha de pagamento", -s.payroll),
    row("(−) Aluguel e condomínio", -s.rent),
    row("(−) Energia, gás e água", -s.utilities),
    row("(−) Marketing", -s.marketing),
    row("(−) Manutenção", -s.maintenance),
    row("(−) Administrativas", -s.admin),
    row("EBITDA", s.ebitda, "result"),
    row("(−) Depreciação", -s.depreciation),
    row("(−) Resultado financeiro", -s.financial),
    row("(−) IR / CSLL", -s.incomeTax),
    row("Lucro líquido", s.netIncome, "result"),
  ];
}

/* -------------------------------------------------------------------------- */
/* Composição de despesas e orçamento                                         */
/* -------------------------------------------------------------------------- */

export function expenseBreakdown(period: FinancePeriod): PieData[] {
  const s = summarize(period);
  return [
    { label: "Insumos (CMV)", value: s.cmv, color: palette.brasa },
    { label: "Folha de pagamento", value: s.payroll, color: palette.teal },
    { label: "Aluguel", value: s.rent, color: palette.amber },
    { label: "Utilidades", value: s.utilities, color: palette.violet },
    { label: "Marketing", value: s.marketing, color: palette.green },
    {
      label: "Manutenção + adm.",
      value: s.maintenance + s.admin,
      color: palette.stone,
    },
  ];
}

/** Orçado x realizado do mês corrente. */
export const budgetLines = (() => {
  const m = financeMonths.at(-1) as FinanceMonth;
  return [
    {
      label: "Insumos (CMV)",
      value: m.cmv,
      maxValue: 124_000,
      color: palette.brasa,
    },
    { label: "Folha", value: m.payroll, maxValue: 98_000, color: palette.teal },
    { label: "Aluguel", value: m.rent, maxValue: 38_000, color: palette.amber },
    {
      label: "Utilidades",
      value: m.utilities,
      maxValue: 24_000,
      color: palette.violet,
    },
    {
      label: "Marketing",
      value: m.marketing,
      maxValue: 15_000,
      color: palette.green,
    },
    {
      label: "Manutenção",
      value: m.maintenance,
      maxValue: 9000,
      color: palette.stone,
    },
  ];
})();

export const budgetRing: RingData[] = (() => {
  const m = financeMonths.at(-1) as FinanceMonth;
  return [
    {
      label: "Receita",
      value: m.netRevenue / 1000,
      maxValue: 420,
      color: palette.brasa,
    },
    {
      label: "Despesas",
      value: (m.cmv + m.opex) / 1000,
      maxValue: 330,
      color: palette.teal,
    },
    {
      label: "Lucro",
      value: Math.max(m.netIncome, 0) / 1000,
      maxValue: 70,
      color: palette.amber,
    },
  ];
})();

/* -------------------------------------------------------------------------- */
/* Caixa                                                                      */
/* -------------------------------------------------------------------------- */

export const cashBalanceSeries = financeMonths.map((m) => ({
  date: m.date,
  caixa: m.cashBalance,
}));

/** Reserva mínima recomendada: 2 meses de custos fixos. */
export const minimumReserve = (() => {
  const m = financeMonths.at(-1) as FinanceMonth;
  return (
    Math.round(((m.payroll + m.rent + m.utilities + m.admin) * 2) / 1000) * 1000
  );
})();

export function cashFlowSankey(period: FinancePeriod): SankeyData {
  const s = summarize(period);
  const salao = Math.round(s.grossRevenue * 0.57);
  const delivery = Math.round(s.grossRevenue * 0.29);
  const eventos = s.grossRevenue - salao - delivery;
  const fixed = s.rent + s.utilities + s.admin + s.maintenance;
  const other = s.marketing + s.financial + s.depreciation;
  const result = Math.max(
    s.grossRevenue - s.taxes - s.cmv - s.payroll - fixed - other - s.incomeTax,
    1
  );
  return {
    nodes: [
      { name: "Salão", category: "source" },
      { name: "Delivery", category: "source" },
      { name: "Eventos", category: "source" },
      { name: "Caixa", category: "landing" },
      { name: "Insumos", category: "outcome" },
      { name: "Folha", category: "outcome" },
      { name: "Custos fixos", category: "outcome" },
      { name: "Impostos", category: "outcome" },
      { name: "Outras", category: "outcome" },
      { name: "Resultado", category: "outcome" },
    ],
    links: [
      { source: 0, target: 3, value: salao },
      { source: 1, target: 3, value: delivery },
      { source: 2, target: 3, value: eventos },
      { source: 3, target: 4, value: s.cmv },
      { source: 3, target: 5, value: s.payroll },
      { source: 3, target: 6, value: fixed },
      { source: 3, target: 7, value: s.taxes + s.incomeTax },
      { source: 3, target: 8, value: other },
      { source: 3, target: 9, value: result },
    ],
  };
}

/** Recebimentos x pagamentos previstos nas próximas 6 semanas. */
const weekRnd = seeded(77);
export const weeklyCashForecast = Array.from({ length: 6 }, (_, i) => ({
  week: `Sem ${i + 1}`,
  recebimentos: Math.round(
    78_000 + weekRnd() * 24_000 + (i === 4 ? 18_000 : 0)
  ),
  pagamentos: Math.round(70_000 + weekRnd() * 26_000 + (i === 0 ? 22_000 : 0)),
}));

/** Aging de contas a receber (R$). */
export const receivablesAging = [
  { faixa: "A vencer", valor: 71_200 },
  { faixa: "1–30 dias", valor: 15_100 },
  { faixa: "31–60 dias", valor: 5400 },
  { faixa: "61–90 dias", valor: 3100 },
  { faixa: "+90 dias", valor: 1600 },
];

export const receivablesByChannel = financeMonths.slice(-6).map((m) => ({
  month: m.label,
  salao: Math.round(m.grossRevenue * 0.57),
  delivery: Math.round(m.grossRevenue * 0.29),
  eventos: Math.round(m.grossRevenue * 0.14),
}));

/* -------------------------------------------------------------------------- */
/* Saúde financeira (radar, 0–100)                                            */
/* -------------------------------------------------------------------------- */

export const healthMetrics: RadarMetric[] = [
  { key: "liquidez", label: "Liquidez" },
  { key: "rentabilidade", label: "Rentabilidade" },
  { key: "eficiencia", label: "Eficiência" },
  { key: "crescimento", label: "Crescimento" },
  { key: "solvencia", label: "Solvência" },
  { key: "caixa", label: "Geração de caixa" },
];

export const healthScores: RadarData[] = [
  {
    label: "Atual",
    color: palette.brasa,
    values: {
      liquidez: 78,
      rentabilidade: 64,
      eficiencia: 71,
      crescimento: 82,
      solvencia: 69,
      caixa: 74,
    },
  },
  {
    label: "Meta",
    color: palette.green,
    values: {
      liquidez: 85,
      rentabilidade: 80,
      eficiencia: 80,
      crescimento: 75,
      solvencia: 80,
      caixa: 85,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Contas e lançamentos                                                       */
/* -------------------------------------------------------------------------- */

function inDays(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
}

export type BillStatus = "Pago" | "Pendente" | "Atrasado" | "Agendado";

export interface Bill {
  description: string;
  supplier: string;
  due: Date;
  amount: number;
  status: BillStatus;
  kind: "pagar" | "receber";
}

export const bills: Bill[] = [
  {
    description: "Carnes — pedido semanal",
    supplier: "Frigorífico Sul",
    due: inDays(-2),
    amount: 18_420,
    status: "Atrasado",
    kind: "pagar",
  },
  {
    description: "Aluguel outubro",
    supplier: "Imobiliária Centro",
    due: inDays(3),
    amount: 38_000,
    status: "Agendado",
    kind: "pagar",
  },
  {
    description: "Folha — 2ª quinzena",
    supplier: "Equipe",
    due: inDays(5),
    amount: 47_900,
    status: "Pendente",
    kind: "pagar",
  },
  {
    description: "Energia elétrica",
    supplier: "Distribuidora",
    due: inDays(8),
    amount: 9870,
    status: "Pendente",
    kind: "pagar",
  },
  {
    description: "Hortifruti",
    supplier: "Verde Vale",
    due: inDays(-6),
    amount: 4310,
    status: "Pago",
    kind: "pagar",
  },
  {
    description: "Repasse iFood",
    supplier: "iFood",
    due: inDays(2),
    amount: 31_240,
    status: "Agendado",
    kind: "receber",
  },
  {
    description: "Evento corporativo",
    supplier: "Acme Ltda.",
    due: inDays(-12),
    amount: 6800,
    status: "Atrasado",
    kind: "receber",
  },
  {
    description: "Cartões — D+30",
    supplier: "Adquirente",
    due: inDays(1),
    amount: 58_300,
    status: "Pendente",
    kind: "receber",
  },
  {
    description: "Buffet casamento",
    supplier: "Família Prado",
    due: inDays(14),
    amount: 22_500,
    status: "Pendente",
    kind: "receber",
  },
];

export const ledger = [
  {
    date: inDays(0),
    description: "Vendas salão — maquininha",
    category: "Receita",
    account: "Itaú",
    amount: 18_240,
  },
  {
    date: inDays(0),
    description: "Frigorífico Sul — NF 8812",
    category: "CMV",
    account: "Itaú",
    amount: -8420,
  },
  {
    date: inDays(-1),
    description: "Repasse iFood",
    category: "Receita",
    account: "Nubank PJ",
    amount: 12_380,
  },
  {
    date: inDays(-1),
    description: "Conta de gás",
    category: "Utilidades",
    account: "Itaú",
    amount: -2870,
  },
  {
    date: inDays(-2),
    description: "Evento corporativo — sinal",
    category: "Receita",
    account: "Itaú",
    amount: 9600,
  },
  {
    date: inDays(-2),
    description: "Campanha Instagram",
    category: "Marketing",
    account: "Cartão PJ",
    amount: -1900,
  },
  {
    date: inDays(-3),
    description: "Manutenção coifa",
    category: "Manutenção",
    account: "Itaú",
    amount: -1450,
  },
  {
    date: inDays(-3),
    description: "Adiantamento salarial",
    category: "Folha",
    account: "Itaú",
    amount: -21_500,
  },
];
