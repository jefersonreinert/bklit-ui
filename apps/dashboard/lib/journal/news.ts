/**
 * News Impact suggestion: high/medium economic-calendar events of the
 * asset's currencies within 15 minutes of the entry.
 */

const WINDOW = 15 * 60_000;
const HALF_HOUR = 30 * 60_000;
const FX_PAIR = /^([A-Z]{3})([A-Z]{3})/;
const NON_ALNUM = /[^A-Z0-9]/g;

const INDEX_CURRENCY: [RegExp, string][] = [
  [/GER|DAX|DE30|DE40|EU50|STOXX|FRA|CAC/, "EUR"],
  [/UK100|FTSE/, "GBP"],
  [/JP225|JPN|NIK/, "JPY"],
  [/AUS200|ASX/, "AUD"],
  [/HK50|HSI|CHINA/, "CNY"],
  [/NAS|NDX|US30|DJ|US500|SPX|US2000|USOIL|OIL|BTC|ETH/, "USD"],
];

/** Currencies whose news move the symbol (EURUSD → EUR, USD; NAS100 → USD). */
export function symbolCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(NON_ALNUM, "");
  const index = INDEX_CURRENCY.find(([re]) => re.test(s));
  if (index) {
    return [index[1]];
  }
  const fx = FX_PAIR.exec(s);
  if (fx) {
    // Metals priced in dollars (XAUUSD) only react to the quote currency
    const base = fx[1] === "XAU" || fx[1] === "XAG" ? [] : [fx[1] ?? ""];
    return [...base, fx[2] ?? ""].filter(Boolean);
  }
  return [];
}

/**
 * Broker server clock minus UTC, from a stats snapshot (server time vs
 * when the panel received it), rounded to 30 minutes.
 */
export const serverOffset = (serverTime: number, receivedAt: number) =>
  Math.round((serverTime - receivedAt) / HALF_HOUR) * HALF_HOUR;

export interface CalendarEvent {
  time: string;
  allDay?: boolean;
  currency: string;
  impact: string;
  title: string;
}

/**
 * "High" or "Medium" from the strongest matching event, or null. `entry`
 * is the deal time on the broker clock; `offset` converts it to UTC.
 */
export function suggestImpact(
  symbol: string,
  entry: number,
  events: CalendarEvent[],
  offset = 0
): { impact: "High" | "Medium"; event: CalendarEvent } | null {
  const currencies = symbolCurrencies(symbol);
  const at = entry - offset;
  const near = events.filter(
    (e) =>
      !e.allDay &&
      (e.impact === "high" || e.impact === "medium") &&
      currencies.includes(e.currency) &&
      Math.abs(new Date(e.time).getTime() - at) <= WINDOW
  );
  const high = near.find((e) => e.impact === "high");
  const event = high ?? near[0];
  if (!event) {
    return null;
  }
  return { impact: high ? "High" : "Medium", event };
}
