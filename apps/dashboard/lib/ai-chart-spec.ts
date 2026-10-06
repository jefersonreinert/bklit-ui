/**
 * Charts inside assistant replies. The model writes a fenced block
 *
 *   ```chart
 *   { "type": "bar", "title": "…", "x": "mes", "series": [...], "data": [...] }
 *   ```
 *
 * (or `{ "dataset": "receita_despesas" }` to reuse a chart from the panel),
 * and the chat renders it with the app's own chart components while the
 * answer streams. Shared by the server (instructions) and the client.
 */

export type ChartType =
  | "area"
  | "line"
  | "bar"
  | "bar-horizontal"
  | "pie"
  | "donut"
  | "kpi";

export type ChartFormat = "brl" | "percent" | "number";

export interface ChartSeries {
  key: string;
  label?: string;
}

export interface KpiItem {
  label: string;
  value: number;
  format?: ChartFormat;
  /** Change in percent, e.g. 4.2 or -1.5 */
  delta?: number;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  description?: string;
  /** Key of the category/date field in `data`. */
  x?: string;
  series?: ChartSeries[];
  data?: Record<string, unknown>[];
  format?: ChartFormat;
  stacked?: boolean;
  /** Pie/donut: [{ label, value }] — also accepted as `data`. */
  slices?: { label: string; value: number }[];
  items?: KpiItem[];
  /** Reuse a dataset from the panel (see DATASET_CATALOG). */
  dataset?: string;
}

/** Datasets the assistant can reuse; data lives in lib/ai-datasets.ts. */
export const DATASET_CATALOG: { id: string; type: ChartType; about: string }[] =
  [
    {
      id: "vendas_diarias",
      type: "area",
      about: "faturamento por dia, últimos 30 dias (R$)",
    },
    {
      id: "receita_despesas",
      type: "area",
      about: "receita líquida x despesas totais por mês, 12 meses (R$)",
    },
    {
      id: "resultado_mensal",
      type: "bar",
      about: "lucro/prejuízo líquido por mês, 12 meses (R$)",
    },
    {
      id: "saldo_caixa",
      type: "area",
      about: "saldo de caixa no fim de cada mês (R$)",
    },
    {
      id: "fluxo_caixa_semanal",
      type: "bar",
      about: "previsão de recebimentos x pagamentos, próximas 6 semanas (R$)",
    },
    {
      id: "recebiveis_aging",
      type: "bar-horizontal",
      about: "contas a receber por faixa de atraso (R$)",
    },
    {
      id: "mix_despesas",
      type: "donut",
      about: "despesas do mês por categoria (R$)",
    },
    {
      id: "top_pratos",
      type: "bar-horizontal",
      about: "pratos mais vendidos no mês (unidades)",
    },
    {
      id: "receita_categoria",
      type: "donut",
      about: "receita do cardápio por categoria (R$)",
    },
    {
      id: "cmv_categoria",
      type: "bar",
      about: "CMV % por categoria do cardápio",
    },
    { id: "equipe_setor", type: "donut", about: "colaboradores por setor" },
    {
      id: "salario_cargo",
      type: "bar-horizontal",
      about: "salário médio por cargo (R$)",
    },
    {
      id: "folha_composicao",
      type: "donut",
      about: "composição da folha: salários, encargos, benefícios (R$)",
    },
    {
      id: "bebidas_diarias",
      type: "area",
      about: "receita diária de bebidas por tipo, 30 dias (R$)",
    },
  ];

export const CHART_INSTRUCTIONS = `## Gráficos na resposta
O chat desenha gráficos com os componentes do painel. Use gráficos quando ajudarem: comparações, evolução no tempo, composição, ou sempre que a pessoa pedir ("mostre", "gráfico", "visualize"). Pode incluir vários gráficos na mesma resposta, intercalados com o texto. Para cada gráfico escreva um bloco cercado com a linguagem chart contendo JSON válido (sem comentários):

\`\`\`chart
{"type":"bar","title":"Vendas por turno","x":"turno","format":"number","series":[{"key":"pedidos","label":"Pedidos"}],"data":[{"turno":"Almoço","pedidos":180},{"turno":"Jantar","pedidos":260}]}
\`\`\`

Tipos:
- "area" ou "line": evolução no tempo. "x" deve conter datas ISO ("2026-09-01") ou meses ("2026-09"). Uma ou mais séries.
- "bar": categorias no eixo X (meses como texto também servem); "stacked": true empilha as séries.
- "bar-horizontal": rankings e nomes longos (uma série).
- "pie" ou "donut": composição; use "slices": [{"label":"…","value":123}] (até 8 fatias).
- "kpi": cartões de números; "items": [{"label":"Faturamento","value":184320,"format":"brl","delta":4.2}].
"format": "brl" (reais), "percent" (valores já em %, ex. 27.6) ou "number". Use "title" curto e "description" opcional.

Para reproduzir gráficos que já existem no painel, com os dados exatos, use só o nome do conjunto: \`\`\`chart {"dataset":"receita_despesas","title":"Receita x despesas"} \`\`\`. Conjuntos disponíveis:
${DATASET_CATALOG.map((d) => `- ${d.id} (${d.type}): ${d.about}`).join("\n")}

Regras: só use números que estão nos dados do painel, nas ferramentas ou que a pessoa informou; no máximo 40 pontos por série e 4 séries por gráfico; comente o gráfico em uma ou duas frases antes ou depois dele.`;

const TYPES: ChartType[] = [
  "area",
  "line",
  "bar",
  "bar-horizontal",
  "pie",
  "donut",
  "kpi",
];
const MAX_POINTS = 60;
const MAX_SERIES = 6;

function checkKpi(spec: ChartSpec): ChartSpec | string {
  return Array.isArray(spec.items) && spec.items.length > 0
    ? { ...spec, items: spec.items.slice(0, 8) }
    : "Cartões sem itens.";
}

function checkPie(spec: ChartSpec): ChartSpec | string {
  const slices =
    spec.slices ??
    (spec.data as { label: string; value: number }[] | undefined);
  return Array.isArray(slices) && slices.length > 0
    ? { ...spec, slices: slices.slice(0, 12) }
    : "Gráfico de pizza sem fatias.";
}

/** Fills `x` and `series` from the data when the model left them out. */
function checkXY(spec: ChartSpec): ChartSpec | string {
  if (!(Array.isArray(spec.data) && spec.data.length > 0)) {
    return "Gráfico sem dados.";
  }
  const first = spec.data[0] ?? {};
  const x = spec.x ?? Object.keys(first)[0] ?? "x";
  const series = spec.series?.length
    ? spec.series
    : Object.keys(first)
        .filter((k) => k !== x && typeof first[k] === "number")
        .map((key) => ({ key }));
  if (series.length === 0) {
    return "Gráfico sem séries numéricas.";
  }
  return {
    ...spec,
    x,
    series: series.slice(0, MAX_SERIES),
    data: spec.data.slice(0, MAX_POINTS),
  };
}

/** Parses and sanity-checks a chart block; returns an error message on failure. */
export function parseChartSpec(source: string): ChartSpec | string {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return "O gráfico veio com JSON inválido.";
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "O gráfico precisa ser um objeto JSON.";
  }
  const spec = raw as ChartSpec;
  if (spec.dataset) {
    return spec;
  }
  if (!TYPES.includes(spec.type)) {
    return `Tipo de gráfico desconhecido: ${String(spec.type)}`;
  }
  if (spec.type === "kpi") {
    return checkKpi(spec);
  }
  if (spec.type === "pie" || spec.type === "donut") {
    return checkPie(spec);
  }
  return checkXY(spec);
}
