import type {
  FunnelStage,
  HeatmapColumn,
  OHLCDataPoint,
  PieData,
  RadarData,
  RadarMetric,
  RingData,
  SankeyData,
  SunburstNode,
} from "@bklitui/ui/charts";

/**
 * Mock data for the "Casa Brasa" restaurant dashboard.
 * Everything is deterministic (seeded) so static export + hydration match.
 */

export const RESTAURANT_NAME = "Casa Brasa";

/** Fixed "today" so the static build is reproducible. */
export const TODAY = new Date(2026, 9, 5);

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

function daysAgo(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

function monthsAgo(n: number) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth() - n, 1);
}

/** Monochrome (black) ramp, Bklit-style. */
export const palette = {
  brasa: "oklch(0.08 0 0)",
  teal: "oklch(0.2 0 0)",
  amber: "oklch(0.3 0 0)",
  violet: "oklch(0.4 0 0)",
  green: "oklch(0.5 0 0)",
  rose: "oklch(0.25 0 0)",
  sky: "oklch(0.5 0 0)",
  stone: "oklch(0.6 0 0)",
};

/* -------------------------------------------------------------------------- */
/* Visão geral                                                                */
/* -------------------------------------------------------------------------- */

const dailyRandom = seeded(42);

/** Últimos 30 dias: faturamento e pedidos. */
export const dailySales = Array.from({ length: 30 }, (_, i) => {
  const date = daysAgo(29 - i);
  const weekday = date.getDay();
  const weekend = weekday === 0 || weekday === 5 || weekday === 6;
  const base = weekend ? 16_500 : 10_800;
  const revenue = Math.round(base + dailyRandom() * 4200 + i * 45);
  const orders = Math.round(revenue / (78 + dailyRandom() * 14));
  return { date, revenue, orders, ticket: Math.round(revenue / orders) };
});

export const overviewStats = {
  revenue: dailySales.reduce((a, d) => a + d.revenue, 0),
  orders: dailySales.reduce((a, d) => a + d.orders, 0),
  get ticket() {
    return Math.round(this.revenue / this.orders);
  },
  occupancy: 78,
  revenueTrend: 8.4,
  ordersTrend: 5.1,
  ticketTrend: 3.2,
  occupancyTrend: -1.6,
  rating: 4.7,
};

/** Pedidos por hora no dia (para o mapa de calor semanal). */
const heatRandom = seeded(7);
export const weeklyTrafficHeatmap: HeatmapColumn[] = (() => {
  // 26 semanas, 7 dias, contagem de clientes
  const columns: HeatmapColumn[] = [];
  const start = new Date(TODAY);
  start.setDate(start.getDate() - start.getDay() - 25 * 7);
  const cursor = new Date(start);
  for (let week = 0; week < 26; week++) {
    const bins = Array.from({ length: 7 }, (_, day) => {
      const date = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      if (date > TODAY) {
        return { bin: day, count: 0, date };
      }
      const weekend = day === 0 || day === 5 || day === 6;
      const isMonday = day === 1;
      // Intensidade 0–4 (o heatmap usa níveis discretos)
      const base = weekend ? 2.6 : 1;
      const count = isMonday
        ? Math.round(heatRandom() * 0.8)
        : Math.min(4, Math.round(base + heatRandom() * 1.8));
      return { bin: day, count, date };
    });
    columns.push({ bin: week, bins });
  }
  return columns;
})();

/** Jornada do cliente — do contato à avaliação. */
export const customerFunnel: FunnelStage[] = [
  { label: "Visitas no app", value: 18_400, displayValue: "18,4 mil" },
  { label: "Reservas", value: 6200, displayValue: "6,2 mil" },
  { label: "Comparecimentos", value: 5300, displayValue: "5,3 mil" },
  { label: "Pedidos fechados", value: 4900, displayValue: "4,9 mil" },
  { label: "Avaliações 5★", value: 2100, displayValue: "2,1 mil" },
];

/** Metas do mês (anéis). */
export const monthlyGoals: RingData[] = [
  { label: "Faturamento", value: 412, maxValue: 480, color: palette.brasa },
  { label: "Delivery", value: 128, maxValue: 150, color: palette.teal },
  { label: "Eventos", value: 46, maxValue: 80, color: palette.amber },
  { label: "Vinhos", value: 31, maxValue: 40, color: palette.violet },
];

export const topDishes = [
  { dish: "Picanha", sales: 1240 },
  { dish: "Risoto", sales: 980 },
  { dish: "Moqueca", sales: 860 },
  { dish: "Feijoada", sales: 790 },
  { dish: "Parmegiana", sales: 720 },
  { dish: "Petit gâteau", sales: 640 },
];

export const recentOrders = [
  { id: "#8421", table: "Mesa 12", items: 4, total: 286.5, status: "Pago" },
  {
    id: "#8420",
    table: "Delivery",
    items: 2,
    total: 118.9,
    status: "A caminho",
  },
  {
    id: "#8419",
    table: "Mesa 03",
    items: 6,
    total: 512.0,
    status: "Na cozinha",
  },
  { id: "#8418", table: "Balcão", items: 1, total: 32.0, status: "Pago" },
  { id: "#8417", table: "Mesa 08", items: 3, total: 214.4, status: "Pago" },
  {
    id: "#8416",
    table: "Delivery",
    items: 5,
    total: 342.7,
    status: "Cancelado",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Finanças                                                                   */
/* -------------------------------------------------------------------------- */

const finRandom = seeded(99);

/** 12 meses de receita x despesa. */
export const monthlyFinance = Array.from({ length: 12 }, (_, i) => {
  const date = monthsAgo(11 - i);
  const season = Math.sin((i / 12) * Math.PI * 2) * 38_000;
  const revenue = Math.round(
    360_000 + season + finRandom() * 42_000 + i * 4000
  );
  const expenses = Math.round(
    revenue * (0.74 + finRandom() * 0.22) - (i === 10 ? -40_000 : 0)
  );
  return { date, revenue, expenses, result: revenue - expenses };
});

export const financeStats = (() => {
  const last = monthlyFinance[11] as (typeof monthlyFinance)[number];
  const prev = monthlyFinance[10] as (typeof monthlyFinance)[number];
  const trend = (a: number, b: number) => ((a - b) / Math.abs(b)) * 100;
  return {
    revenue: last.revenue,
    expenses: last.expenses,
    result: last.result,
    margin: (last.result / last.revenue) * 100,
    revenueTrend: trend(last.revenue, prev.revenue),
    expensesTrend: trend(last.expenses, prev.expenses),
    resultTrend: trend(last.result, prev.result),
    cmv: 31.4,
  };
})();

/** Receita por canal (empilhado). */
export const revenueByChannel = monthlyFinance.slice(-6).map((m, i) => ({
  month: m.date
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", ""),
  salao: Math.round(m.revenue * (0.58 - i * 0.006)),
  delivery: Math.round(m.revenue * (0.27 + i * 0.008)),
  eventos: Math.round(m.revenue * (0.15 - i * 0.002)),
}));

export const expenseCategories: PieData[] = [
  { label: "Insumos (CMV)", value: 118_400, color: palette.brasa },
  { label: "Folha de pagamento", value: 96_200, color: palette.teal },
  { label: "Aluguel e condomínio", value: 38_000, color: palette.amber },
  { label: "Energia, gás e água", value: 21_700, color: palette.violet },
  { label: "Marketing", value: 12_300, color: palette.sky },
  { label: "Manutenção", value: 8900, color: palette.stone },
];

/** Fluxo de caixa do mês: origem → caixa → destino. */
export const cashFlow: SankeyData = {
  nodes: [
    { name: "Salão", category: "source" },
    { name: "Delivery", category: "source" },
    { name: "Eventos", category: "source" },
    { name: "Caixa", category: "landing" },
    { name: "Insumos", category: "outcome" },
    { name: "Folha", category: "outcome" },
    { name: "Fixos", category: "outcome" },
    { name: "Impostos", category: "outcome" },
    { name: "Lucro", category: "outcome" },
  ],
  links: [
    { source: 0, target: 3, value: 236_000 },
    { source: 1, target: 3, value: 118_000 },
    { source: 2, target: 3, value: 58_000 },
    { source: 3, target: 4, value: 118_400 },
    { source: 3, target: 5, value: 96_200 },
    { source: 3, target: 6, value: 80_900 },
    { source: 3, target: 7, value: 49_400 },
    { source: 3, target: 8, value: 67_100 },
  ],
};

/** Preço semanal do kg da picanha (fornecedor) — OHLC. */
const ohlcRandom = seeded(2024);
export const beefPrice: OHLCDataPoint[] = (() => {
  let price = 72;
  return Array.from({ length: 20 }, (_, i) => {
    const date = daysAgo((19 - i) * 7);
    const open = price;
    const close = Math.max(60, open + (ohlcRandom() - 0.45) * 6);
    const high = Math.max(open, close) + ohlcRandom() * 2.5;
    const low = Math.min(open, close) - ohlcRandom() * 2.5;
    price = close;
    const r = (n: number) => Math.round(n * 100) / 100;
    return { date, open: r(open), high: r(high), low: r(low), close: r(close) };
  });
})();

export const transactions = [
  {
    id: 1,
    date: daysAgo(0),
    description: "Fornecedor Frigorífico Sul",
    category: "Insumos",
    amount: -8420,
  },
  {
    id: 2,
    date: daysAgo(0),
    description: "Repasse iFood",
    category: "Delivery",
    amount: 12_380,
  },
  {
    id: 3,
    date: daysAgo(1),
    description: "Evento corporativo — Acme",
    category: "Eventos",
    amount: 9600,
  },
  {
    id: 4,
    date: daysAgo(1),
    description: "Conta de energia",
    category: "Fixos",
    amount: -4870,
  },
  {
    id: 5,
    date: daysAgo(2),
    description: "Maquininha — vendas salão",
    category: "Salão",
    amount: 18_240,
  },
  {
    id: 6,
    date: daysAgo(3),
    description: "Hortifruti Verde Vale",
    category: "Insumos",
    amount: -2310,
  },
  {
    id: 7,
    date: daysAgo(3),
    description: "Adiantamento salarial",
    category: "Folha",
    amount: -21_500,
  },
];

/* -------------------------------------------------------------------------- */
/* Recursos humanos                                                           */
/* -------------------------------------------------------------------------- */

export const teamBySector: PieData[] = [
  { label: "Cozinha", value: 14, color: palette.brasa },
  { label: "Salão", value: 12, color: palette.teal },
  { label: "Bar", value: 4, color: palette.amber },
  { label: "Delivery", value: 5, color: palette.violet },
  { label: "Administrativo", value: 3, color: palette.sky },
];

export const hrStats = {
  headcount: teamBySector.reduce((a, s) => a + s.value, 0),
  payroll: 96_200,
  turnover: 4.2,
  absenteeism: 2.8,
  enps: 64,
  hiresTrend: 2,
};

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

export const overtimeBySector = monthlyFinance.slice(-6).map((m, i) => ({
  month: m.date
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", ""),
  cozinha: 62 + ((i * 17) % 30),
  salao: 40 + ((i * 11) % 24),
  bar: 14 + ((i * 7) % 12),
}));

const hoursRandom = seeded(314);
/** Horas trabalhadas x gorjetas por dia (dispersão). */
export const tipsAndHours = Array.from({ length: 30 }, (_, i) => {
  const date = daysAgo(29 - i);
  const weekend = [0, 5, 6].includes(date.getDay());
  return {
    date,
    gorjetas: Math.round((weekend ? 2600 : 1400) + hoursRandom() * 900),
    horas: Math.round((weekend ? 2300 : 1700) + hoursRandom() * 500),
  };
});

export const employees = [
  {
    name: "Ana Souza",
    role: "Chef executiva",
    sector: "Cozinha",
    since: "2019",
    status: "Ativo",
    shift: "Noite",
  },
  {
    name: "Bruno Lima",
    role: "Sous-chef",
    sector: "Cozinha",
    since: "2021",
    status: "Ativo",
    shift: "Tarde",
  },
  {
    name: "Carla Mendes",
    role: "Maître",
    sector: "Salão",
    since: "2020",
    status: "Férias",
    shift: "Noite",
  },
  {
    name: "Diego Rocha",
    role: "Bartender",
    sector: "Bar",
    since: "2022",
    status: "Ativo",
    shift: "Noite",
  },
  {
    name: "Elisa Torres",
    role: "Garçonete",
    sector: "Salão",
    since: "2024",
    status: "Experiência",
    shift: "Almoço",
  },
  {
    name: "Felipe Nunes",
    role: "Entregador",
    sector: "Delivery",
    since: "2023",
    status: "Afastado",
    shift: "Noite",
  },
  {
    name: "Gabriela Reis",
    role: "Gerente adm.",
    sector: "Administrativo",
    since: "2018",
    status: "Ativo",
    shift: "Comercial",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Cardápio                                                                   */
/* -------------------------------------------------------------------------- */

export const menuSunburst: SunburstNode = {
  name: "Cardápio",
  children: [
    {
      name: "Pratos principais",
      color: palette.brasa,
      children: [
        { name: "Picanha na brasa", value: 1240 },
        { name: "Moqueca baiana", value: 860 },
        { name: "Feijoada", value: 790 },
        { name: "Parmegiana", value: 720 },
      ],
    },
    {
      name: "Massas e risotos",
      color: palette.teal,
      children: [
        { name: "Risoto de camarão", value: 980 },
        { name: "Talharim ao pesto", value: 410 },
        { name: "Nhoque da casa", value: 350 },
      ],
    },
    {
      name: "Entradas",
      color: palette.amber,
      children: [
        { name: "Pastéis", value: 620 },
        { name: "Bolinho de bacalhau", value: 540 },
        { name: "Burrata", value: 300 },
      ],
    },
    {
      name: "Sobremesas",
      color: palette.violet,
      children: [
        { name: "Petit gâteau", value: 640 },
        { name: "Pudim", value: 470 },
      ],
    },
    {
      name: "Bebidas",
      color: palette.sky,
      children: [
        { name: "Caipirinhas", value: 1120 },
        { name: "Vinhos", value: 610 },
        { name: "Sucos", value: 690 },
      ],
    },
  ],
};

export interface MenuItem {
  name: string;
  category: "Entradas" | "Principais" | "Massas" | "Sobremesas" | "Bebidas";
  price: number;
  cost: number;
  sales: number;
  rating: number;
  available: boolean;
  tags: string[];
}

export const menuItems: MenuItem[] = [
  {
    name: "Picanha na brasa",
    category: "Principais",
    price: 129,
    cost: 52,
    sales: 1240,
    rating: 4.9,
    available: true,
    tags: ["Mais vendido"],
  },
  {
    name: "Moqueca baiana",
    category: "Principais",
    price: 112,
    cost: 41,
    sales: 860,
    rating: 4.8,
    available: true,
    tags: ["Sem glúten"],
  },
  {
    name: "Feijoada completa",
    category: "Principais",
    price: 89,
    cost: 28,
    sales: 790,
    rating: 4.7,
    available: true,
    tags: ["Sábado"],
  },
  {
    name: "Risoto de camarão",
    category: "Massas",
    price: 98,
    cost: 39,
    sales: 980,
    rating: 4.8,
    available: true,
    tags: ["Chef"],
  },
  {
    name: "Talharim ao pesto",
    category: "Massas",
    price: 69,
    cost: 17,
    sales: 410,
    rating: 4.4,
    available: true,
    tags: ["Vegetariano"],
  },
  {
    name: "Bolinho de bacalhau",
    category: "Entradas",
    price: 48,
    cost: 16,
    sales: 540,
    rating: 4.6,
    available: true,
    tags: [],
  },
  {
    name: "Burrata com tomate",
    category: "Entradas",
    price: 62,
    cost: 26,
    sales: 300,
    rating: 4.5,
    available: false,
    tags: ["Vegetariano"],
  },
  {
    name: "Petit gâteau",
    category: "Sobremesas",
    price: 36,
    cost: 9,
    sales: 640,
    rating: 4.9,
    available: true,
    tags: ["Mais vendido"],
  },
  {
    name: "Pudim de leite",
    category: "Sobremesas",
    price: 24,
    cost: 5,
    sales: 470,
    rating: 4.7,
    available: true,
    tags: [],
  },
  {
    name: "Caipirinha de limão",
    category: "Bebidas",
    price: 28,
    cost: 6,
    sales: 1120,
    rating: 4.6,
    available: true,
    tags: [],
  },
];

export const menuStats = {
  activeItems: menuItems.filter((m) => m.available).length,
  totalItems: menuItems.length,
  avgCmv:
    (menuItems.reduce((a, m) => a + m.cost / m.price, 0) / menuItems.length) *
    100,
  avgRating: menuItems.reduce((a, m) => a + m.rating, 0) / menuItems.length,
};

export const marginByDish = menuItems
  .map((m) => ({
    dish: m.name,
    margem: Math.round(((m.price - m.cost) / m.price) * 100),
  }))
  .sort((a, b) => b.margem - a.margem)
  .slice(0, 7);

/** Vendas diárias de pratos x bebidas (30 dias). */
const menuRandom = seeded(555);
export const foodVsDrinks = dailySales.map((d) => ({
  date: d.date,
  pratos: Math.round(d.orders * (1.3 + menuRandom() * 0.3)),
  bebidas: Math.round(d.orders * (1.6 + menuRandom() * 0.5)),
}));

/* -------------------------------------------------------------------------- */
/* Documentos                                                                 */
/* -------------------------------------------------------------------------- */

export type DocumentStatus = "Válido" | "A vencer" | "Vencido" | "Em análise";

export interface RestaurantDocument {
  name: string;
  type: "Licenças" | "Contratos" | "Fiscal" | "RH" | "Segurança";
  issuer: string;
  expires: Date | null;
  status: DocumentStatus;
  sizeMb: number;
}

function inDays(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
}

export const documents: RestaurantDocument[] = [
  {
    name: "Alvará de funcionamento",
    type: "Licenças",
    issuer: "Prefeitura",
    expires: inDays(210),
    status: "Válido",
    sizeMb: 1.2,
  },
  {
    name: "Licença sanitária (Vigilância)",
    type: "Licenças",
    issuer: "Vigilância Sanitária",
    expires: inDays(18),
    status: "A vencer",
    sizeMb: 2.4,
  },
  {
    name: "AVCB — Corpo de Bombeiros",
    type: "Segurança",
    issuer: "Corpo de Bombeiros",
    expires: inDays(-6),
    status: "Vencido",
    sizeMb: 3.1,
  },
  {
    name: "Contrato de locação",
    type: "Contratos",
    issuer: "Imobiliária Centro",
    expires: inDays(540),
    status: "Válido",
    sizeMb: 0.9,
  },
  {
    name: "Contrato fornecedor — Frigorífico Sul",
    type: "Contratos",
    issuer: "Frigorífico Sul",
    expires: inDays(27),
    status: "A vencer",
    sizeMb: 0.6,
  },
  {
    name: "Notas fiscais — Setembro",
    type: "Fiscal",
    issuer: "SEFAZ",
    expires: null,
    status: "Válido",
    sizeMb: 14.8,
  },
  {
    name: "Certificado digital A1",
    type: "Fiscal",
    issuer: "Certisign",
    expires: inDays(44),
    status: "Em análise",
    sizeMb: 0.1,
  },
  {
    name: "PCMSO / ASOs da equipe",
    type: "RH",
    issuer: "Clínica Ocupacional",
    expires: inDays(120),
    status: "Válido",
    sizeMb: 6.3,
  },
  {
    name: "Convenção coletiva 2026",
    type: "RH",
    issuer: "Sindicato",
    expires: inDays(88),
    status: "Válido",
    sizeMb: 1.8,
  },
  {
    name: "Laudo de dedetização",
    type: "Segurança",
    issuer: "Dedetiza Já",
    expires: inDays(9),
    status: "A vencer",
    sizeMb: 0.7,
  },
];

export const documentStats = {
  total: 148,
  expiring: documents.filter((d) => d.status === "A vencer").length,
  expired: documents.filter((d) => d.status === "Vencido").length,
  storageUsed: 6.4,
  storageTotal: 10,
};

export const storageByType: RingData[] = [
  { label: "Fiscal", value: 2.9, maxValue: 10, color: palette.brasa },
  { label: "Contratos", value: 1.4, maxValue: 10, color: palette.teal },
  { label: "RH", value: 1.2, maxValue: 10, color: palette.amber },
  { label: "Licenças", value: 0.6, maxValue: 10, color: palette.violet },
  { label: "Segurança", value: 0.3, maxValue: 10, color: palette.sky },
];

export const uploadsByMonth = monthlyFinance.slice(-6).map((m, i) => ({
  month: m.date
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", ""),
  enviados: 14 + ((i * 13) % 17),
  assinados: 6 + ((i * 7) % 9),
}));
