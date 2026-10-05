import type { IconName } from "@bklitui/icons";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    description: "Visão geral do restaurante",
    icon: "IconLayoutDashboard",
  },
  {
    href: "/financas",
    label: "Finanças",
    description: "Receitas, despesas e fluxo de caixa",
    icon: "IconCoins",
  },
  {
    href: "/rh",
    label: "Recursos Humanos",
    description: "Equipe, desempenho e escalas",
    icon: "IconPeople",
  },
  {
    href: "/cardapio",
    label: "Cardápio",
    description: "Pratos, vendas e margens",
    icon: "IconForkKnife",
  },
  {
    href: "/documentos",
    label: "Documentos",
    description: "Licenças, contratos e arquivos",
    icon: "IconFolder1",
  },
];

const TRAILING_SLASHES = /\/+$/;

export function normalizePath(pathname: string | null) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(TRAILING_SLASHES, "");
}
