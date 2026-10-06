import {
  beverageSnapshot,
  financeSnapshot,
  hrSnapshot,
  menuSnapshot,
} from "./ai-context";
import { cmvTargets, kindLabel } from "./beverage-data";
import { overviewStats } from "./data";
import { hrSummary } from "./hr-data";
import { dishCmv } from "./menu-data";

/**
 * Offline "demo mode" answers built from the dashboard data, used when the
 * server has no ANTHROPIC_API_KEY (or on the static GitHub Pages build).
 */

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** A chart block the chat renders with the panel's chart components. */
const chart = (spec: Record<string, unknown>) =>
  `\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\`\n`;

const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

function financeAnswer() {
  const { month, ind, overdue } = financeSnapshot();
  return `## Resumo financeiro do mês
${chart({
  type: "kpi",
  items: [
    { label: "Receita líquida", value: month.netRevenue, format: "brl" },
    { label: "Lucro líquido", value: month.netIncome, format: "brl" },
    {
      label: "CMV",
      value: Math.round(month.cmvRatio * 10) / 10,
      format: "percent",
    },
  ],
})}
${chart({ dataset: "receita_despesas", title: "Receita x despesas — 12 meses" })}
| Indicador | Valor |
|---|---|
| Receita líquida | ${brl(month.netRevenue)} |
| CMV | ${brl(month.cmv)} (${pct(month.cmvRatio)}) |
| EBITDA | ${brl(month.ebitda)} (${pct(month.ebitdaMargin)}) |
| Lucro líquido | ${brl(month.netIncome)} (${pct(month.netMargin)}) |
| Caixa | ${brl(month.cashBalance)} |
| Ponto de equilíbrio | ${brl(ind.breakEven)} |

**O que chama atenção**
- A margem de segurança está em **${pct(ind.safetyMargin)}** acima do ponto de equilíbrio — confortável, mas a folha (${brl(month.payroll)}) é o maior custo fixo.
- Liquidez corrente de **${ind.currentRatio.toFixed(2).replace(".", ",")}x** e ciclo de caixa de **${ind.cashCycle} dias**: você recebe antes de pagar, o que ajuda o fluxo.
${overdue.length > 0 ? `- Há **${overdue.length} contas em atraso** (${overdue.map((b) => `${b.description} — ${brl(b.amount)}`).join("; ")}). Priorize regularizar o fornecedor de carnes para não travar o abastecimento.` : ""}

${chart({ dataset: "mix_despesas", title: "Para onde vai o dinheiro" })}
**Próximos passos sugeridos**
1. Revisar o orçamento de marketing e manutenção, que oscilam mais mês a mês.
2. Negociar prazo com o Frigorífico Sul — é o insumo de maior peso no CMV.
3. Acompanhar o fôlego de caixa semanalmente na aba **Finanças → Fluxo de caixa**.`;
}

function menuAnswer() {
  const { engineering, highCmv, lowStock } = menuSnapshot();
  const plow = engineering
    .filter((r) => r.quadrant === "Burro de carga")
    .slice(0, 4);
  const dogs = engineering.filter((r) => r.quadrant === "Abacaxi");
  return `## Cardápio: onde ganhar margem
${chart({ dataset: "cmv_categoria", title: "CMV por categoria" })}
**Pratos com maior CMV**

| Prato | CMV | Preço atual | Preço p/ CMV 30% |
|---|---|---|---|
${highCmv.map((d) => `| ${d.name} | ${pct(dishCmv(d))} | ${brl(d.price)} | ${brl(Math.ceil((d.price * dishCmv(d)) / 100 / 0.3))} |`).join("\n")}

${chart({
  type: "bar-horizontal",
  title: "Pratos com maior CMV",
  x: "prato",
  format: "percent",
  series: [{ key: "cmv", label: "CMV" }],
  data: highCmv.map((d) => ({
    prato: d.name,
    cmv: Math.round(dishCmv(d) * 10) / 10,
  })),
})}
**Engenharia de cardápio**
- *Burros de carga* (vendem muito, margem baixa): ${plow.map((r) => r.dish.name).join(", ")} — teste porções ou um reajuste de 5–8%.
- *Abacaxis* (pouca venda e margem): ${dogs.map((r) => r.dish.name).join(", ") || "nenhum"} — candidatos a reformular ou sair da carta.
${lowStock.length > 0 ? `\n> ⚠️ Insumos abaixo do mínimo: ${lowStock.map((s) => s.name).join(", ")}. Veja o pedido sugerido em **Cardápio → Estoque**.` : ""}`;
}

function beverageAnswer() {
  const { over, top, revenue, profit, low } = beverageSnapshot();
  return `## Bebidas: desempenho do bar

Receita do mês **${brl(revenue)}**, lucro bruto **${brl(profit)}** (CMV médio ${pct((1 - profit / revenue) * 100)}).

${chart({ dataset: "bebidas_diarias", title: "Receita diária por tipo de bebida" })}
**Mais lucrativos:** ${top.map((l) => `${l.name} (${brl(l.profit)})`).join(", ")}.

**Acima da meta de CMV**

| Item | Tipo | CMV | Meta |
|---|---|---|---|
${over.map((l) => `| ${l.name} | ${kindLabel[l.kind]} | ${pct(l.cmv)} | ${cmvTargets[l.kind]}% |`).join("\n") || "| — | — | — | — |"}

**Sugestões**
- Para destilados premium, venda em dose de 40 ml ou ajuste o preço da dose — o pour cost ideal fica perto de 20%.
- Coquetéis autorais podem usar a cachaça prata como base e o rótulo premium só como *float*, reduzindo o custo.
${low.length > 0 ? `- Repor: ${low.map((r) => `${r.name} (${r.stock}/${r.min} ${r.unit})`).join(", ")}.` : ""}`;
}

function hrAnswer() {
  const { late } = hrSnapshot();
  return `## Equipe hoje

- Atrasos/ausências no ponto: ${late.map((t) => `**${t.name}** (${t.status})`).join(", ") || "nenhum"}.
- Horas extras do mês: **${hrSummary.overtimeHours} h** (${brl(hrSummary.overtimeCost)}) — concentradas na cozinha no jantar de sexta e sábado.

${chart({ dataset: "equipe_setor", title: "Equipe por setor" })}
**Recomendações**
1. Escalar um intermitente extra na cozinha sexta e sábado à noite: custa menos que as horas extras com adicional de 50%.
2. Conversar com quem acumula faltas antes da avaliação de desempenho do Q4.
3. Acelerar a vaga de *Cozinheiro(a) de linha* — a candidata Mariana Lopes está no teste prático com nota 86.

Detalhes em **Recursos Humanos → Escala & ponto**.`;
}

function chartsAnswer() {
  return `## Painel do mês em gráficos

Faturamento dos últimos 30 dias: **${brl(overviewStats.revenue)}** em ${overviewStats.orders} pedidos.
${chart({ dataset: "vendas_diarias", title: "Faturamento diário" })}
O caixa vem crescendo mês a mês, e o fluxo das próximas semanas segue positivo:
${chart({ dataset: "saldo_caixa", title: "Saldo de caixa" })}
${chart({ dataset: "fluxo_caixa_semanal", title: "Recebimentos x pagamentos — próximas semanas" })}
No cardápio, a picanha lidera com folga:
${chart({ dataset: "top_pratos" })}
Peça qualquer outro gráfico — por exemplo *"gráfico da folha por setor"* ou *"compare vinhos e coquetéis"*.`;
}

function overviewAnswer() {
  return `## Como posso ajudar?

Hoje o restaurante faturou **${brl(overviewStats.revenue)}** nos últimos 30 dias, com **${overviewStats.orders} pedidos** e ticket médio de **${brl(overviewStats.ticket)}**.

Posso analisar, por exemplo:
- **Finanças** — lucro, margens, caixa, contas em atraso e ponto de equilíbrio
- **Cardápio** — pratos com CMV alto, engenharia de cardápio e preço sugerido
- **Bebidas** — carta de vinhos, coquetéis, pour cost e estoque do bar
- **Equipe** — escala, horas extras, ponto do dia e vagas abertas

Pergunte algo como *“quais pratos devo reajustar?”* ou *“como está o caixa?”*.`;
}

export function demoAnswer(question: string) {
  const q = norm(question);
  if (
    has(q, [
      "vinho",
      "bebida",
      "drink",
      "coquetel",
      "cocktail",
      "bar",
      "cerveja",
      "chope",
      "destilad",
      "gin",
      "whisky",
      "dose",
    ])
  ) {
    return beverageAnswer();
  }
  if (
    has(q, [
      "cmv",
      "prato",
      "cardapio",
      "menu",
      "preco",
      "reajust",
      "ficha",
      "insumo",
      "estoque",
    ])
  ) {
    return menuAnswer();
  }
  if (
    has(q, [
      "equipe",
      "funcionari",
      "colaborador",
      "escala",
      "rh",
      "folha de pag",
      "ponto",
      "hora extra",
      "contrat",
      "vaga",
    ])
  ) {
    return hrAnswer();
  }
  if (
    has(q, [
      "financ",
      "lucro",
      "caixa",
      "margem",
      "receita",
      "despesa",
      "dre",
      "ebitda",
      "conta",
      "fatur",
      "custo",
    ])
  ) {
    return financeAnswer();
  }
  if (has(q, ["grafic", "visualiz", "dashboard", "mostre", "mostra"])) {
    return chartsAnswer();
  }
  return overviewAnswer();
}
