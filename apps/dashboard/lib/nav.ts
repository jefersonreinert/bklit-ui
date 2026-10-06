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
    href: "/ia",
    label: "Assistente IA",
    description: "Converse com o Claude sobre o seu restaurante",
    icon: "IconSparklesSoft",
  },
  {
    href: "/email",
    label: "E-mail",
    description: "Caixa de entrada do Gmail",
    icon: "IconEmail1",
  },
  {
    href: "/youtube",
    label: "YouTube",
    description: "Pesquisa, playlists e transcrição de vídeos",
    icon: "IconYoutube",
  },
  {
    href: "/conectores",
    label: "Conectores",
    description: "Notion, Gmail e Google Drive no assistente",
    icon: "IconConnectors1",
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
    href: "/bebidas",
    label: "Bebidas",
    description: "Vinhos, destilados, cervejas e coquetéis",
    icon: "IconDrink",
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
