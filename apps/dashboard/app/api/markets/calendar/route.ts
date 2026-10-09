import { type NextRequest, NextResponse } from "next/server";
import {
  type EconEvent,
  forexFactoryCalendar,
  investingCalendar,
} from "@/lib/server/markets";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

async function load(from: string, to: string) {
  try {
    const events = await investingCalendar(from, to);
    if (events.length) {
      return { events, source: "Investing.com" };
    }
  } catch {
    // Investing.com may block servers: fall back to ForexFactory
  }
  const weeks = await Promise.allSettled([
    forexFactoryCalendar("thisweek"),
    forexFactoryCalendar("nextweek"),
  ]);
  const start = new Date(`${from}T00:00:00Z`).getTime() - 86_400_000;
  const end = new Date(`${to}T23:59:59Z`).getTime() + 86_400_000;
  const events = weeks
    .flatMap((w) => (w.status === "fulfilled" ? w.value : []))
    .filter((e: EconEvent) => {
      const t = new Date(e.time).getTime();
      return t >= start && t <= end;
    });
  return { events, source: "ForexFactory" };
}

/** Economic calendar for a date range (YYYY-MM-DD). */
export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? from;
  if (!(DAY.test(from) && DAY.test(to))) {
    return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  }
  const key = `${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }
  const result = await load(from, to);
  const data = {
    ...result,
    events: result.events.sort((a, b) => a.time.localeCompare(b.time)),
    updatedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=120" },
  });
}
