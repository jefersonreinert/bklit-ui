"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { browserHref } from "@/lib/browser/news";
import { Icon } from "@/lib/icons";
import {
  addDays,
  dayKey,
  type EconEvent,
  flag,
  IMPACT_LABEL,
  type Impact,
  surprise,
  useCalendar,
  weekStart,
} from "@/lib/markets/calendar";
import { cn } from "@/lib/utils";
import { UnlockCard } from "../browser/unlock-card";

type Range = "today" | "tomorrow" | "week" | "next";

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "tomorrow", label: "Amanhã" },
  { id: "week", label: "Esta semana" },
  { id: "next", label: "Próxima semana" },
];

const MAJORS = ["USD", "EUR", "GBP", "JPY", "CNY", "BRL", "CAD", "AUD", "CHF"];
const PREFS_KEY = "cb:calendar:prefs";

function rangeDates(r: Range, now: Date): [Date, Date] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (r === "today") {
    return [today, today];
  }
  if (r === "tomorrow") {
    const t = addDays(today, 1);
    return [t, t];
  }
  const start = r === "week" ? weekStart(today) : addDays(weekStart(today), 7);
  return [start, addDays(start, 6)];
}

const IMPACT_COLOR: Record<Impact, string> = {
  high: "#d03b2f",
  medium: "#e08a1e",
  low: "#9ca3af",
  holiday: "#4a6fa5",
};

function ImpactBars({ impact }: { impact: Impact }) {
  const n = { high: 3, medium: 2, low: 1, holiday: 0 }[impact];
  if (impact === "holiday") {
    return <span className="text-[#4a6fa5] text-xs">Feriado</span>;
  }
  return (
    <span
      className="flex items-end gap-0.5"
      title={`Impacto ${IMPACT_LABEL[impact]}`}
    >
      {[1, 2, 3].map((i) => (
        <span
          className="w-1 rounded-full"
          key={i}
          style={{
            height: 4 + i * 3,
            background: i <= n ? IMPACT_COLOR[impact] : "var(--muted)",
          }}
        />
      ))}
    </span>
  );
}

const timeText = (e: EconEvent) =>
  e.allDay
    ? "Dia todo"
    : new Date(e.time).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <span className="font-semibold tabular-nums">
      {h > 0 ? `${h}h ` : ""}
      {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

function Value({
  label,
  v,
  tone,
}: {
  label: string;
  v?: string;
  tone?: number;
}) {
  return (
    <span className="flex flex-col items-end">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span
        className={cn(
          "font-medium text-sm tabular-nums",
          tone === 1 && "text-[#3d7a5f]",
          tone === -1 && "text-[#d03b2f]"
        )}
      >
        {v ?? "—"}
        {tone === 1 ? " ▲" : null}
        {tone === -1 ? " ▼" : null}
      </span>
    </span>
  );
}

function EventRow({
  e,
  past,
  onOpen,
}: {
  e: EconEvent;
  past: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        className={cn(
          "grid w-full grid-cols-[3.25rem_1fr] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[3.5rem_5.5rem_1fr_auto]",
          past && "opacity-60"
        )}
        onClick={onOpen}
        type="button"
      >
        <span className="font-medium text-sm tabular-nums">{timeText(e)}</span>
        <span className="flex items-center gap-2 text-sm sm:order-none">
          <span className="text-lg leading-none">{flag(e.currency)}</span>
          <span className="font-medium">{e.currency}</span>
          <ImpactBars impact={e.impact} />
        </span>
        <span className="col-span-2 font-medium text-sm leading-snug sm:col-span-1">
          {e.title}
        </span>
        <span className="col-span-2 flex justify-end gap-4 sm:col-span-1">
          <Value label="Atual" tone={surprise(e)} v={e.actual} />
          <Value label="Previsão" v={e.forecast} />
          <Value label="Anterior" v={e.previous} />
        </span>
      </button>
    </li>
  );
}

function EventSheet({
  e,
  onClose,
}: {
  e: EconEvent | null;
  onClose: () => void;
}) {
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(e)}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        {e ? (
          <>
            <SheetHeader className="border-b p-5">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-2xl">{flag(e.currency)}</span>
                {e.title}
              </SheetTitle>
              <p className="text-muted-foreground text-sm">
                {e.country} · {e.currency} · impacto{" "}
                {IMPACT_LABEL[e.impact].toLowerCase()}
              </p>
            </SheetHeader>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-sm">
                {new Date(e.time).toLocaleString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: e.allDay ? undefined : "2-digit",
                  minute: e.allDay ? undefined : "2-digit",
                })}
              </p>
              {new Date(e.time).getTime() > Date.now() ? (
                <p className="rounded-2xl bg-muted p-3 text-sm">
                  Sai em <Countdown to={e.time} />
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2 rounded-2xl border p-3">
                <Value label="Atual" tone={surprise(e)} v={e.actual} />
                <Value label="Previsão" v={e.forecast} />
                <Value label="Anterior" v={e.previous} />
              </div>
              <p className="text-muted-foreground text-xs">
                ▲/▼ indica se o resultado veio acima ou abaixo da previsão (se
                isso é bom ou ruim depende do indicador).
              </p>
              <Link
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-background"
                href={browserHref(e.url)}
              >
                Ver no{" "}
                {e.source === "investing" ? "Investing.com" : "ForexFactory"}
                <Icon className="size-4" name="IconArrowUpRight" />
              </Link>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function usePrefs() {
  const [impacts, setImpacts] = useState<Impact[]>(["high", "medium"]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (Array.isArray(p.impacts)) {
        setImpacts(p.impacts);
      }
      if (Array.isArray(p.currencies)) {
        setCurrencies(p.currencies);
      }
    } catch {
      // defaults
    }
  }, []);
  const save = (next: { impacts?: Impact[]; currencies?: string[] }) => {
    const value = {
      impacts: next.impacts ?? impacts,
      currencies: next.currencies ?? currencies,
    };
    setImpacts(value.impacts);
    setCurrencies(value.currencies);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    } catch {
      // private mode
    }
  };
  return { impacts, currencies, save };
}

function Filters({
  available,
  prefs,
  query,
  setQuery,
}: {
  available: string[];
  prefs: ReturnType<typeof usePrefs>;
  query: string;
  setQuery: (q: string) => void;
}) {
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["high", "medium", "low", "holiday"] as Impact[]).map((i) => (
          <button
            aria-pressed={prefs.impacts.includes(i)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              prefs.impacts.includes(i)
                ? "border-foreground bg-foreground text-background"
                : "bg-card"
            )}
            key={i}
            onClick={() => prefs.save({ impacts: toggle(prefs.impacts, i) })}
            type="button"
          >
            <span
              className="size-2 rounded-full"
              style={{ background: IMPACT_COLOR[i] }}
            />
            {IMPACT_LABEL[i]}
          </button>
        ))}
        <Input
          className="ml-auto h-9 w-full rounded-full sm:w-56"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar (ex.: CPI, juros, emprego)"
          value={query}
        />
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        <button
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm",
            prefs.currencies.length === 0
              ? "bg-foreground text-background"
              : "bg-muted"
          )}
          onClick={() => prefs.save({ currencies: [] })}
          type="button"
        >
          Todas
        </button>
        {available.map((c) => (
          <button
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm",
              prefs.currencies.includes(c)
                ? "bg-foreground text-background"
                : "bg-muted"
            )}
            key={c}
            onClick={() =>
              prefs.save({ currencies: toggle(prefs.currencies, c) })
            }
            type="button"
          >
            {flag(c)} {c}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const [range, setRange] = useState<Range>("week");
  const [from, to] = useMemo(() => rangeDates(range, new Date()), [range]);
  const { events, source, error, loading, reload } = useCalendar(from, to);
  const prefs = usePrefs();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<EconEvent | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const inRange = useMemo(() => {
    const a = dayKey(from);
    const b = dayKey(to);
    return (events ?? []).filter((e) => {
      const d = dayKey(new Date(e.time));
      return d >= a && d <= b;
    });
  }, [events, from, to]);
  const available = useMemo(() => {
    const present = new Set(inRange.map((e) => e.currency).filter(Boolean));
    return [
      ...MAJORS.filter((c) => present.has(c)),
      ...[...present].filter((c) => !MAJORS.includes(c)).sort(),
    ];
  }, [inRange]);
  const q = query.trim().toLowerCase();
  const shown = inRange.filter(
    (e) =>
      prefs.impacts.includes(e.impact) &&
      (prefs.currencies.length === 0 ||
        prefs.currencies.includes(e.currency)) &&
      (!q ||
        e.title.toLowerCase().includes(q) ||
        e.country.toLowerCase().includes(q))
  );
  const days = useMemo(() => {
    const map = new Map<string, EconEvent[]>();
    for (const e of shown) {
      const k = dayKey(new Date(e.time));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [shown]);
  const next = inRange.find(
    (e) => e.impact === "high" && !e.allDay && new Date(e.time).getTime() > now
  );

  if (error === "locked") {
    return <UnlockCard onDone={reload} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {RANGES.map((r) => (
            <button
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm",
                range === r.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              )}
              key={r.id}
              onClick={() => setRange(r.id)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">
          {source ? `Fonte: ${source} · ` : ""}
          horário de {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
        <Button
          aria-label="Atualizar"
          className="ml-auto"
          onClick={reload}
          size="icon"
          variant="ghost"
        >
          {loading ? (
            <Spinner />
          ) : (
            <Icon className="size-4" name="IconArrowsRepeat" />
          )}
        </Button>
      </div>

      {next ? (
        <button
          className="flex items-center gap-3 rounded-3xl border border-[#d03b2f]/30 bg-[#d03b2f]/5 p-4 text-left"
          onClick={() => setOpen(next)}
          type="button"
        >
          <span className="text-3xl">{flag(next.currency)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[#d03b2f] text-xs uppercase tracking-wide">
              Próximo evento de alto impacto
            </span>
            <span className="block truncate font-semibold">{next.title}</span>
            <span className="block text-muted-foreground text-sm">
              {timeText(next)} · previsão {next.forecast ?? "—"} · anterior{" "}
              {next.previous ?? "—"}
            </span>
          </span>
          <span className="text-right text-sm">
            <span className="block text-muted-foreground text-xs">em</span>
            <Countdown to={next.time} />
          </span>
        </button>
      ) : null}

      <Filters
        available={available}
        prefs={prefs}
        query={query}
        setQuery={setQuery}
      />

      {events === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}
      {events && days.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-sm">
          {error ?? "Nenhum evento com esses filtros."}
        </p>
      ) : null}
      {days.map(([day, list]) => (
        <section className="flex flex-col gap-2" key={day}>
          <h3 className="sticky top-0 z-10 bg-background/80 py-1 font-semibold text-sm backdrop-blur">
            {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            <span className="ml-2 font-normal text-muted-foreground">
              {list.length} eventos
            </span>
          </h3>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {list.map((e) => (
              <EventRow
                e={e}
                key={e.id}
                onOpen={() => setOpen(e)}
                past={!e.allDay && new Date(e.time).getTime() < now}
              />
            ))}
          </ul>
        </section>
      ))}
      <EventSheet e={open} onClose={() => setOpen(null)} />
    </div>
  );
}
