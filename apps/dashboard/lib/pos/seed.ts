import { dishes } from "@/lib/menu-data";
import type { FloorArea, PosData, PosProduct, PosTable } from "./types";

export const TILE_COLORS = [
  "#c96442",
  "#d4a27f",
  "#8a7560",
  "#5c3d2e",
  "#3d7a5f",
  "#4a6fa5",
  "#8e5ea2",
  "#b03a2e",
  "#6b7280",
];

export const TABLE_COLORS = [
  "#e8dccb",
  "#d4a27f",
  "#c96442",
  "#9a7a60",
  "#cfe3d6",
  "#d6e0f0",
  "#ead7ef",
  "#f3e6b5",
  "#e5e7eb",
];

const CATEGORY_COLOR: Record<string, string> = {
  Entradas: "#d4a27f",
  Principais: "#c96442",
  Massas: "#8a7560",
  Sobremesas: "#8e5ea2",
  Bebidas: "#4a6fa5",
};

/** The menu in euros (menu-data is in reais): rounded to €0.50. */
function seedProducts(): PosProduct[] {
  return dishes.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    price: Math.max(1, Math.round((d.price / 5.8) * 2) / 2),
    color: CATEGORY_COLOR[d.category] ?? TILE_COLORS[0] ?? "#c96442",
    available: d.available,
  }));
}

function table(
  n: number,
  x: number,
  y: number,
  shape: PosTable["shape"],
  seats: number
): PosTable {
  const size = { round: [110, 110], square: [110, 110], rect: [190, 110] }[
    shape
  ];
  return {
    id: `t${n}`,
    name: String(n),
    x,
    y,
    w: size[0] ?? 110,
    h: size[1] ?? 110,
    shape,
    seats,
    color: TABLE_COLORS[0] ?? "#e8dccb",
  };
}

function seedAreas(): FloorArea[] {
  return [
    {
      id: "salao",
      name: "Salão",
      tables: [
        table(1, 60, 60, "round", 2),
        table(2, 230, 60, "round", 2),
        table(3, 400, 60, "square", 4),
        table(4, 570, 60, "square", 4),
        table(5, 740, 60, "rect", 6),
        table(6, 60, 300, "rect", 6),
        table(7, 320, 300, "square", 4),
        table(8, 490, 300, "round", 2),
        table(9, 660, 300, "rect", 8),
        table(10, 60, 520, "square", 4),
        table(11, 230, 520, "square", 4),
      ],
    },
    {
      id: "varanda",
      name: "Varanda",
      tables: [
        { ...table(20, 80, 80, "round", 2), id: "t20" },
        { ...table(21, 260, 80, "round", 2), id: "t21" },
        { ...table(22, 440, 80, "square", 4), id: "t22" },
      ],
    },
  ];
}

export function seedData(): PosData {
  return {
    products: seedProducts(),
    areas: seedAreas(),
    orders: [],
    settings: {
      currency: "EUR",
      taxRate: 10,
      sumupAffiliateKey: "",
      paymentLink: "",
    },
    nextOrderNumber: 1,
  };
}
