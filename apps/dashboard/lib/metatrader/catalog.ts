import type { JsonSchema } from "../telegram/core";

/**
 * Every tool of github.com/jefersonreinert/metatrader-mcp-server (server.py),
 * with the same names, parameters and descriptions, plus the two REST-only
 * operations of its HTTP API (candles by date, symbol info). The tools run
 * on the person's MT5 machine; the panel talks to that server over MCP.
 */

export type MtTier = "read" | "trade" | "bulk";

export interface MtTool {
  name: string;
  module: MtModule;
  tier: MtTier;
  description: string;
  inputSchema: JsonSchema;
  /** Only in the HTTP API (metatrader-http-server), not in the MCP server. */
  rest?: { path: (args: Record<string, unknown>) => string };
}

export type MtModule =
  | "account"
  | "market"
  | "positions"
  | "pending"
  | "trade"
  | "modify"
  | "close"
  | "cancel"
  | "history";

export const MT_MODULES: { key: MtModule; label: string }[] = [
  { key: "account", label: "Conta" },
  { key: "market", label: "Mercado" },
  { key: "positions", label: "Posições abertas" },
  { key: "pending", label: "Ordens pendentes" },
  { key: "trade", label: "Execução" },
  { key: "modify", label: "Modificação" },
  { key: "close", label: "Fechar posições" },
  { key: "cancel", label: "Cancelar ordens" },
  { key: "history", label: "Histórico" },
];

export const TIER_LABEL: Record<MtTier, string> = {
  read: "Leitura",
  trade: "Negociação",
  bulk: "Em massa",
};

/** MT5 timeframes accepted by the candle tools. */
export const MT_TIMEFRAMES = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M10",
  "M12",
  "M15",
  "M20",
  "M30",
  "H1",
  "H2",
  "H3",
  "H4",
  "H6",
  "H8",
  "H12",
  "D1",
  "W1",
  "MN1",
] as const;

const str = (description: string): JsonSchema => ({
  type: "string",
  description,
});
const num = (description: string): JsonSchema => ({
  type: "number",
  description,
});

const SYMBOL = str("Símbolo, ex.: EURUSD (o nome exato da corretora).");
const ID = str("ID (ticket) da posição ou ordem.");
const SIDE: JsonSchema = {
  type: "string",
  enum: ["BUY", "SELL"],
  description: "BUY ou SELL.",
};
const TIMEFRAME: JsonSchema = {
  type: "string",
  enum: [...MT_TIMEFRAMES],
  description: "Tempo gráfico do MT5 (M1 … MN1).",
};
const DATE = (what: string) =>
  str(`${what} (AAAA-MM-DD). Opcional; padrão: últimos 30 dias.`);

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-01-02" → "2026-01-02T00:00:00"; "2026-01-02 10:30" → ISO. */
export function isoDay(value: unknown, time: string) {
  const v = String(value ?? "").trim();
  if (DAY_ONLY.test(v)) {
    return `${v}T${time}`;
  }
  return v.replace(" ", "T");
}

const obj = (
  properties: Record<string, JsonSchema> = {},
  required: string[] = []
): JsonSchema => ({ type: "object", properties, required });

export const MT_TOOLS: MtTool[] = [
  {
    name: "get_account_info",
    module: "account",
    tier: "read",
    description:
      "Get account information (balance, equity, profit, margin level, free margin, account type, leverage, currency).",
    inputSchema: obj(),
  },
  {
    name: "get_symbol_price",
    module: "market",
    tier: "read",
    description: "Get the latest price info for a symbol as a dictionary.",
    inputSchema: obj({ symbol_name: SYMBOL }, ["symbol_name"]),
  },
  {
    name: "get_candles_latest",
    module: "market",
    tier: "read",
    description: "Get the latest N candles for a symbol and timeframe as CSV.",
    inputSchema: obj(
      {
        symbol_name: SYMBOL,
        timeframe: TIMEFRAME,
        count: { type: "integer", description: "Quantas velas (padrão 100)." },
      },
      ["symbol_name", "timeframe"]
    ),
  },
  {
    name: "get_candles_by_date",
    module: "market",
    tier: "read",
    description:
      "Get candle data for a symbol in a given timeframe and date range as CSV. Date input in format: ISO 8601 or 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'.",
    inputSchema: obj(
      {
        symbol_name: SYMBOL,
        timeframe: TIMEFRAME,
        from_date: str("Início (AAAA-MM-DD ou AAAA-MM-DD HH:MM)."),
        to_date: str("Fim (AAAA-MM-DD ou AAAA-MM-DD HH:MM)."),
      },
      ["symbol_name", "timeframe", "from_date", "to_date"]
    ),
    rest: {
      path: (a) =>
        `/api/v1/market/candles/date?${new URLSearchParams({
          symbol_name: String(a.symbol_name ?? ""),
          timeframe: String(a.timeframe ?? ""),
          date_from: isoDay(a.from_date, "00:00:00"),
          date_to: isoDay(a.to_date, "23:59:59"),
        })}`,
    },
  },
  {
    name: "get_symbol_info",
    module: "market",
    tier: "read",
    description:
      "Get detailed information for a symbol (contract size, digits, volume step, trade mode…).",
    inputSchema: obj({ symbol_name: SYMBOL }, ["symbol_name"]),
    rest: {
      path: (a) =>
        `/api/v1/market/symbol/info/${encodeURIComponent(String(a.symbol_name ?? ""))}`,
    },
  },
  {
    name: "get_all_symbols",
    module: "market",
    tier: "read",
    description: "Get a list of all available market symbols.",
    inputSchema: obj(),
  },
  {
    name: "get_symbols",
    module: "market",
    tier: "read",
    description:
      "Get a list of available market symbols. Filter symbols by group pattern (e.g., '*USD*').",
    inputSchema: obj({ group: str("Padrão, ex.: *USD*") }),
  },
  {
    name: "get_all_positions",
    module: "positions",
    tier: "read",
    description: "Get all open positions.",
    inputSchema: obj(),
  },
  {
    name: "get_positions_by_symbol",
    module: "positions",
    tier: "read",
    description: "Get open positions for a specific symbol.",
    inputSchema: obj({ symbol: SYMBOL }, ["symbol"]),
  },
  {
    name: "get_positions_by_id",
    module: "positions",
    tier: "read",
    description: "Get open positions by ID.",
    inputSchema: obj({ id: ID }, ["id"]),
  },
  {
    name: "get_all_pending_orders",
    module: "pending",
    tier: "read",
    description: "Get all pending orders.",
    inputSchema: obj(),
  },
  {
    name: "get_pending_orders_by_symbol",
    module: "pending",
    tier: "read",
    description: "Get pending orders for a specific symbol.",
    inputSchema: obj({ symbol: SYMBOL }, ["symbol"]),
  },
  {
    name: "get_pending_orders_by_id",
    module: "pending",
    tier: "read",
    description: "Get pending orders by id.",
    inputSchema: obj({ id: ID }, ["id"]),
  },
  {
    name: "place_market_order",
    module: "trade",
    tier: "trade",
    description:
      "Place a market order. Parameters: symbol (e.g. 'EURUSD'), volume (lot size, e.g. 1.5), type ('BUY' or 'SELL').",
    inputSchema: obj(
      { symbol: SYMBOL, volume: num("Lotes, ex.: 0.01"), type: SIDE },
      ["symbol", "volume", "type"]
    ),
  },
  {
    name: "place_pending_order",
    module: "trade",
    tier: "trade",
    description:
      "Place a pending order. Parameters: symbol, volume, type ('BUY', 'SELL'), price, stop_loss (optional), take_profit (optional). The server picks LIMIT or STOP from the current price.",
    inputSchema: obj(
      {
        symbol: SYMBOL,
        volume: num("Lotes, ex.: 0.01"),
        type: SIDE,
        price: num("Preço da ordem pendente."),
        stop_loss: num("Stop loss (opcional)."),
        take_profit: num("Take profit (opcional)."),
      },
      ["symbol", "volume", "type", "price"]
    ),
  },
  {
    name: "modify_position",
    module: "modify",
    tier: "trade",
    description: "Modify an open position by ID.",
    inputSchema: obj(
      {
        id: ID,
        stop_loss: num("Novo stop loss."),
        take_profit: num("Novo take profit."),
      },
      ["id"]
    ),
  },
  {
    name: "modify_pending_order",
    module: "modify",
    tier: "trade",
    description: "Modify a pending order by ID.",
    inputSchema: obj(
      {
        id: ID,
        price: num("Novo preço."),
        stop_loss: num("Novo stop loss."),
        take_profit: num("Novo take profit."),
      },
      ["id"]
    ),
  },
  {
    name: "close_position",
    module: "close",
    tier: "trade",
    description: "Close an open position by ID.",
    inputSchema: obj({ id: ID }, ["id"]),
  },
  {
    name: "close_all_positions",
    module: "close",
    tier: "bulk",
    description: "Close all open positions.",
    inputSchema: obj(),
  },
  {
    name: "close_all_positions_by_symbol",
    module: "close",
    tier: "bulk",
    description: "Close all open positions for a specific symbol.",
    inputSchema: obj({ symbol: SYMBOL }, ["symbol"]),
  },
  {
    name: "close_all_profitable_positions",
    module: "close",
    tier: "bulk",
    description: "Close all profitable positions.",
    inputSchema: obj(),
  },
  {
    name: "close_all_losing_positions",
    module: "close",
    tier: "bulk",
    description: "Close all losing positions.",
    inputSchema: obj(),
  },
  {
    name: "cancel_pending_order",
    module: "cancel",
    tier: "trade",
    description: "Cancel a pending order by ID.",
    inputSchema: obj({ id: ID }, ["id"]),
  },
  {
    name: "cancel_all_pending_orders",
    module: "cancel",
    tier: "bulk",
    description: "Cancel all pending orders.",
    inputSchema: obj(),
  },
  {
    name: "cancel_pending_orders_by_symbol",
    module: "cancel",
    tier: "bulk",
    description: "Cancel all pending orders for a specific symbol.",
    inputSchema: obj({ symbol: SYMBOL }, ["symbol"]),
  },
  {
    name: "get_deals",
    module: "history",
    tier: "read",
    description:
      "Get historical deals as CSV. Date input in format: 'YYYY-MM-DD'.",
    inputSchema: obj({
      from_date: DATE("Início"),
      to_date: DATE("Fim"),
      symbol: str("Filtro de símbolo (opcional)."),
    }),
  },
  {
    name: "get_orders",
    module: "history",
    tier: "read",
    description:
      "Get historical orders as CSV. Date input in format: 'YYYY-MM-DD'.",
    inputSchema: obj({
      from_date: DATE("Início"),
      to_date: DATE("Fim"),
      symbol: str("Filtro de símbolo (opcional)."),
    }),
  },
];

const BY_NAME = new Map(MT_TOOLS.map((t) => [t.name, t]));

export const findMtTool = (name: string) => BY_NAME.get(name);

/** Changes the account (orders, positions): needs the trading switch. */
export const isTradeTool = (name: string) => {
  const t = BY_NAME.get(name);
  return t ? t.tier !== "read" : true;
};

const INT = /^-?\d+$/;

/**
 * Arguments as the Python server expects them: ids as numbers when they
 * look like tickets, numbers from strings, empty optionals dropped.
 */
export function normalizeArgs(
  tool: MtTool | undefined,
  args: Record<string, unknown>
): Record<string, unknown> {
  const props = tool?.inputSchema.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(args)) {
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    const type = props[k]?.type;
    if (k === "id" && typeof raw === "string" && INT.test(raw.trim())) {
      out[k] = Number(raw.trim());
    } else if (
      (type === "number" || type === "integer") &&
      typeof raw === "string"
    ) {
      const n = Number(raw.replace(",", "."));
      out[k] = Number.isFinite(n) ? n : raw;
    } else if (k === "type" && typeof raw === "string") {
      out[k] = raw.toUpperCase();
    } else {
      out[k] = raw;
    }
  }
  return out;
}
