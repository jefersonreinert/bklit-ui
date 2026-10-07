import type { IconName } from "@/lib/icons";
import type {
  Agent,
  AgentMcpServer,
  AgentSubagent,
  Effort,
  PermissionMode,
  SettingSource,
} from "./types";

/* --------------------------------- tools --------------------------------- */

export interface ToolInfo {
  name: string;
  label: string;
}

/** Built-in Claude Code tools (code.claude.com/docs/en/tools-reference). */
export const TOOL_GROUPS: { label: string; tools: ToolInfo[] }[] = [
  {
    label: "Arquivos",
    tools: [
      { name: "Read", label: "Ler arquivos" },
      { name: "Glob", label: "Encontrar arquivos" },
      { name: "Grep", label: "Buscar no conteúdo" },
      { name: "Edit", label: "Editar arquivos" },
      { name: "Write", label: "Criar arquivos" },
      { name: "NotebookEdit", label: "Editar notebooks" },
    ],
  },
  {
    label: "Terminal",
    tools: [
      { name: "Bash", label: "Rodar comandos" },
      { name: "Monitor", label: "Acompanhar processos" },
    ],
  },
  {
    label: "Web",
    tools: [
      { name: "WebSearch", label: "Pesquisar na web" },
      { name: "WebFetch", label: "Abrir páginas" },
    ],
  },
  {
    label: "Orquestração",
    tools: [
      { name: "Agent", label: "Chamar subagentes" },
      { name: "Skill", label: "Usar skills" },
      { name: "Workflow", label: "Workflows dinâmicos" },
      { name: "AskUserQuestion", label: "Perguntar ao usuário" },
    ],
  },
  {
    label: "MCP",
    tools: [
      { name: "ListMcpResourcesTool", label: "Listar recursos MCP" },
      { name: "ReadMcpResourceTool", label: "Ler recurso MCP" },
    ],
  },
];

export const TOOL_NAMES = TOOL_GROUPS.flatMap((g) =>
  g.tools.map((t) => t.name)
);

/** Tools offered to subagents (the Agent tool stays with the main agent). */
export const SUBAGENT_TOOLS = TOOL_NAMES.filter(
  (n) => n !== "Agent" && n !== "Workflow"
);

/* ------------------------------ permissions ------------------------------ */

export const PERMISSION_MODES: {
  id: PermissionMode;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: "default",
    label: "Padrão",
    description: "Pede aprovação para o que não estiver liberado.",
    icon: "IconShield",
  },
  {
    id: "acceptEdits",
    label: "Aceitar edições",
    description: "Edita arquivos sem pedir; comandos ainda pedem.",
    icon: "IconPencil",
  },
  {
    id: "dontAsk",
    label: "Não perguntar",
    description: "Nunca pergunta: nega o que não foi pré-aprovado.",
    icon: "IconShieldCheck",
  },
  {
    id: "plan",
    label: "Planejar",
    description: "Só explora e propõe um plano, sem alterar nada.",
    icon: "IconChecklist",
  },
  {
    id: "auto",
    label: "Automático",
    description: "Um classificador revisa cada ação antes de rodar.",
    icon: "IconSparklesSoft",
  },
  {
    id: "bypassPermissions",
    label: "Sem restrições",
    description: "Pula as checagens. Use só em ambiente isolado.",
    icon: "IconShieldCrossed",
  },
];

export const EFFORTS: { id: Effort | ""; label: string }[] = [
  { id: "", label: "Padrão" },
  { id: "low", label: "Baixo" },
  { id: "medium", label: "Médio" },
  { id: "high", label: "Alto" },
  { id: "xhigh", label: "Extra" },
  { id: "max", label: "Máx." },
];

export const SETTING_SOURCES: { id: SettingSource; label: string }[] = [
  { id: "project", label: "Projeto (.claude/settings.json)" },
  { id: "local", label: "Local (.claude/settings.local.json)" },
  { id: "user", label: "Usuário (~/.claude/settings.json)" },
];

/** Model aliases accepted by subagents besides full IDs. */
export const SUBAGENT_MODELS = [
  { id: "", label: "Padrão do SDK" },
  { id: "inherit", label: "Mesmo do agente" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "fable", label: "Fable" },
];

/* --------------------------------- looks --------------------------------- */

export const AGENT_COLORS = [
  "bg-[#d97757]/15 text-[#d97757]",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
];

export const AGENT_EMOJIS = [
  "🤖",
  "🧠",
  "🔎",
  "📝",
  "📊",
  "📬",
  "🛠️",
  "🧾",
  "🍷",
  "🍽️",
  "📅",
  "🚀",
  "🛡️",
  "💡",
  "📈",
  "🧹",
];

/* -------------------------------- triggers ------------------------------- */

export const CRON_PRESETS = [
  { cron: "0 8 * * *", label: "Todo dia às 8h" },
  { cron: "0 * * * *", label: "A cada hora" },
  { cron: "0 9 * * 1", label: "Segunda às 9h" },
  { cron: "0 23 * * *", label: "Fechamento (23h)" },
];

/* ---------------------------------- MCP ---------------------------------- */

type McpPreset = Omit<AgentMcpServer, "id">;

export const MCP_PRESETS: {
  label: string;
  icon: IconName;
  server: McpPreset;
}[] = [
  {
    label: "GitHub",
    icon: "IconGithub",
    server: {
      name: "github",
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: env placeholder resolved by the generated code
      headers: "Authorization: Bearer ${GITHUB_TOKEN}",
      command: "",
      args: "",
      autoApprove: false,
    },
  },
  {
    label: "Notion",
    icon: "IconNotion",
    server: {
      name: "notion",
      type: "http",
      url: "https://mcp.notion.com/mcp",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: env placeholder resolved by the generated code
      headers: "Authorization: Bearer ${NOTION_TOKEN}",
      command: "",
      args: "",
      autoApprove: false,
    },
  },
  {
    label: "HTTP",
    icon: "IconGlobe",
    server: {
      name: "servidor",
      type: "http",
      url: "https://",
      headers: "",
      command: "",
      args: "",
      autoApprove: false,
    },
  },
  {
    label: "Local (stdio)",
    icon: "IconConsole",
    server: {
      name: "local",
      type: "stdio",
      url: "",
      headers: "",
      command: "npx",
      args: "-y @modelcontextprotocol/server-filesystem ./",
      autoApprove: false,
    },
  },
];

/* -------------------------------- templates ------------------------------ */

export type AgentDraft = Omit<Agent, "id" | "createdAt" | "updatedAt">;

export const BLANK_DRAFT: AgentDraft = {
  name: "Novo agente",
  description: "",
  icon: "🤖",
  color: 0,
  enabled: true,
  prompt: "",
  systemMode: "preset",
  systemPrompt: "",
  model: "claude-opus-5-5",
  effort: "",
  maxTurns: 20,
  maxBudgetUsd: null,
  permissionMode: "default",
  allowedTools: ["Read", "Glob", "Grep"],
  disallowedTools: [],
  settingSources: ["project"],
  cwd: "",
  mcpServers: [],
  subagents: [],
  trigger: { type: "manual", cron: "0 8 * * *" },
};

type SubagentDraft = Omit<AgentSubagent, "id">;

export const AGENT_TEMPLATES: {
  id: string;
  title: string;
  hint: string;
  draft: AgentDraft;
  subagents?: SubagentDraft[];
  mcp?: string[];
}[] = [
  {
    id: "blank",
    title: "Em branco",
    hint: "Comece do zero",
    draft: BLANK_DRAFT,
  },
  {
    id: "daily",
    title: "Resumo diário",
    hint: "Toda manhã: vendas, reservas e notícias do setor",
    draft: {
      ...BLANK_DRAFT,
      name: "Resumo diário do restaurante",
      description: "Prepara o briefing da manhã com números e novidades.",
      icon: "📊",
      color: 4,
      prompt:
        "Leia os relatórios de vendas de ontem em ./relatorios, compare com a semana anterior e pesquise novidades relevantes para restaurantes em Portugal. Escreva um resumo curto em ./resumos/AAAA-MM-DD.md.",
      systemMode: "preset",
      systemPrompt:
        "Você é o analista do Casa Brasa. Seja objetivo, use euros e destaque riscos e oportunidades.",
      model: "claude-sonnet-5-5",
      permissionMode: "acceptEdits",
      allowedTools: ["Read", "Glob", "Grep", "Write", "WebSearch", "WebFetch"],
      trigger: { type: "schedule", cron: "0 8 * * *" },
    },
  },
  {
    id: "github",
    title: "Revisor de PRs",
    hint: "Revisa pull requests no GitHub com um subagente de segurança",
    draft: {
      ...BLANK_DRAFT,
      name: "Revisor de pull requests",
      description: "Revisa PRs abertos e comenta problemas encontrados.",
      icon: "🛡️",
      color: 3,
      prompt:
        "Liste os pull requests abertos do repositório, revise cada um e deixe um comentário com os problemas mais importantes. Use o security-reviewer para questões de segurança.",
      model: "claude-opus-5-5",
      effort: "high",
      maxBudgetUsd: 5,
      permissionMode: "dontAsk",
      allowedTools: ["Read", "Glob", "Grep", "Agent"],
      disallowedTools: ["Bash", "Write", "Edit"],
      trigger: { type: "webhook", cron: "0 8 * * *" },
    },
    mcp: ["github"],
    subagents: [
      {
        name: "security-reviewer",
        description:
          "Especialista em segurança. Use para revisar autenticação, segredos e entradas do usuário.",
        prompt:
          "Você revisa código procurando vulnerabilidades: injeção, segredos expostos, autenticação fraca e validação ausente. Responda com achados objetivos e como corrigir.",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet",
      },
    ],
  },
  {
    id: "research",
    title: "Pesquisador",
    hint: "Pesquisa na web e entrega um relatório com fontes",
    draft: {
      ...BLANK_DRAFT,
      name: "Pesquisador web",
      description: "Pesquisa um tema e escreve um relatório com fontes.",
      icon: "🔎",
      color: 1,
      prompt:
        "Pesquise fornecedores de carne premium em Lisboa, compare preços e condições e escreva um relatório em ./pesquisas/fornecedores.md com links das fontes.",
      systemMode: "custom",
      systemPrompt:
        "Você é um pesquisador meticuloso. Cite sempre as fontes e diga quando não tiver certeza.",
      model: "claude-sonnet-5-5",
      permissionMode: "acceptEdits",
      allowedTools: ["WebSearch", "WebFetch", "Write", "Agent"],
    },
    subagents: [
      {
        name: "fact-checker",
        description: "Confere fatos e números antes do relatório final.",
        prompt:
          "Confira cada afirmação e número do rascunho buscando uma segunda fonte. Liste o que não se confirmou.",
        tools: ["WebSearch", "WebFetch", "Read"],
        model: "haiku",
      },
    ],
  },
  {
    id: "notes",
    title: "Organizador de notas",
    hint: "Arruma, resume e conecta suas notas em Markdown",
    draft: {
      ...BLANK_DRAFT,
      name: "Organizador de notas",
      description: "Mantém as notas em Markdown organizadas e ligadas.",
      icon: "📝",
      color: 2,
      prompt:
        "Revise as notas em ./notas: corrija títulos, adicione links [[...]] entre notas relacionadas e crie um índice em ./notas/indice.md.",
      model: "claude-haiku-4-5",
      permissionMode: "acceptEdits",
      allowedTools: ["Read", "Glob", "Grep", "Edit", "Write"],
      trigger: { type: "schedule", cron: "0 23 * * *" },
    },
  },
];
