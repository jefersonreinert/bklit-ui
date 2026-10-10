import type { IconName } from "@/lib/icons";

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
    href: "/agentes",
    label: "Agentes",
    description: "Crie, salve e edite agentes automáticos (Claude Agent SDK)",
    icon: "IconAgents",
  },
  {
    href: "/code",
    label: "Code",
    description: "Sessões do Claude na nuvem nos seus repositórios do GitHub",
    icon: "IconCodeAssistant",
  },
  {
    href: "/voz",
    label: "Voz",
    description: "Escuta contínua, conversa por voz e anotações",
    icon: "IconMicrophone",
  },
  {
    href: "/email",
    label: "E-mail",
    description: "Caixa de entrada do Gmail",
    icon: "IconEmail1",
  },
  {
    href: "/whatsapp",
    label: "WhatsApp",
    description: "Suas conversas do WhatsApp",
    icon: "IconWhatsapp",
  },
  {
    href: "/telegram",
    label: "Telegram",
    description: "Conversas, busca e todas as ferramentas do Telegram",
    icon: "IconTelegram",
  },
  {
    href: "/videos",
    label: "Meus vídeos",
    description: "Biblioteca: salvos, playlists e player",
    icon: "IconPlayCircle",
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
    description: "Notion, GitHub, Gmail, Drive, YouTube, WhatsApp e Telegram",
    icon: "IconConnectors1",
  },
  {
    href: "/navegador",
    label: "Navegador",
    description: "Seus sites, favoritos e histórico",
    icon: "IconGlobe",
  },
  {
    href: "/noticias",
    label: "Notícias financeiras",
    description:
      "Mercados, economia e empresas: MarketWatch, Bloomberg, Investing.com…",
    icon: "IconNewspaper",
  },
  {
    href: "/graficos",
    label: "Gráficos",
    description:
      "Forex, ouro, índices, ações e cripto em tempo real, com desenhos e replay",
    icon: "IconTradingViewCandles",
  },
  {
    href: "/ict",
    label: "The Inner Circle Trader",
    description:
      "ICT Monitor: posts de @I_Am_The_ICT no X, analisados pelo Grok",
    icon: "IconTarget",
  },
  {
    href: "/calendario",
    label: "Calendário econômico",
    description:
      "Indicadores e eventos que movem o mercado, com impacto e resultados",
    icon: "IconCalendarClock",
  },
  {
    href: "/notas",
    label: "Notas",
    description: "Notas em Markdown, gráficos, mídias e grafo de conexões",
    icon: "IconNotebook",
  },
  {
    href: "/pos",
    label: "POS",
    description: "Caixa, mesas, pedidos e pagamentos",
    icon: "IconStore1",
  },
  {
    href: "/financas",
    label: "Finanças",
    description: "Receitas, despesas e fluxo de caixa",
    icon: "IconCoins",
  },
  {
    href: "/financas-pessoais",
    label: "Finanças Pessoais",
    description: "Extratos do banco viram dashboard automaticamente",
    icon: "IconWallet2",
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
  {
    href: "/configuracoes",
    label: "Configurações",
    description: "Perfil, tema e tipografia",
    icon: "IconSettingsGear1",
  },
];

const TRAILING_SLASHES = /\/+$/;

export function normalizePath(pathname: string | null) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(TRAILING_SLASHES, "");
}
