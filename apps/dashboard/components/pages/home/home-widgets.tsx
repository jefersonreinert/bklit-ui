"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useWeather } from "@/components/pages/browser/browser-widgets";
import {
  CustomerFunnel,
  DailySalesChart,
  GoalsRing,
  LiveOrdersChart,
  OccupancyGauge,
  RecentOrdersList,
  TopDishesChart,
  TrafficHeatmap,
} from "@/components/pages/overview-sections";
import { PlaceMark } from "@/components/pages/work/place-ui";
import { browserHref, timeAgo, useNews } from "@/lib/browser/news";
import { useNewsFeeds } from "@/lib/browser/store";
import { dailySales } from "@/lib/data";
import {
  maltaNow,
  nextTrip,
  ROUTES,
  timetableFor,
  toMinutes,
  waitLabel,
} from "@/lib/ferry";
import {
  type HomeWidget,
  useHome,
  type WidgetInfo,
  widgetInfo,
} from "@/lib/home";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { useQuotes, useTrading } from "@/lib/markets/trading";
import { navItemFor, navItems } from "@/lib/nav";
import { useNotes } from "@/lib/notes/db";
import { inRange, summarize } from "@/lib/personal-finance/analytics";
import { mainCurrency, money } from "@/lib/personal-finance/format";
import { usePersonalFinance } from "@/lib/personal-finance/store";
import { periodFor, summary, usePosDaily } from "@/lib/pos/analytics";
import { money as posMoney, usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import {
  dateKey,
  formatHours,
  nextShift,
  openPunch,
  PLACES,
  punchMinutes,
  toMinutes as shiftClock,
  shiftMinutes,
  shiftState,
  shiftsOn,
  workStore,
} from "@/lib/work-schedule";

/**
 * The home screen's widgets. Each one reads the same data as its page and
 * draws it on frosted glass over the wallpaper.
 */

/** Current time, refreshed every `ms` (null until mounted). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const longDay = new Intl.DateTimeFormat(appLocale(), {
  weekday: "long",
  day: "numeric",
  month: "short",
});

function Header({ info }: { info: WidgetInfo }) {
  const label = (
    <>
      <Icon className="size-3.5" name={info.icon} />
      <span className="truncate">{info.name}</span>
    </>
  );
  const className =
    "flex min-w-0 items-center gap-1.5 font-semibold text-[11px] text-white/65 uppercase tracking-[0.12em]";
  return info.href ? (
    <Link className={cn(className, "hover:text-white")} href={info.href}>
      {label}
      <Icon className="size-3 opacity-60" name="IconArrowUpRight" />
    </Link>
  ) : (
    <span className={className}>{label}</span>
  );
}

/** Frosted glass card every widget sits in. */
export function Glass({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-40 flex-col gap-3 overflow-hidden rounded-[28px] bg-black/30 p-4 text-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/15 backdrop-blur-2xl backdrop-saturate-150 md:p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/60">{children}</p>;
}

/* --------------------------------- daily --------------------------------- */

function EscalaWidget({ size }: { size: HomeWidget["size"] }) {
  const now = useNow();
  const { shifts, punches } = workStore.use();
  if (!now) {
    return null;
  }
  const today = dateKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const next = nextShift(shifts, now);
  const todays = shiftsOn(shifts, today);
  const open = openPunch(punches);
  const place = PLACES.find((p) => p.id === next?.place);
  const isToday = next?.date === today;
  const running = next && isToday && shiftState(next, minutes) === "now";

  let when = "";
  if (next && isToday) {
    when = running
      ? `Agora · até ${next.end}`
      : `Hoje · ${waitLabel(shiftClock(next.start) - minutes)}`;
  } else if (next) {
    when = longDay.format(new Date(`${next.date}T12:00:00`));
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      {next ? (
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <PlaceMark className="size-7" id={next.place} places={PLACES} />
          </span>
          <div className="min-w-0">
            <p className="text-white/60 text-xs first-letter:uppercase">
              {when}
            </p>
            <p className="font-semibold text-3xl tabular-nums tracking-tight">
              {next.start}
              <span className="text-white/50">–{next.end}</span>
            </p>
            <p className="truncate text-sm text-white/80">
              {place?.name ?? "Sem local"}
              {size === "s" ? "" : ` · ${place?.area ?? ""}`}
            </p>
          </div>
        </div>
      ) : (
        <Muted>Nenhum turno marcado. Importe a escala da empresa.</Muted>
      )}
      {size === "s" ? null : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            {todays.length
              ? `Hoje: ${formatHours(todays.reduce((a, s) => a + shiftMinutes(s), 0))}`
              : "Folga hoje"}
          </span>
          {open ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-1 text-emerald-200">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
              Ponto aberto · {formatHours(punchMinutes(open, now))}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FerryWidget({ size }: { size: HomeWidget["size"] }) {
  const now = useNow();
  if (!now) {
    return null;
  }
  const malta = maltaNow(now);
  const table = timetableFor(malta.month);
  if (!table) {
    return <Muted>Sem horário publicado para este mês.</Muted>;
  }
  return (
    <div
      className={cn(
        "grid flex-1 content-end gap-3",
        size === "s" ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {(size === "s" ? ROUTES.slice(0, 1) : ROUTES).map((r) => {
        const trips = table.trips[r.id];
        const i = nextTrip(trips, malta.minutes);
        const trip = trips[i];
        const after = trips[i + 1];
        return (
          <div className="flex flex-col gap-1" key={r.id}>
            <p className="flex items-center gap-1 text-white/60 text-xs">
              {r.from}
              <Icon className="size-3" name="IconArrowRight" />
              {r.to}
            </p>
            <p className="font-semibold text-3xl tabular-nums tracking-tight">
              {trip?.depart ?? trips[0]?.depart ?? "—"}
            </p>
            <p className="text-white/70 text-xs">
              {trip
                ? waitLabel(toMinutes(trip.depart) - malta.minutes)
                : "amanhã"}
              {after ? ` · depois ${after.depart}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ClimaWidget() {
  const { place, data, error, locate, label, emoji } = useWeather();
  if (!place) {
    return (
      <button
        className="flex flex-1 flex-col items-start justify-end gap-1 text-left"
        onClick={locate}
        type="button"
      >
        <span className="text-4xl">🌤️</span>
        <span className="text-sm text-white/70">
          {error ?? "Toque para usar sua localização"}
        </span>
      </button>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-end gap-1">
      <p className="flex items-end gap-2">
        <span className="font-light text-6xl tabular-nums tracking-tighter">
          {data ? `${data.temp}°` : "—"}
        </span>
        <span className="pb-2 text-3xl">{emoji}</span>
      </p>
      <p className="text-sm text-white/75">
        {error ??
          (data ? `${label} · ${data.max}° / ${data.min}°` : "Carregando…")}
      </p>
      <p className="text-white/50 text-xs">{place.place}</p>
    </div>
  );
}

function NoticiasWidget({ size }: { size: HomeWidget["size"] }) {
  const { items } = useNews(useNewsFeeds());
  if (items === null) {
    return <Muted>Carregando…</Muted>;
  }
  return (
    <ul className="flex flex-col divide-y divide-white/10">
      {items.slice(0, size === "l" ? 6 : 4).map((i) => (
        <li key={i.link}>
          <Link className="block py-2" href={browserHref(i.link)}>
            <span className="line-clamp-2 font-medium text-sm leading-snug">
              {i.title}
            </span>
            <span className="text-white/50 text-xs">
              {i.source} · {timeAgo(i.date)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NotasWidget({ size }: { size: HomeWidget["size"] }) {
  const { notes, ready } = useNotes();
  if (!ready) {
    return <Muted>Carregando…</Muted>;
  }
  const list = [...notes]
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
    )
    .slice(0, size === "s" ? 3 : 5);
  if (!list.length) {
    return <Muted>Nenhuma nota ainda.</Muted>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((n) => (
        <li key={n.id}>
          <Link
            className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            href="/notas"
          >
            <span className="w-5 shrink-0 text-center">
              {n.icon && !n.icon.startsWith("att:") ? n.icon : "📝"}
            </span>
            <span className="truncate">{n.title || "Sem título"}</span>
            {n.pinned ? (
              <span className="ml-auto text-[10px] text-white/50 uppercase">
                fixada
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MercadosWidget({ size }: { size: HomeWidget["size"] }) {
  const { watchlist } = useTrading();
  const items = watchlist.slice(0, size === "l" ? 8 : 5);
  const { quotes, locked } = useQuotes(items.map((w) => w.symbol));
  if (locked) {
    return <Muted>Abra Gráficos para liberar as cotações.</Muted>;
  }
  return (
    <ul
      className={cn(
        "grid gap-x-6",
        size === "l" ? "md:grid-cols-2" : "grid-cols-1"
      )}
    >
      {items.map((w) => {
        const q = quotes[w.symbol];
        const up = (q?.changePct ?? 0) >= 0;
        return (
          <li
            className="flex items-center justify-between gap-3 border-white/10 border-b py-1.5 text-sm last:border-0"
            key={w.symbol}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{w.label}</span>
              {size === "s" ? null : (
                <span className="block truncate text-white/50 text-xs">
                  {w.name}
                </span>
              )}
            </span>
            <span className="text-right tabular-nums">
              <span className="block">
                {q ? q.price.toFixed(q.digits) : "—"}
              </span>
              <span
                className={cn(
                  "block text-xs",
                  up ? "text-emerald-300" : "text-rose-300"
                )}
              >
                {q ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-white/55 text-xs">{label}</p>
      <p className="truncate font-semibold text-xl tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function FinancasWidget({ size }: { size: HomeWidget["size"] }) {
  const { txns } = usePersonalFinance();
  if (!txns.length) {
    return <Muted>Importe um extrato em Finanças pessoais.</Muted>;
  }
  const currency = mainCurrency(txns);
  const s = summarize(txns, inRange(txns, "mes"));
  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div>
        <p className="text-white/55 text-xs">Saldo da conta</p>
        <p className="font-light text-4xl tabular-nums tracking-tight">
          {money(s.conta ?? 0, currency)}
        </p>
      </div>
      {size === "s" ? null : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Entradas" value={money(s.entradas, currency, 0)} />
          <Stat label="Saídas" value={money(s.saidas, currency, 0)} />
          <Stat label="Resultado" value={money(s.resultado, currency, 0)} />
        </div>
      )}
    </div>
  );
}

function PosWidget({ size }: { size: HomeWidget["size"] }) {
  const days = usePosDaily(periodFor("today"));
  const { settings } = usePos();
  if (days === undefined) {
    return <Muted>Carregando…</Muted>;
  }
  if (days === null) {
    return <Muted>Entre no POS com o seu PIN para ver as vendas.</Muted>;
  }
  const t = summary(days);
  const m = (v: number) => posMoney(v, settings.currency);
  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div>
        <p className="text-white/55 text-xs">Vendas de hoje</p>
        <p className="font-light text-4xl tabular-nums tracking-tight">
          {m(t.sales)}
        </p>
      </div>
      {size === "s" ? null : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pedidos" value={String(t.orders)} />
          <Stat label="Ticket" value={m(t.ticket)} />
          <Stat label="Gorjetas" value={m(t.tips)} />
        </div>
      )}
    </div>
  );
}

/* --------------------------------- apps ---------------------------------- */

const APP_ICON_COLORS = [
  "from-[#d97757] to-[#a8492b]",
  "from-[#d4a27f] to-[#9c6b46]",
  "from-[#6a9bcc] to-[#3a6390]",
  "from-[#788c5d] to-[#4a5a35]",
  "from-[#cbcadb] to-[#8a88a6]",
  "from-[#ebdbbc] to-[#b49f74]",
];

/**
 * A page's square icon: the image the user uploaded for it, or its line icon
 * on a brand gradient. Sized by the caller (className).
 */
export function AppGlyph({
  href,
  className,
  round,
}: {
  href: string;
  className?: string;
  /** Circle (dock) instead of the rounded square. */
  round?: boolean;
}) {
  const { icons } = useHome();
  const item = navItemFor(href);
  if (!item) {
    return null;
  }
  const custom = icons[item.href];
  const i = navItems.indexOf(item);
  return (
    <span
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden bg-gradient-to-br text-white shadow-lg ring-1 ring-white/20 [container-type:inline-size]",
        round ? "rounded-full" : "rounded-[22%]",
        custom ? "bg-white/10" : APP_ICON_COLORS[i % APP_ICON_COLORS.length],
        className
      )}
    >
      {custom ? (
        // biome-ignore lint/performance/noImgElement: image (or link) chosen by the user
        <img
          alt=""
          className="size-full object-cover"
          draggable={false}
          height={160}
          src={custom}
          width={160}
        />
      ) : (
        <Icon className="size-[50cqw]" name={item.icon} />
      )}
    </span>
  );
}

/** A page as an app icon with its name (shortcuts widget, all apps). */
export function AppIcon({
  href,
  size = "md",
}: {
  href: string;
  size?: "md" | "lg";
}) {
  const item = navItemFor(href);
  if (!item) {
    return null;
  }
  return (
    <Link
      className="group flex w-16 flex-col items-center gap-1.5"
      href={item.href}
      title={item.label}
    >
      <AppGlyph
        className={cn(
          "transition-transform group-hover:scale-105 group-active:scale-95",
          size === "lg" ? "size-14" : "size-12"
        )}
        href={item.href}
      />
      <span className="w-full truncate text-center text-[11px] text-white/85">
        {item.label}
      </span>
    </Link>
  );
}

function AtalhosWidget({ size }: { size: HomeWidget["size"] }) {
  const { dock } = useHome();
  const pages = navItems
    .map((n) => n.href)
    .filter((h) => h !== "/" && !dock.includes(h));
  const count = { s: 4, m: 8, l: 16 }[size];
  return (
    <div className="flex flex-wrap justify-around gap-x-2 gap-y-3">
      {pages.slice(0, count).map((h) => (
        <AppIcon href={h} key={h} />
      ))}
    </div>
  );
}

const FRAME_HEIGHT = { s: 280, m: 380, l: 560 } as const;

function PaginaWidget({ widget }: { widget: HomeWidget }) {
  const [loaded, setLoaded] = useState(false);
  const href = widget.href ?? "/dashboard";
  return (
    <div
      className="relative -mx-1 -mb-1 overflow-hidden rounded-[20px] bg-black/20"
      style={{ height: FRAME_HEIGHT[widget.size] }}
    >
      {loaded ? null : (
        <div className="absolute inset-0 animate-pulse bg-white/5" />
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad only fades the page in */}
      <iframe
        className={cn(
          "size-full border-0 transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0"
        )}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${href === "/" ? "" : href}/?embed=1`}
        title={navItemFor(href)?.label ?? "Página"}
      />
    </div>
  );
}

/* --------------------------------- chooser -------------------------------- */

function Body({ widget }: { widget: HomeWidget }) {
  const { size } = widget;
  switch (widget.type) {
    case "escala":
      return <EscalaWidget size={size} />;
    case "ferry":
      return <FerryWidget size={size} />;
    case "clima":
      return <ClimaWidget />;
    case "noticias":
      return <NoticiasWidget size={size} />;
    case "notas":
      return <NotasWidget size={size} />;
    case "mercados":
      return <MercadosWidget size={size} />;
    case "financas":
      return <FinancasWidget size={size} />;
    case "pos":
      return <PosWidget size={size} />;
    case "atalhos":
      return <AtalhosWidget size={size} />;
    case "pagina":
      return <PaginaWidget widget={widget} />;
    case "vendas":
      return (
        <DailySalesChart
          series={size === "l" ? dailySales : dailySales.slice(-14)}
        />
      );
    case "metas":
      return <GoalsRing size={size === "l" ? 200 : 160} />;
    case "ocupacao":
      return (
        <div className="flex flex-1 items-center">
          <OccupancyGauge height={size === "s" ? 110 : 150} />
        </div>
      );
    case "fluxo":
      return <LiveOrdersChart height={size === "l" ? 260 : 200} />;
    case "pratos":
      return <TopDishesChart id={`dishes-${widget.id}`} />;
    case "pedidos":
      return <RecentOrdersList limit={size === "s" ? 3 : 5} />;
    case "movimento":
      return <TrafficHeatmap />;
    case "funil":
      return <CustomerFunnel />;
    default:
      return null;
  }
}

/** A widget: its glass card, title (links to its page) and content. */
export function WidgetView({ widget }: { widget: HomeWidget }) {
  const info = widgetInfo(widget.type);
  if (!info) {
    return null;
  }
  const page = widget.type === "pagina" ? navItemFor(widget.href ?? "") : null;
  const title: WidgetInfo = page
    ? { ...info, name: page.label, icon: page.icon, href: page.href }
    : info;
  return (
    <Glass>
      <Header info={title} />
      <Body widget={widget} />
    </Glass>
  );
}
