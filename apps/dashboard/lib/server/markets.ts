/**
 * Economic calendar and market headlines, ported from the user's
 * economic-calendar (Investing.com scraper) and MarketNewsAPI (RSS +
 * ForexFactory) projects to run inside the panel's server.
 */

export type Impact = "high" | "medium" | "low" | "holiday";

export interface EconEvent {
  id: string;
  /** UTC ISO time. */
  time: string;
  /** All-day (holidays, "Tentative"). */
  allDay: boolean;
  country: string;
  currency: string;
  impact: Impact;
  title: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  url: string;
  source: "investing" | "forexfactory";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ------------------------------ Investing.com ---------------------------- */

const ROW = /<tr[^>]*id="eventRowId_(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
const ROW_DT = /data-event-datetime="([^"]+)"/;
const FLAG_TITLE = /<span[^>]*class="[^"]*ceFlags[^"]*"[^>]*title="([^"]*)"/;
const FLAG_CUR = /<td[^>]*class="[^"]*flagCur[^"]*"[^>]*>([\s\S]*?)<\/td>/;
const BULL = /grayFullBullishIcon/g;
const EVENT_LINK =
  /<td[^>]*class="[^"]*event[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const CELL = (cls: string) =>
  new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`);
const ACT = CELL("act");
const FORE = CELL("fore");
const PREV = CELL("prev");
const HOLIDAY = /colspan="6"|Holiday/i;
const TAGS = /<[^>]+>/g;
const NBSP = /&nbsp;| /g;
const SPACES = /\s+/g;
const NOT_UPPER = /[^A-Z]/g;
const SLASHES = /\//g;
const ROW_OPEN = /<tr[^>]*>/;

const text = (html: string | undefined) =>
  (html ?? "")
    .replace(TAGS, " ")
    .replace(NBSP, " ")
    .replace(SPACES, " ")
    .replace("&amp;", "&")
    .trim();

const EMPTY = new Set(["", "None", "-", "--"]);
const value = (html: string | undefined) => {
  const v = text(html);
  return EMPTY.has(v) ? undefined : v;
};

const GMT_OFFSET = /GMT([+-])(\d{2}):?(\d{2})?/;

/** Offset in minutes of a zone at a moment ("America/New_York" → -240/-300). */
function zoneOffset(zone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = GMT_OFFSET.exec(name);
  if (!m) {
    return 0;
  }
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "2026-02-17 08:30:00" New York time → UTC ISO. */
function nyToUtc(local: string) {
  const asUtc = new Date(`${local.replace(" ", "T")}Z`);
  const offset = zoneOffset("America/New_York", asUtc);
  return new Date(asUtc.getTime() - offset * 60_000).toISOString();
}

function parseInvestingRow(
  id: string,
  attrs: string,
  body: string
): EconEvent | null {
  if (HOLIDAY.test(body) && !EVENT_LINK.test(body)) {
    return null;
  }
  const link = EVENT_LINK.exec(body);
  const title = text(link?.[2]);
  const dt = ROW_DT.exec(attrs)?.[1];
  if (!(title && dt)) {
    return null;
  }
  const bulls = (body.match(BULL) ?? []).length;
  let impact: Impact = "low";
  if (bulls >= 3) {
    impact = "high";
  } else if (bulls >= 2) {
    impact = "medium";
  }
  const href = link?.[1] ?? "";
  return {
    id: `inv-${id}`,
    time: nyToUtc(dt.replace(SLASHES, "-")),
    allDay: false,
    country: FLAG_TITLE.exec(body)?.[1] ?? "",
    currency: text(FLAG_CUR.exec(body)?.[1]).replace(NOT_UPPER, "").slice(0, 3),
    impact,
    title,
    actual: value(ACT.exec(body)?.[1]),
    forecast: value(FORE.exec(body)?.[1]),
    previous: value(PREV.exec(body)?.[1]),
    url: href.startsWith("http") ? href : `https://www.investing.com${href}`,
    source: "investing",
  };
}

async function investingPage(from: string, to: string, page: number) {
  const res = await fetch(
    "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.investing.com/economic-calendar/",
        "X-Requested-With": "XMLHttpRequest",
      },
      // timeZone=8 is New York (as in the original scraper)
      body: `dateFrom=${from}&dateTo=${to}&timeZone=8&timeFilter=timeRemain&currentTab=custom&limit_from=${page}`,
    }
  );
  if (!res.ok) {
    throw new Error(`Investing.com HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: string;
    bind_scroll_handler?: boolean;
  };
  const events: EconEvent[] = [];
  for (const m of (json.data ?? "").matchAll(ROW)) {
    const attrs = ROW_OPEN.exec(m[0])?.[0] ?? "";
    const ev = parseInvestingRow(m[1] ?? "", attrs, m[2] ?? "");
    if (ev) {
      events.push(ev);
    }
  }
  return { events, more: Boolean(json.bind_scroll_handler) };
}

/** The whole range: the endpoint returns up to ~200 rows per page. */
export async function investingCalendar(from: string, to: string) {
  const byId = new Map<string, EconEvent>();
  for (let page = 0; page < 8; page++) {
    const { events, more } = await investingPage(from, to, page);
    const before = byId.size;
    for (const e of events) {
      byId.set(e.id, e);
    }
    if (!more || byId.size === before) {
      break;
    }
  }
  return [...byId.values()];
}

/* ------------------------------ ForexFactory ----------------------------- */

interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

const FF_CURRENCY_COUNTRY: Record<string, string> = {
  USD: "United States",
  EUR: "Euro Zone",
  GBP: "United Kingdom",
  JPY: "Japan",
  CNY: "China",
  CAD: "Canada",
  AUD: "Australia",
  NZD: "New Zealand",
  CHF: "Switzerland",
};

export async function forexFactoryCalendar(week: "thisweek" | "nextweek") {
  const res = await fetch(
    `https://nfs.faireconomy.media/ff_calendar_${week}.json`,
    {
      headers: { "User-Agent": UA },
    }
  );
  if (!res.ok) {
    throw new Error(`ForexFactory HTTP ${res.status}`);
  }
  const list = (await res.json()) as FfEvent[];
  return list.map((e, i): EconEvent => {
    const impact = e.impact.toLowerCase();
    return {
      id: `ff-${week}-${i}-${e.date}`,
      time: new Date(e.date).toISOString(),
      allDay: impact === "holiday",
      country: FF_CURRENCY_COUNTRY[e.country] ?? e.country,
      currency: e.country,
      impact: (["high", "medium", "low", "holiday"].includes(impact)
        ? impact
        : "low") as Impact,
      title: e.title,
      actual: e.actual || undefined,
      forecast: e.forecast || undefined,
      previous: e.previous || undefined,
      url: "https://www.forexfactory.com/calendar",
      source: "forexfactory",
    };
  });
}
