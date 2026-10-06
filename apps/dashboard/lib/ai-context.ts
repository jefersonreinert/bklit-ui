import {
  cmvTargets,
  initialBeverageState,
  inventoryRows,
  kindLabel,
  menuLines,
} from "./beverage-data";
import { overviewStats, RESTAURANT_NAME, TODAY } from "./data";
import { bills, fundamentalIndicators, summarize } from "./finance-data";
import { employees, hrSummary, openPositions, timeClock } from "./hr-data";
import {
  dishCmv,
  dishes,
  menuEngineering,
  menuSummary,
  stock,
  stockDays,
} from "./menu-data";

/**
 * Compact, plain-text snapshot of the restaurant used as the assistant's
 * business context (server-side system prompt) and by the demo answers.
 * Deterministic: built from the same mock data the dashboard renders.
 */

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export function financeSnapshot() {
  const month = summarize("mes");
  const year = summarize("ano");
  const ind = fundamentalIndicators();
  const overdue = bills.filter((b) => b.status === "Atrasado");
  return {
    month,
    year,
    ind,
    overdue,
    text: [
      "## Finanças (mês atual)",
      `- Receita bruta ${brl(month.grossRevenue)} · receita líquida ${brl(month.netRevenue)} (${month.trends.netRevenue === undefined ? "sem comparação" : `${month.trends.netRevenue >= 0 ? "+" : ""}${pct(month.trends.netRevenue)} vs mês anterior`})`,
      `- CMV ${brl(month.cmv)} (${pct(month.cmvRatio)} da receita líquida) · lucro bruto ${brl(month.grossProfit)} (margem ${pct(month.grossMargin)})`,
      `- Despesas operacionais ${brl(month.opex)}: folha ${brl(month.payroll)}, aluguel ${brl(month.rent)}, utilidades ${brl(month.utilities)}, marketing ${brl(month.marketing)}, manutenção ${brl(month.maintenance)}, administrativas ${brl(month.admin)}`,
      `- EBITDA ${brl(month.ebitda)} (margem ${pct(month.ebitdaMargin)}) · lucro líquido ${brl(month.netIncome)} (margem ${pct(month.netMargin)})`,
      `- Últimos 12 meses: receita líquida ${brl(year.netRevenue)}, lucro líquido ${brl(year.netIncome)} (margem ${pct(year.netMargin)})`,
      `- Caixa ${brl(month.cashBalance)} · cobre ${ind.runwayMonths.toFixed(1).replace(".", ",")} mês(es) de custos`,
      `- Ponto de equilíbrio mensal ${brl(ind.breakEven)} · margem de segurança ${pct(ind.safetyMargin)}`,
      `- Liquidez corrente ${ind.currentRatio.toFixed(2)}x · liquidez seca ${ind.quickRatio.toFixed(2)}x · endividamento ${pct(ind.debtToEquity)} · ROI ${pct(ind.roi)} · ROE ${pct(ind.roe)}`,
      `- Ciclo de caixa ${ind.cashCycle} dias (PMR ${ind.pmr}d, PME ${ind.pme}d, PMP ${ind.pmp}d) · inadimplência ${pct(ind.delinquency)}`,
      `- Contas em atraso: ${overdue.map((b) => `${b.description} (${b.supplier}) ${brl(b.amount)}`).join("; ") || "nenhuma"}`,
    ].join("\n"),
  };
}

export function hrSnapshot() {
  const late = timeClock.filter(
    (t) => t.status === "Atraso" || t.status === "Ausente"
  );
  return {
    late,
    text: [
      "## Recursos humanos",
      `- ${hrSummary.headcount} colaboradores (${hrSummary.onVacation} em férias, ${hrSummary.onLeave} afastado(s), ${hrSummary.probation} em experiência)`,
      `- Folha mensal total ${brl(hrSummary.payroll)} (${pct(hrSummary.payrollOverRevenue)} da receita) · salário médio ${brl(hrSummary.avgSalary)} · custo per capita ${brl(hrSummary.payrollPerCapita)}`,
      `- Turnover ${pct(hrSummary.turnover)} ao mês · absenteísmo ${pct(hrSummary.absenteeism)} · horas extras ${hrSummary.overtimeHours} h (${brl(hrSummary.overtimeCost)}) · eNPS ${hrSummary.enps}`,
      `- Equipe: ${employees.map((e) => `${e.name} (${e.role}, ${e.sector}, ${e.status}, desempenho ${e.performance})`).join("; ")}`,
      `- Ponto de hoje — atrasos/ausências: ${late.map((t) => `${t.name} (${t.status})`).join(", ") || "nenhum"}`,
      `- Vagas abertas: ${openPositions.map((p) => `${p.role} (${p.candidates} candidatos, urgência ${p.urgency})`).join("; ")}`,
    ].join("\n"),
  };
}

export function menuSnapshot() {
  const engineering = menuEngineering(dishes);
  const highCmv = [...dishes]
    .sort((a, b) => dishCmv(b) - dishCmv(a))
    .slice(0, 5);
  const lowStock = stock.filter((s) => s.current < s.min);
  return {
    engineering,
    highCmv,
    lowStock,
    text: [
      "## Cardápio (cozinha)",
      `- ${menuSummary.activeItems}/${menuSummary.totalItems} pratos ativos · ${menuSummary.totalSales} itens vendidos no mês · CMV ponderado ${pct(menuSummary.weightedCmv)} · nota média ${menuSummary.avgRating.toFixed(2)}`,
      `- Mais vendido: ${menuSummary.best.name} (${menuSummary.best.sales})`,
      `- Engenharia de cardápio: ${(
        ["Estrela", "Burro de carga", "Quebra-cabeça", "Abacaxi"] as const
      )
        .map(
          (q) =>
            `${q}: ${engineering
              .filter((r) => r.quadrant === q)
              .map((r) => r.dish.name)
              .join(", ")}`
        )
        .join(" | ")}`,
      `- Maiores CMV: ${highCmv.map((d) => `${d.name} ${pct(dishCmv(d))} (preço ${brl(d.price)})`).join("; ")}`,
      `- Insumos abaixo do mínimo: ${lowStock.map((s) => `${s.name} ${s.current}/${s.min} ${s.unit} (dura ${stockDays(s).toFixed(1)} dias)`).join("; ") || "nenhum"}`,
    ].join("\n"),
  };
}

export function beverageSnapshot() {
  const lines = menuLines(initialBeverageState);
  const inv = inventoryRows(initialBeverageState);
  const revenue = lines.reduce((a, l) => a + l.revenue, 0);
  const profit = lines.reduce((a, l) => a + l.profit, 0);
  const over = lines
    .filter((l) => l.cmv > cmvTargets[l.kind])
    .sort((a, b) => b.cmv - a.cmv)
    .slice(0, 6);
  const low = inv.filter((r) => r.stock <= r.min);
  const top = [...lines].sort((a, b) => b.profit - a.profit).slice(0, 5);
  return {
    lines,
    over,
    low,
    top,
    revenue,
    profit,
    text: [
      "## Bebidas (bar e adega)",
      `- Receita do mês ${brl(revenue)} · lucro bruto ${brl(profit)} · CMV médio ${pct((1 - profit / revenue) * 100)}`,
      `- Metas de CMV: ${Object.entries(cmvTargets)
        .map(([k, v]) => `${kindLabel[k as keyof typeof kindLabel]} ${v}%`)
        .join(", ")}`,
      `- Mais lucrativos: ${top.map((l) => `${l.name} ${brl(l.profit)}`).join("; ")}`,
      `- Acima da meta de CMV: ${over.map((l) => `${l.name} (${kindLabel[l.kind]}) ${pct(l.cmv)} · preço ${brl(l.price)}`).join("; ") || "nenhum"}`,
      `- Estoque abaixo do mínimo: ${low.map((r) => `${r.name} ${r.stock}/${r.min} ${r.unit}`).join("; ") || "nenhum"}`,
      `- Carta: ${lines.length} itens (${(["vinho", "destilado", "cerveja", "coquetel", "sem-alcool"] as const).map((k) => `${lines.filter((l) => l.kind === k).length} ${kindLabel[k].toLowerCase()}`).join(", ")})`,
    ].join("\n"),
  };
}

export function businessContext() {
  return [
    `# ${RESTAURANT_NAME} — dados do painel em ${TODAY.toLocaleDateString("pt-BR")}`,
    `Visão geral: faturamento dos últimos 30 dias ${brl(overviewStats.revenue)}, ${overviewStats.orders} pedidos, ticket médio ${brl(overviewStats.ticket)}, ocupação ${overviewStats.occupancy}%.`,
    financeSnapshot().text,
    hrSnapshot().text,
    menuSnapshot().text,
    beverageSnapshot().text,
  ].join("\n\n");
}

export const SYSTEM_PROMPT = `Você é o assistente de gestão do restaurante ${RESTAURANT_NAME}, integrado ao painel administrativo. Você ajuda a pessoa responsável pela gestão (o nome dela vem logo abaixo) a entender números e tomar decisões sobre finanças, equipe, cardápio, bebidas e estoque.

Como responder:
- Responda sempre em português do Brasil, de forma direta e prática, como um consultor experiente de restaurantes.
- Baseie-se nos dados do painel abaixo. Cite os números relevantes e diga de onde vêm (ex.: "na aba Finanças"). Se um dado não estiver no painel, diga que não está disponível em vez de inventar.
- Quando houver um problema, explique a causa provável e proponha ações concretas com impacto estimado.
- Use markdown: títulos curtos, listas e tabelas quando ajudarem. Valores em R$ no formato brasileiro.
- Os dados são uma fotografia do painel; mudanças feitas na tela durante a sessão não aparecem aqui.

<dados_do_painel>
${businessContext()}
</dados_do_painel>`;
