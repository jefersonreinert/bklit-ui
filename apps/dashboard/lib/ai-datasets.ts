import type { ChartFormat, ChartSpec } from "./ai-chart-spec";
import { dailyBeverageRevenue } from "./beverage-data";
import { dailySales, expenseCategories, topDishes } from "./data";
import {
  cashBalanceSeries,
  netIncomeSeries,
  receivablesAging,
  revenueVsExpenses,
  weeklyCashForecast,
} from "./finance-data";
import { payrollComposition, salaryByRole, teamBySector } from "./hr-data";
import { cmvByCategory, revenueByCategory } from "./menu-data";

/**
 * Real panel data behind `{"dataset": "…"}` chart blocks, so the assistant
 * can redraw the charts the pages already show without copying numbers.
 */

const monthLabel = (d: unknown) =>
  d instanceof Date
    ? d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    : String(d);

const slices = (rows: { label: string; value: number }[]) =>
  rows.map((r) => ({ label: r.label, value: r.value }));

const series = (
  type: ChartSpec["type"],
  title: string,
  data: Record<string, unknown>[],
  x: string,
  keys: [string, string][],
  format: ChartFormat
): ChartSpec => ({
  type,
  title,
  x,
  data,
  format,
  series: keys.map(([key, label]) => ({ key, label })),
});

const DATASETS: Record<string, () => ChartSpec> = {
  vendas_diarias: () =>
    series(
      "area",
      "Faturamento diário",
      dailySales,
      "date",
      [["revenue", "Faturamento"]],
      "brl"
    ),
  receita_despesas: () =>
    series(
      "area",
      "Receita x despesas",
      revenueVsExpenses,
      "date",
      [
        ["receita", "Receita líquida"],
        ["despesas", "Despesas"],
      ],
      "brl"
    ),
  resultado_mensal: () =>
    series(
      "bar",
      "Resultado líquido mensal",
      netIncomeSeries.map((m) => ({
        mes: monthLabel(m.date),
        resultado: m.resultado,
      })),
      "mes",
      [["resultado", "Resultado"]],
      "brl"
    ),
  saldo_caixa: () =>
    series(
      "area",
      "Saldo de caixa",
      cashBalanceSeries,
      "date",
      [["caixa", "Caixa"]],
      "brl"
    ),
  fluxo_caixa_semanal: () =>
    series(
      "bar",
      "Fluxo de caixa previsto",
      weeklyCashForecast,
      "week",
      [
        ["recebimentos", "Recebimentos"],
        ["pagamentos", "Pagamentos"],
      ],
      "brl"
    ),
  recebiveis_aging: () =>
    series(
      "bar-horizontal",
      "Contas a receber por atraso",
      receivablesAging,
      "faixa",
      [["valor", "Valor"]],
      "brl"
    ),
  mix_despesas: () => ({
    type: "donut",
    title: "Despesas por categoria",
    format: "brl",
    slices: slices(expenseCategories),
  }),
  top_pratos: () =>
    series(
      "bar-horizontal",
      "Pratos mais vendidos",
      topDishes,
      "dish",
      [["sales", "Vendas"]],
      "number"
    ),
  receita_categoria: () => ({
    type: "donut",
    title: "Receita por categoria",
    format: "brl",
    slices: slices(revenueByCategory),
  }),
  cmv_categoria: () =>
    series(
      "bar",
      "CMV por categoria",
      cmvByCategory,
      "categoria",
      [["cmv", "CMV"]],
      "percent"
    ),
  equipe_setor: () => ({
    type: "donut",
    title: "Equipe por setor",
    format: "number",
    slices: slices(teamBySector),
  }),
  salario_cargo: () =>
    series(
      "bar-horizontal",
      "Salário médio por cargo",
      salaryByRole,
      "cargo",
      [["salario", "Salário"]],
      "brl"
    ),
  folha_composicao: () => ({
    type: "donut",
    title: "Composição da folha",
    format: "brl",
    slices: slices(payrollComposition),
  }),
  bebidas_diarias: () =>
    series(
      "area",
      "Receita diária de bebidas",
      dailyBeverageRevenue,
      "date",
      [
        ["vinhos", "Vinhos"],
        ["coqueteis", "Coquetéis"],
        ["cervejas", "Cervejas"],
        ["destilados", "Destilados"],
      ],
      "brl"
    ),
};

/** Resolves `{"dataset": "…"}`, letting the model override title/type. */
export function resolveDataset(spec: ChartSpec): ChartSpec | string {
  const build = spec.dataset ? DATASETS[spec.dataset] : undefined;
  if (!build) {
    return `Conjunto de dados desconhecido: ${spec.dataset}`;
  }
  const base = build();
  return {
    ...base,
    ...(spec.title ? { title: spec.title } : {}),
    ...(spec.description ? { description: spec.description } : {}),
    ...(spec.type ? { type: spec.type } : {}),
  };
}
