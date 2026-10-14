"use client";

import type { IconName } from "@/lib/icons";
import { createLocalStore, uid } from "@/lib/local-store";

/**
 * The home screen (/): a wallpaper (photo or video) and widgets taken from
 * the app's pages. Kept in localStorage and mirrored to Convex
 * (SYNCED_KEYS), so every device opens the same home screen. The wallpaper
 * file itself lives in Convex storage; only its URL is stored here.
 */

export type WidgetType =
  | "escala"
  | "ferry"
  | "clima"
  | "noticias"
  | "mercados"
  | "pos"
  | "financas"
  | "notas"
  | "atalhos"
  | "vendas"
  | "metas"
  | "ocupacao"
  | "fluxo"
  | "pratos"
  | "pedidos"
  | "movimento"
  | "funil"
  | "pagina";

/** s = 1 column, m = 2 columns, l = the whole row. */
export type WidgetSize = "s" | "m" | "l";

export interface HomeWidget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  /** "pagina": the app page shown inside the widget. */
  href?: string;
}

export interface Wallpaper {
  url: string;
  kind: "image" | "video";
  /** Convex storage id, deleted when the wallpaper is replaced. */
  storageId: string;
}

export interface HomeData {
  widgets: HomeWidget[];
  /** Pages in the dock at the bottom (nav hrefs). */
  dock: string[];
  wallpaper: Wallpaper | null;
  /** How much the wallpaper is darkened, 0–0.8. */
  dim: number;
}

export interface WidgetInfo {
  type: WidgetType;
  name: string;
  description: string;
  icon: IconName;
  group: "Dia a dia" | "Restaurante" | "Dashboard" | "Apps";
  size: WidgetSize;
  /** Sizes that make sense for it. */
  sizes: WidgetSize[];
  /** Page it comes from (tapping the title opens it). */
  href?: string;
}

const ALL: WidgetSize[] = ["s", "m", "l"];
const WIDE: WidgetSize[] = ["m", "l"];

export const WIDGET_CATALOG: WidgetInfo[] = [
  {
    type: "escala",
    name: "Escala de hoje",
    description: "Seu próximo turno, onde e o ponto",
    icon: "IconCalendarClock",
    group: "Dia a dia",
    size: "m",
    sizes: ALL,
    href: "/escala",
  },
  {
    type: "ferry",
    name: "Ferry",
    description: "Próximas saídas Sliema ↔ Bugibba",
    icon: "IconShip",
    group: "Dia a dia",
    size: "m",
    sizes: ALL,
    href: "/ferry",
  },
  {
    type: "clima",
    name: "Clima",
    description: "Temperatura e previsão de hoje",
    icon: "IconSun",
    group: "Dia a dia",
    size: "s",
    sizes: ["s", "m"],
  },
  {
    type: "noticias",
    name: "Notícias",
    description: "Manchetes dos seus feeds",
    icon: "IconNewspaper",
    group: "Dia a dia",
    size: "m",
    sizes: WIDE,
    href: "/noticias",
  },
  {
    type: "notas",
    name: "Notas",
    description: "Notas fixadas e as mais recentes",
    icon: "IconNotes",
    group: "Dia a dia",
    size: "m",
    sizes: ALL,
    href: "/notas",
  },
  {
    type: "mercados",
    name: "Mercados",
    description: "Cotações da sua lista de ativos",
    icon: "IconChart1",
    group: "Dia a dia",
    size: "m",
    sizes: ALL,
    href: "/graficos",
  },
  {
    type: "financas",
    name: "Finanças pessoais",
    description: "Saldo, entradas e saídas do mês",
    icon: "IconBank",
    group: "Dia a dia",
    size: "m",
    sizes: ALL,
    href: "/financas-pessoais",
  },
  {
    type: "pos",
    name: "Vendas do POS",
    description: "Vendas, pedidos e ticket de hoje",
    icon: "IconCash",
    group: "Restaurante",
    size: "m",
    sizes: ALL,
    href: "/pos",
  },
  {
    type: "vendas",
    name: "Vendas diárias",
    description: "Pedidos e faturamento por dia",
    icon: "IconChart1",
    group: "Dashboard",
    size: "l",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "metas",
    name: "Metas do mês",
    description: "Progresso das metas",
    icon: "IconTarget",
    group: "Dashboard",
    size: "m",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "ocupacao",
    name: "Ocupação do salão",
    description: "Mesas ocupadas agora",
    icon: "IconGauge",
    group: "Dashboard",
    size: "s",
    sizes: ALL,
    href: "/dashboard",
  },
  {
    type: "fluxo",
    name: "Fluxo em tempo real",
    description: "Pedidos por minuto na cozinha",
    icon: "IconChart1",
    group: "Dashboard",
    size: "m",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "pratos",
    name: "Pratos mais vendidos",
    description: "Unidades vendidas no mês",
    icon: "IconForkKnife",
    group: "Dashboard",
    size: "m",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "pedidos",
    name: "Pedidos recentes",
    description: "Últimos pedidos registrados",
    icon: "IconReceiptBill",
    group: "Dashboard",
    size: "m",
    sizes: ALL,
    href: "/dashboard",
  },
  {
    type: "movimento",
    name: "Movimento do salão",
    description: "Clientes por dia nos últimos meses",
    icon: "IconCalendarClock",
    group: "Dashboard",
    size: "l",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "funil",
    name: "Jornada do cliente",
    description: "Da visita à avaliação 5★",
    icon: "IconTarget",
    group: "Dashboard",
    size: "m",
    sizes: WIDE,
    href: "/dashboard",
  },
  {
    type: "atalhos",
    name: "Atalhos",
    description: "Ícones para abrir as páginas do app",
    icon: "IconApps",
    group: "Apps",
    size: "m",
    sizes: ALL,
  },
  {
    type: "pagina",
    name: "Qualquer página",
    description: "Uma página inteira do app dentro do widget",
    icon: "IconWindow",
    group: "Apps",
    size: "l",
    sizes: ALL,
  },
];

export const widgetInfo = (type: WidgetType) =>
  WIDGET_CATALOG.find((w) => w.type === type);

const widget = (type: WidgetType, size?: WidgetSize): HomeWidget => ({
  id: uid("w"),
  type,
  size: size ?? widgetInfo(type)?.size ?? "m",
});

export const DEFAULT_DOCK = [
  "/dashboard",
  "/escala",
  "/pos",
  "/whatsapp",
  "/ia",
  "/ferry",
];

const DEFAULT_HOME: HomeData = {
  widgets: [
    widget("escala"),
    widget("clima"),
    widget("ocupacao"),
    widget("ferry"),
    widget("noticias"),
    widget("vendas"),
  ],
  dock: DEFAULT_DOCK,
  wallpaper: null,
  dim: 0.35,
};

export const homeStore = createLocalStore<HomeData>("cb:home:v1", DEFAULT_HOME);

export const useHome = homeStore.use;

export function addWidget(type: WidgetType, href?: string) {
  homeStore.update((h) => ({
    ...h,
    widgets: [...h.widgets, { ...widget(type), ...(href ? { href } : {}) }],
  }));
}

export function removeWidget(id: string) {
  homeStore.update((h) => ({
    ...h,
    widgets: h.widgets.filter((w) => w.id !== id),
  }));
}

/** Moves a widget one place back (-1) or forward (+1). */
export function moveWidget(id: string, step: -1 | 1) {
  homeStore.update((h) => {
    const i = h.widgets.findIndex((w) => w.id === id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= h.widgets.length) {
      return h;
    }
    const widgets = [...h.widgets];
    const [moved] = widgets.splice(i, 1);
    if (moved) {
      widgets.splice(j, 0, moved);
    }
    return { ...h, widgets };
  });
}

/** Next size this widget allows (s → m → l → s). */
export function nextSize(w: HomeWidget): WidgetSize {
  const sizes = widgetInfo(w.type)?.sizes ?? ALL;
  const i = sizes.indexOf(w.size);
  return sizes[(i + 1) % sizes.length] ?? w.size;
}

export function resizeWidget(id: string) {
  homeStore.update((h) => ({
    ...h,
    widgets: h.widgets.map((w) =>
      w.id === id ? { ...w, size: nextSize(w) } : w
    ),
  }));
}

export function toggleDock(href: string) {
  homeStore.update((h) => ({
    ...h,
    dock: h.dock.includes(href)
      ? h.dock.filter((d) => d !== href)
      : [...h.dock, href],
  }));
}

export const setDim = (dim: number) =>
  homeStore.update((h) => ({ ...h, dim: Math.min(0.8, Math.max(0, dim)) }));

export const setWallpaper = (wallpaper: Wallpaper | null) =>
  homeStore.update((h) => ({ ...h, wallpaper }));

/** Grid columns a widget spans (2 columns on phones, 4 from md). */
export const SIZE_CLASS: Record<WidgetSize, string> = {
  s: "col-span-1",
  m: "col-span-2",
  l: "col-span-2 md:col-span-4",
};

export const SIZE_LABEL: Record<WidgetSize, string> = {
  s: "Pequeno",
  m: "Médio",
  l: "Grande",
};
