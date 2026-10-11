"use client";

import { useId, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { timeAgo, useNews } from "@/lib/browser/news";
import { useNewsFeeds } from "@/lib/browser/store";
import { Icon, type IconName } from "@/lib/icons";
import { EXPLORE, type Spark, sparkChange } from "@/lib/markets/explore";
import { autoDigits, formatPx } from "@/lib/markets/trading";
import { useSparks } from "@/lib/markets/use-overview";
import { cn } from "@/lib/utils";
import { SymbolIcon } from "./symbol-icon";
import { changeClass, pct } from "./trading-watchlist";

/**
 * TradingView's Explore tab: shortcuts to news and the economic calendar,
 * market cards per category with today's line, and top stories.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function SparkLine({ closes, up }: { closes: number[]; up: boolean }) {
  const id = useId();
  if (closes.length < 2) {
    return <div className="h-16" />;
  }
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const W = 160;
  const H = 56;
  const x = (i: number) => (i / (closes.length - 1)) * (W - 6);
  const y = (v: number) => 4 + (1 - (v - min) / (max - min || 1)) * (H - 8);
  const line = closes
    .map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`)
    .join("");
  const color = up ? "var(--up, #26a69a)" : "var(--down, #ef5350)";
  const lastY = y(closes.at(-1) ?? 0);
  return (
    <svg
      aria-hidden="true"
      className="h-16 w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${W} ${H}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line}L${x(closes.length - 1)} ${H}L0 ${H}Z`}
        fill={`url(#${id})`}
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(closes.length - 1)} cy={lastY} fill={color} r="3" />
    </svg>
  );
}

function MarketCard({
  symbol,
  label,
  name,
  spark,
  onPick,
}: {
  symbol: string;
  label: string;
  name: string;
  spark: Spark | undefined;
  onPick: (symbol: string) => void;
}) {
  const change = spark ? sparkChange(spark) : null;
  const digits = spark?.price ? autoDigits(symbol, spark.price) : 2;
  return (
    <button
      className="flex min-w-0 flex-col gap-1 overflow-hidden rounded-2xl border bg-card pt-3 text-left transition-colors hover:bg-muted/40"
      onClick={() => onPick(symbol)}
      type="button"
    >
      <span className="flex items-center gap-2 px-3">
        <SymbolIcon className="size-7" label={label} symbol={symbol} />
        <span className="truncate font-semibold text-[15px]">{name}</span>
      </span>
      <span className="px-3 text-[15px] tabular-nums">
        {spark?.price == null ? "—" : formatPx(spark.price, digits)}{" "}
        <span className="text-muted-foreground text-xs">{spark?.currency}</span>
      </span>
      <span
        className={cn("px-3 text-sm tabular-nums", changeClass(change ?? 0))}
      >
        {change == null ? " " : `${pct(change)} `}
        <span className="text-muted-foreground">hoje</span>
      </span>
      <SparkLine closes={spark?.closes ?? []} up={(change ?? 0) >= 0} />
    </button>
  );
}

function Shortcut({
  icon,
  label,
  href,
  onClick,
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const cls =
    "flex flex-col items-center gap-2 rounded-2xl bg-muted/60 py-4 font-medium text-[15px] transition-colors hover:bg-muted";
  const body = (
    <>
      <Icon className="size-6" name={icon} />
      {label}
    </>
  );
  return href ? (
    <a className={cls} href={href}>
      {body}
    </a>
  ) : (
    <button className={cls} onClick={onClick} type="button">
      {body}
    </button>
  );
}

function TopStories() {
  const feeds = useNewsFeeds();
  const { items, loading } = useNews(feeds);
  return (
    <section className="flex flex-col">
      <a
        className="flex items-center gap-1 px-4 pt-6 pb-2 font-bold text-2xl"
        href={`${BASE}/noticias/`}
      >
        Principais notícias{" "}
        <Icon className="size-5" name="IconChevronRightSmall" />
      </a>
      {loading && !items ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : null}
      {(items ?? []).slice(0, 10).map((n) => (
        <a
          className="flex flex-col gap-1 border-b px-4 py-4"
          href={n.link}
          key={n.link}
          rel="noreferrer"
          target="_blank"
        >
          <span className="text-muted-foreground text-sm">
            {timeAgo(n.date)} · {n.source}
          </span>
          <span className="font-semibold text-[17px] leading-snug">
            {n.title}
          </span>
        </a>
      ))}
    </section>
  );
}

export function ExploreView({
  onPick,
  onSearch,
}: {
  onPick: (symbol: string) => void;
  onSearch: () => void;
}) {
  const [cat, setCat] = useState(EXPLORE[0]?.id ?? "indices");
  const category = EXPLORE.find((c) => c.id === cat) ?? EXPLORE[0];
  const items = category?.items ?? [];
  const { sparks } = useSparks(items.map((i) => i.symbol));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="font-bold text-4xl tracking-tight">Explorar</h2>
        <button
          aria-label="Buscar ativo"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
          onClick={onSearch}
          type="button"
        >
          <Icon className="size-6" name="IconMagnifyingGlass" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        <Shortcut
          href={`${BASE}/noticias/`}
          icon="IconNewspaper"
          label="Notícias"
        />
        <Shortcut
          href={`${BASE}/calendario/`}
          icon="IconCalendar1"
          label="Calendário"
        />
        <Shortcut
          icon="IconMagnifyingGlass"
          label="Buscar"
          onClick={onSearch}
        />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-4">
        {EXPLORE.map((c) => (
          <button
            className={cn(
              "shrink-0 rounded-full px-4 py-2 font-medium text-[15px]",
              c.id === cat ? "bg-foreground text-background" : "bg-muted/60"
            )}
            key={c.id}
            onClick={() => setCat(c.id)}
            type="button"
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="no-scrollbar grid auto-cols-[46%] grid-flow-col grid-rows-2 gap-3 overflow-x-auto px-4 pt-4 md:auto-cols-[30%]">
        {items.map((i) => (
          <MarketCard
            key={i.symbol}
            label={i.label}
            name={i.name}
            onPick={onPick}
            spark={sparks[i.symbol]}
            symbol={i.symbol}
          />
        ))}
      </div>
      <TopStories />
    </div>
  );
}
