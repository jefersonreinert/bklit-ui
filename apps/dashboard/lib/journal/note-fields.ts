/**
 * Structured note fields the trader filled by hand in Notion (Bias, Trade
 * Type, Entry Timeframe, Entry Macro, News Impact, Psychology). Single
 * choice; the option lists are editable in the panel.
 */

export const NOTE_FIELDS = [
  "bias",
  "tradeType",
  "timeframe",
  "macro",
  "newsImpact",
  "psychology",
] as const;

export type NoteField = (typeof NOTE_FIELDS)[number];
export type NoteOptions = Record<NoteField, string[]>;

export const NOTE_FIELD_LABEL: Record<NoteField, string> = {
  bias: "Bias",
  tradeType: "Trade type",
  timeframe: "Entry timeframe",
  macro: "Entry macro",
  newsImpact: "News impact",
  psychology: "Psychology",
};

/** The macro windows (New York time) of analytics.ts macroOf. */
export const MACROS = [
  "02:33–03:00",
  "04:03–04:30",
  "08:50–09:10",
  "09:50–10:10",
  "10:50–11:10",
  "11:50–12:10",
  "13:10–13:40",
  "15:15–15:45",
  "Fora de macro",
];

export const DEFAULT_NOTE_OPTIONS: NoteOptions = {
  bias: ["Bullish", "Bearish", "Neutral"],
  tradeType: ["Intraday", "Scalp", "Position", "Swing"],
  timeframe: [
    "15-Second",
    "1-Minute",
    "5-Minute",
    "15-Minute",
    "1-Hour",
    "Daily",
  ],
  macro: MACROS,
  newsImpact: ["High", "Medium", "Low"],
  psychology: [
    "Calm",
    "Confident",
    "Disciplined",
    "Focused",
    "Anxious",
    "Fearful",
    "Greedy",
    "FOMO",
    "Overconfident",
    "Revenge",
  ],
};

const MAX_OPTIONS = 30;
const MAX_OPTION = 40;

/** Stored options merged over the defaults (empty lists fall back). */
export function noteOptionsOf(
  stored: Partial<Record<string, string[]>> | undefined
): NoteOptions {
  const out = { ...DEFAULT_NOTE_OPTIONS };
  for (const f of NOTE_FIELDS) {
    const list = stored?.[f];
    if (list?.length) {
      out[f] = list;
    }
  }
  return out;
}

/** Trimmed, unique, bounded option list. */
export function cleanOptions(list: string[]) {
  return [...new Set(list.map((o) => o.trim().slice(0, MAX_OPTION)))]
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
}
