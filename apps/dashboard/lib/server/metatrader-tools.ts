import type Anthropic from "@anthropic-ai/sdk";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  findMtTool,
  MT_MODULES,
  MT_TIMEFRAMES,
  MT_TOOLS,
  TIER_LABEL,
} from "@/lib/metatrader/catalog";
import { convexUrl, signPanelToken } from "./panel-jwt";

/**
 * MetaTrader 5 for the assistant: every tool of metatrader-mcp-server
 * behind two client tools (look up parameters, run). Calls go through the
 * Convex action, which holds the server address and auth headers and only
 * lets the assistant trade when Conectores → MetaTrader allows it. The
 * instructions follow the repository's Trading Terminal Assistant skill.
 */

type BetaTool = Anthropic.Beta.BetaTool;

const RUN = "metatrader_executar";
const SCHEMA = "metatrader_parametros";
const MAX_RESULT = 60_000;

export const METATRADER_TOOLS: BetaTool[] = [
  {
    name: RUN,
    description:
      "Executa uma ferramenta do MetaTrader 5 (metatrader-mcp-server da pessoa) pelo nome, com os argumentos dela. Devolve dict/lista em JSON ou CSV.",
    input_schema: {
      type: "object",
      properties: {
        ferramenta: {
          type: "string",
          description: "Nome exato, ex.: get_account_info",
        },
        argumentos: {
          type: "object",
          description: "Argumentos da ferramenta (veja metatrader_parametros).",
        },
      },
      required: ["ferramenta"],
    },
    eager_input_streaming: true,
  },
  {
    name: SCHEMA,
    description:
      "Mostra a descrição e os parâmetros (JSON Schema) de uma ferramenta do MetaTrader.",
    input_schema: {
      type: "object",
      properties: { ferramenta: { type: "string" } },
      required: ["ferramenta"],
    },
    eager_input_streaming: true,
  },
];

function catalogLines() {
  return MT_MODULES.map((m) => {
    const tools = MT_TOOLS.filter((t) => t.module === m.key);
    const lines = tools.map((t) => {
      const params = Object.keys(t.inputSchema.properties ?? {});
      const req = new Set(t.inputSchema.required ?? []);
      const sig = params.map((p) => (req.has(p) ? p : `${p}?`)).join(", ");
      const tier =
        t.tier === "read" ? "" : ` [${TIER_LABEL[t.tier].toLowerCase()}]`;
      return `- ${t.name}(${sig})${tier}: ${t.description}`;
    });
    return `### ${m.label}\n${lines.join("\n")}`;
  }).join("\n");
}

export const METATRADER_INSTRUCTIONS = `## MetaTrader 5 (Trading Terminal Assistant)
A conta MT5 da pessoa está ligada pelo metatrader-mcp-server (mesmas ferramentas do repositório). Use ${RUN} com o nome e os argumentos; na dúvida, ${SCHEMA} primeiro. Isto é software financeiro: cada ordem envolve dinheiro real — seja preciso nos parâmetros.
Fluxos:
- Painel da conta: chame get_account_info, get_all_positions e get_all_pending_orders e apresente juntos.
- Ordem a mercado com SL/TP: place_market_order não aceita SL/TP. Execute-a, tire o id da posição do resultado (data.order ou data.deal) e chame modify_position com stop_loss/take_profit.
- Ordem pendente: place_pending_order com tudo (type BUY ou SELL; o servidor escolhe LIMIT/STOP pelo preço atual).
- Fechar algumas: liste com get_all_positions, mostre ids, símbolos e lucro, deixe a pessoa escolher e chame close_position para cada uma.
Formatação: tabelas limpas (conta, posições com total de lucro, preço com bid/ask/spread, resultado da ordem com tipo, símbolo, volume, preço e nº da ordem); valores na moeda da conta com + para lucro e − para prejuízo; velas: as 10–20 mais recentes com símbolo e tempo gráfico no título; histórico com o intervalo e os totais. CSV vazio = diga que não há registos.
Conhecimento MT5: ordens de mercado BUY/SELL; pendentes BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, BUY_STOP_LIMIT, SELL_STOP_LIMIT. Tempos gráficos: ${MT_TIMEFRAMES.join(", ")}. Símbolos dependem da corretora (EURUSD, EURUSD.m, EURUSDm): confirme com get_symbol_price ou get_symbols antes de negociar, nunca adivinhe. Volume em lotes (mínimo típico 0.01); use exatamente o volume pedido e, se faltar, pergunte. Datas do histórico AAAA-MM-DD (padrão: últimos 30 dias). Horas como vêm do MT5 (hora do servidor).
Erros ({"error": true, "message": …}): mostre a mensagem e sugira a correção — símbolo inválido → get_symbols; margem insuficiente → get_account_info; mercado fechado; volume inválido (mínimo 0.01); ligação → verificar o terminal MT5; stops inválidos → SL/TP perto demais do preço.
Comportamento: quando a pessoa pede para negociar, execute logo e mostre o resultado. Se a resposta disser que o assistente só pode consultar, explique que ordens pelo assistente se ligam em Conectores → MetaTrader. Respostas curtas.
Ferramentas:
${catalogLines()}`;

export const isMetatraderTool = (name: string) =>
  name === RUN || name === SCHEMA;

async function convex() {
  const url = convexUrl();
  const signed = await signPanelToken("ai");
  if (!(url && signed)) {
    throw new Error("Banco central não configurado.");
  }
  const c = new ConvexHttpClient(url);
  c.setAuth(signed.token);
  return c;
}

/** Whether a MetaTrader server is configured (for the status route). */
export async function metatraderSummary() {
  try {
    const status = await Promise.race([
      (await convex()).query(api.metatrader.status, {}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return status
      ? {
          connected: status.configured,
          name: status.url ? new URL(status.url).host : undefined,
        }
      : null;
  } catch {
    return null;
  }
}

interface ToolResult {
  content: string;
  isError: boolean;
}

function schemaOf(name: string): ToolResult {
  const tool = findMtTool(name);
  if (!tool) {
    return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  }
  return {
    content: JSON.stringify({
      nome: tool.name,
      tipo: TIER_LABEL[tool.tier],
      descricao: tool.description,
      parametros: tool.inputSchema,
    }),
    isError: false,
  };
}

export async function runMetatraderTool(
  name: string,
  input: unknown
): Promise<ToolResult> {
  const args = (input ?? {}) as { ferramenta?: unknown; argumentos?: unknown };
  const tool = typeof args.ferramenta === "string" ? args.ferramenta : "";
  if (name === SCHEMA) {
    return schemaOf(tool);
  }
  try {
    const out = await (await convex()).action(api.metatrader.call, {
      name: tool,
      args:
        args.argumentos && typeof args.argumentos === "object"
          ? args.argumentos
          : {},
      source: "assistant",
    });
    const value =
      typeof out.value === "string" ? out.value : JSON.stringify(out.value);
    const text = out.ok
      ? value
      : [out.message, value && value !== "null" ? value : ""]
          .filter(Boolean)
          .join("\n");
    return {
      content: (text || "(sem conteúdo)").slice(0, MAX_RESULT),
      isError: !out.ok,
    };
  } catch (err) {
    return {
      content: `MetaTrader indisponível: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}
