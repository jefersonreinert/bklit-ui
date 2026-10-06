import type {
  PieData,
  RadarData,
  RadarMetric,
  SunburstNode,
} from "@bklitui/ui/charts";
import { palette, TODAY } from "./data";

/** Menu management mock data for the Cardápio page (deterministic). */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

export const CATEGORIES = [
  "Entradas",
  "Principais",
  "Massas",
  "Sobremesas",
  "Bebidas",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Ingredient {
  name: string;
  qty: number;
  unit: "g" | "ml" | "un";
  /** Custo por unidade de medida (R$/g, R$/ml ou R$/un). */
  unitCost: number;
}

export interface Dish {
  id: string;
  name: string;
  category: Category;
  description: string;
  price: number;
  sales: number;
  prevSales: number;
  rating: number;
  reviews: number;
  prepMinutes: number;
  available: boolean;
  tags: string[];
  ingredients: Ingredient[];
}

const I = (
  name: string,
  qty: number,
  unit: Ingredient["unit"],
  unitCost: number
): Ingredient => ({ name, qty, unit, unitCost });

const RAW: Omit<Dish, "id" | "prevSales">[] = [
  {
    name: "Picanha na brasa",
    category: "Principais",
    description: "400 g de picanha, farofa, vinagrete e mandioca frita.",
    price: 129,
    sales: 1240,
    rating: 4.9,
    reviews: 412,
    prepMinutes: 22,
    available: true,
    tags: ["Mais vendido", "Sem glúten"],
    ingredients: [
      I("Picanha", 400, "g", 0.089),
      I("Farinha de mandioca", 60, "g", 0.012),
      I("Mandioca", 200, "g", 0.008),
      I("Tomate/cebola", 80, "g", 0.009),
      I("Manteiga", 20, "g", 0.045),
    ],
  },
  {
    name: "Moqueca baiana",
    category: "Principais",
    description: "Peixe branco, camarão, leite de coco e dendê. Serve 2.",
    price: 148,
    sales: 860,
    rating: 4.8,
    reviews: 268,
    prepMinutes: 28,
    available: true,
    tags: ["Sem glúten", "Para 2"],
    ingredients: [
      I("Peixe branco", 350, "g", 0.068),
      I("Camarão", 150, "g", 0.11),
      I("Leite de coco", 200, "ml", 0.024),
      I("Azeite de dendê", 30, "ml", 0.06),
      I("Arroz", 180, "g", 0.006),
    ],
  },
  {
    name: "Feijoada completa",
    category: "Principais",
    description: "Feijão preto, carnes nobres, couve, laranja e torresmo.",
    price: 89,
    sales: 790,
    rating: 4.7,
    reviews: 231,
    prepMinutes: 12,
    available: true,
    tags: ["Sábado"],
    ingredients: [
      I("Feijão preto", 180, "g", 0.011),
      I("Carnes (mix)", 250, "g", 0.042),
      I("Couve", 80, "g", 0.012),
      I("Arroz", 150, "g", 0.006),
      I("Torresmo", 60, "g", 0.05),
    ],
  },
  {
    name: "Filé à parmegiana",
    category: "Principais",
    description: "Filé-mignon empanado, molho de tomate e queijo gratinado.",
    price: 98,
    sales: 720,
    rating: 4.6,
    reviews: 198,
    prepMinutes: 20,
    available: true,
    tags: [],
    ingredients: [
      I("Filé-mignon", 220, "g", 0.12),
      I("Queijo muçarela", 80, "g", 0.045),
      I("Molho de tomate", 120, "ml", 0.01),
      I("Farinha panko", 40, "g", 0.03),
      I("Batata", 200, "g", 0.007),
    ],
  },
  {
    name: "Costela no bafo",
    category: "Principais",
    description: "Costela bovina 12 h, purê de abóbora e farofa de banana.",
    price: 112,
    sales: 310,
    rating: 4.8,
    reviews: 96,
    prepMinutes: 15,
    available: true,
    tags: ["Novidade"],
    ingredients: [
      I("Costela bovina", 450, "g", 0.048),
      I("Abóbora", 180, "g", 0.006),
      I("Banana-da-terra", 100, "g", 0.009),
      I("Farinha de mandioca", 50, "g", 0.012),
    ],
  },
  {
    name: "Salmão grelhado",
    category: "Principais",
    description: "Salmão com crosta de ervas, legumes na manteiga.",
    price: 118,
    sales: 240,
    rating: 4.3,
    reviews: 71,
    prepMinutes: 18,
    available: true,
    tags: ["Sem glúten"],
    ingredients: [
      I("Salmão", 220, "g", 0.16),
      I("Legumes da estação", 200, "g", 0.012),
      I("Manteiga", 25, "g", 0.045),
    ],
  },
  {
    name: "Risoto de camarão",
    category: "Massas",
    description: "Arbóreo, camarões salteados, limão-siciliano e parmesão.",
    price: 104,
    sales: 980,
    rating: 4.8,
    reviews: 305,
    prepMinutes: 24,
    available: true,
    tags: ["Chef"],
    ingredients: [
      I("Arroz arbóreo", 110, "g", 0.032),
      I("Camarão", 180, "g", 0.11),
      I("Parmesão", 40, "g", 0.09),
      I("Vinho branco", 60, "ml", 0.04),
      I("Caldo de legumes", 400, "ml", 0.004),
    ],
  },
  {
    name: "Talharim ao pesto",
    category: "Massas",
    description: "Massa fresca, pesto de manjericão e castanha-de-caju.",
    price: 69,
    sales: 410,
    rating: 4.4,
    reviews: 112,
    prepMinutes: 14,
    available: true,
    tags: ["Vegetariano"],
    ingredients: [
      I("Massa fresca", 160, "g", 0.022),
      I("Manjericão", 30, "g", 0.08),
      I("Castanha-de-caju", 25, "g", 0.09),
      I("Parmesão", 25, "g", 0.09),
    ],
  },
  {
    name: "Nhoque da casa",
    category: "Massas",
    description: "Nhoque de batata, molho pomodoro e burrata.",
    price: 74,
    sales: 190,
    rating: 4.1,
    reviews: 48,
    prepMinutes: 16,
    available: true,
    tags: ["Vegetariano"],
    ingredients: [
      I("Batata", 250, "g", 0.007),
      I("Burrata", 60, "g", 0.14),
      I("Molho de tomate", 150, "ml", 0.01),
    ],
  },
  {
    name: "Bolinho de bacalhau",
    category: "Entradas",
    description: "8 unidades, maionese de limão.",
    price: 52,
    sales: 540,
    rating: 4.6,
    reviews: 154,
    prepMinutes: 10,
    available: true,
    tags: [],
    ingredients: [
      I("Bacalhau", 120, "g", 0.12),
      I("Batata", 150, "g", 0.007),
      I("Óleo", 200, "ml", 0.009),
    ],
  },
  {
    name: "Pastéis da feira",
    category: "Entradas",
    description: "6 mini pastéis: carne, queijo e palmito.",
    price: 42,
    sales: 620,
    rating: 4.5,
    reviews: 140,
    prepMinutes: 8,
    available: true,
    tags: [],
    ingredients: [
      I("Massa de pastel", 180, "g", 0.018),
      I("Recheios (mix)", 150, "g", 0.03),
      I("Óleo", 200, "ml", 0.009),
    ],
  },
  {
    name: "Burrata com tomate",
    category: "Entradas",
    description: "Burrata, tomates confitados, pesto e torradas.",
    price: 64,
    sales: 160,
    rating: 4.7,
    reviews: 58,
    prepMinutes: 6,
    available: false,
    tags: ["Vegetariano"],
    ingredients: [
      I("Burrata", 150, "g", 0.14),
      I("Tomate cereja", 100, "g", 0.025),
      I("Pão de fermentação", 80, "g", 0.02),
    ],
  },
  {
    name: "Petit gâteau",
    category: "Sobremesas",
    description: "Bolo de chocolate 70% com sorvete de creme.",
    price: 36,
    sales: 640,
    rating: 4.9,
    reviews: 220,
    prepMinutes: 9,
    available: true,
    tags: ["Mais vendido"],
    ingredients: [
      I("Chocolate 70%", 60, "g", 0.07),
      I("Ovos", 2, "un", 0.9),
      I("Sorvete", 70, "g", 0.03),
    ],
  },
  {
    name: "Pudim de leite",
    category: "Sobremesas",
    description: "Receita da avó, calda de caramelo.",
    price: 24,
    sales: 470,
    rating: 4.7,
    reviews: 133,
    prepMinutes: 2,
    available: true,
    tags: [],
    ingredients: [
      I("Leite condensado", 90, "g", 0.022),
      I("Leite", 100, "ml", 0.005),
      I("Ovos", 1, "un", 0.9),
    ],
  },
  {
    name: "Cheesecake de goiaba",
    category: "Sobremesas",
    description: "Base crocante, creme de queijo e goiabada cascão.",
    price: 32,
    sales: 150,
    rating: 4.2,
    reviews: 40,
    prepMinutes: 3,
    available: true,
    tags: ["Novidade"],
    ingredients: [
      I("Cream cheese", 90, "g", 0.06),
      I("Goiabada", 40, "g", 0.025),
      I("Biscoito", 40, "g", 0.02),
    ],
  },
  {
    name: "Caipirinha de limão",
    category: "Bebidas",
    description: "Cachaça artesanal, limão e açúcar.",
    price: 28,
    sales: 1120,
    rating: 4.6,
    reviews: 290,
    prepMinutes: 4,
    available: true,
    tags: ["Mais vendido"],
    ingredients: [
      I("Cachaça", 60, "ml", 0.06),
      I("Limão", 1, "un", 0.6),
      I("Açúcar", 20, "g", 0.005),
    ],
  },
  {
    name: "Vinho tinto (taça)",
    category: "Bebidas",
    description: "Malbec argentino, 150 ml.",
    price: 38,
    sales: 610,
    rating: 4.5,
    reviews: 101,
    prepMinutes: 1,
    available: true,
    tags: [],
    ingredients: [I("Vinho Malbec", 150, "ml", 0.07)],
  },
  {
    name: "Suco natural",
    category: "Bebidas",
    description: "Laranja, abacaxi com hortelã ou maracujá.",
    price: 16,
    sales: 690,
    rating: 4.4,
    reviews: 120,
    prepMinutes: 3,
    available: true,
    tags: ["Sem açúcar"],
    ingredients: [I("Frutas", 350, "g", 0.009)],
  },
  {
    name: "Chope artesanal",
    category: "Bebidas",
    description: "Pilsen da casa, 400 ml.",
    price: 22,
    sales: 880,
    rating: 4.5,
    reviews: 170,
    prepMinutes: 1,
    available: true,
    tags: [],
    ingredients: [I("Chope", 400, "ml", 0.016)],
  },
  {
    name: "Drink autoral Brasa",
    category: "Bebidas",
    description: "Gin, cajá, xarope de pimenta defumada.",
    price: 42,
    sales: 180,
    rating: 4.8,
    reviews: 62,
    prepMinutes: 5,
    available: true,
    tags: ["Novidade"],
    ingredients: [
      I("Gin", 50, "ml", 0.12),
      I("Polpa de cajá", 60, "ml", 0.03),
      I("Xarope", 15, "ml", 0.04),
    ],
  },
];

const trendRnd = seeded(9001);
export const dishes: Dish[] = RAW.map((d, i) => ({
  ...d,
  id: `P${String(i + 1).padStart(3, "0")}`,
  prevSales: Math.round(d.sales * (0.82 + trendRnd() * 0.32)),
}));

/* -------------------------------------------------------------------------- */
/* Cálculos                                                                   */
/* -------------------------------------------------------------------------- */

export const dishCost = (d: Pick<Dish, "ingredients">) =>
  d.ingredients.reduce((a, i) => a + i.qty * i.unitCost, 0);
/** CMV % (custo ÷ preço). */
export const dishCmv = (d: Dish) => (dishCost(d) / d.price) * 100;
/** Margem de contribuição em R$. */
export const dishMargin = (d: Dish) => d.price - dishCost(d);

export type Quadrant =
  | "Estrela"
  | "Burro de carga"
  | "Quebra-cabeça"
  | "Abacaxi";

export const quadrantInfo: Record<
  Quadrant,
  { description: string; action: string }
> = {
  Estrela: {
    description: "Alta popularidade e alta margem",
    action: "Manter destaque e qualidade",
  },
  "Burro de carga": {
    description: "Vende muito, margem baixa",
    action: "Rever porção/custo ou reajustar preço",
  },
  "Quebra-cabeça": {
    description: "Margem alta, pouca venda",
    action: "Promover, reposicionar no cardápio",
  },
  Abacaxi: {
    description: "Pouca venda e margem baixa",
    action: "Reformular ou retirar",
  },
};

/** Engenharia de cardápio (Kasavana & Smith): popularidade × margem. */
export function menuEngineering(items: Dish[] = dishes) {
  const totalSales = items.reduce((a, d) => a + d.sales, 0);
  const avgMargin =
    items.reduce((a, d) => a + dishMargin(d) * d.sales, 0) / totalSales;
  // Limite de popularidade: 70% da participação média
  const popularityThreshold = (1 / items.length) * 0.7 * totalSales;

  return items.map((d) => {
    const popular = d.sales >= popularityThreshold;
    const profitable = dishMargin(d) >= avgMargin;
    let quadrant: Quadrant = "Abacaxi";
    if (popular && profitable) {
      quadrant = "Estrela";
    } else if (popular) {
      quadrant = "Burro de carga";
    } else if (profitable) {
      quadrant = "Quebra-cabeça";
    }
    return {
      dish: d,
      margin: dishMargin(d),
      share: (d.sales / totalSales) * 100,
      quadrant,
      avgMargin,
      popularityThreshold,
    };
  });
}

export const menuSummary = (() => {
  const active = dishes.filter((d) => d.available);
  const totalSales = dishes.reduce((a, d) => a + d.sales, 0);
  const prevTotal = dishes.reduce((a, d) => a + d.prevSales, 0);
  const revenue = dishes.reduce((a, d) => a + d.sales * d.price, 0);
  const cost = dishes.reduce((a, d) => a + d.sales * dishCost(d), 0);
  const best = [...dishes].sort((a, b) => b.sales - a.sales)[0] as Dish;
  return {
    activeItems: active.length,
    totalItems: dishes.length,
    unavailable: dishes.length - active.length,
    totalSales,
    salesTrend: ((totalSales - prevTotal) / prevTotal) * 100,
    revenue,
    weightedCmv: (cost / revenue) * 100,
    avgTicketPerItem: revenue / totalSales,
    avgRating:
      dishes.reduce((a, d) => a + d.rating * d.reviews, 0) /
      dishes.reduce((a, d) => a + d.reviews, 0),
    totalReviews: dishes.reduce((a, d) => a + d.reviews, 0),
    best,
    avgPrep:
      dishes.reduce((a, d) => a + d.prepMinutes * d.sales, 0) / totalSales,
  };
})();

/* -------------------------------------------------------------------------- */
/* Gráficos                                                                   */
/* -------------------------------------------------------------------------- */

const categoryColor: Record<Category, string> = {
  Entradas: palette.amber,
  Principais: palette.brasa,
  Massas: palette.teal,
  Sobremesas: palette.violet,
  Bebidas: palette.green,
};

export const salesSunburst: SunburstNode = {
  name: "Cardápio",
  children: CATEGORIES.map((c) => ({
    name: c,
    color: categoryColor[c],
    children: dishes
      .filter((d) => d.category === c)
      .map((d) => ({ name: d.name, value: d.sales })),
  })),
};

export const revenueByCategory: PieData[] = CATEGORIES.map((c) => ({
  label: c,
  value: dishes
    .filter((d) => d.category === c)
    .reduce((a, d) => a + d.sales * d.price, 0),
  color: categoryColor[c],
}));

const shortCategory: Record<Category, string> = {
  Entradas: "Entr.",
  Principais: "Princ.",
  Massas: "Massas",
  Sobremesas: "Sobrem.",
  Bebidas: "Bebidas",
};

export const cmvByCategory = CATEGORIES.map((c) => {
  const items = dishes.filter((d) => d.category === c);
  const rev = items.reduce((a, d) => a + d.sales * d.price, 0);
  const cost = items.reduce((a, d) => a + d.sales * dishCost(d), 0);
  return {
    categoria: shortCategory[c],
    cmv: Math.round((cost / rev) * 1000) / 10,
  };
});

export const topMarginDishes = [...dishes]
  .sort((a, b) => dishMargin(b) - dishMargin(a))
  .slice(0, 8)
  .map((d) => ({
    prato: d.name.split(" ").slice(0, 2).join(" "),
    margem: Math.round(dishMargin(d)),
  }));

const dailyRnd = seeded(777);
/** Itens vendidos por dia: pratos x bebidas (30 dias). */
export const dailyItems = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - 29 + i);
  const weekend = [0, 5, 6].includes(date.getDay());
  const base = weekend ? 1.45 : 1;
  return {
    date,
    pratos: Math.round((210 + dailyRnd() * 40) * base),
    bebidas: Math.round((260 + dailyRnd() * 60) * base),
  };
});

/** Vendas por turno e categoria (média diária). */
export const salesByShift = [
  {
    turno: "Almoço",
    entradas: 18,
    principais: 74,
    massas: 26,
    sobremesas: 22,
    bebidas: 96,
  },
  {
    turno: "Tarde",
    entradas: 9,
    principais: 12,
    massas: 6,
    sobremesas: 18,
    bebidas: 41,
  },
  {
    turno: "Jantar",
    entradas: 34,
    principais: 92,
    massas: 41,
    sobremesas: 39,
    bebidas: 168,
  },
];

export const reviewMetrics: RadarMetric[] = [
  { key: "sabor", label: "Sabor" },
  { key: "apresentacao", label: "Apresentação" },
  { key: "temperatura", label: "Temperatura" },
  { key: "porcao", label: "Porção" },
  { key: "preco", label: "Custo-benefício" },
];

export const reviewScores: RadarData[] = [
  {
    label: "Principais",
    color: palette.brasa,
    values: {
      sabor: 95,
      apresentacao: 88,
      temperatura: 84,
      porcao: 92,
      preco: 76,
    },
  },
  {
    label: "Massas",
    color: palette.teal,
    values: {
      sabor: 90,
      apresentacao: 91,
      temperatura: 80,
      porcao: 78,
      preco: 82,
    },
  },
  {
    label: "Sobremesas",
    color: palette.amber,
    values: {
      sabor: 96,
      apresentacao: 94,
      temperatura: 88,
      porcao: 80,
      preco: 90,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Estoque de insumos                                                         */
/* -------------------------------------------------------------------------- */

export interface StockItem {
  name: string;
  unit: string;
  current: number;
  min: number;
  max: number;
  dailyUse: number;
  supplier: string;
}

export const stock: StockItem[] = [
  {
    name: "Picanha",
    unit: "kg",
    current: 18,
    min: 25,
    max: 80,
    dailyUse: 9.5,
    supplier: "Frigorífico Sul",
  },
  {
    name: "Camarão",
    unit: "kg",
    current: 22,
    min: 10,
    max: 40,
    dailyUse: 4.8,
    supplier: "Pescados Mar Azul",
  },
  {
    name: "Filé-mignon",
    unit: "kg",
    current: 14,
    min: 8,
    max: 30,
    dailyUse: 3.1,
    supplier: "Frigorífico Sul",
  },
  {
    name: "Arroz arbóreo",
    unit: "kg",
    current: 9,
    min: 6,
    max: 25,
    dailyUse: 1.9,
    supplier: "Empório Grãos",
  },
  {
    name: "Burrata",
    unit: "un",
    current: 0,
    min: 12,
    max: 40,
    dailyUse: 4,
    supplier: "Laticínios Serra",
  },
  {
    name: "Chocolate 70%",
    unit: "kg",
    current: 6,
    min: 3,
    max: 12,
    dailyUse: 0.9,
    supplier: "Cacau Brasil",
  },
  {
    name: "Cachaça artesanal",
    unit: "L",
    current: 31,
    min: 15,
    max: 60,
    dailyUse: 2.4,
    supplier: "Alambique Minas",
  },
  {
    name: "Limão",
    unit: "kg",
    current: 7,
    min: 10,
    max: 40,
    dailyUse: 5.2,
    supplier: "Verde Vale",
  },
];

export const stockDays = (s: StockItem) =>
  s.dailyUse > 0 ? s.current / s.dailyUse : Number.POSITIVE_INFINITY;
