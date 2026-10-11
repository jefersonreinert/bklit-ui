"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import {
  type History,
  periodChange,
  RANGE_LABEL,
  RANGE_PAST,
  RANGES,
  type RangeId,
} from "@/lib/markets/history";
import { technicals } from "@/lib/markets/technicals";
import {
  autoDigits,
  formatPx,
  type Quote,
  type WatchItem,
} from "@/lib/markets/trading";
import { useHistory, useSymbolNews } from "@/lib/markets/use-overview";
import { cn } from "@/lib/utils";
import { RangeChart } from "./range-chart";
import { SymbolIcon } from "./symbol-icon";
import { TechnicalsGauge } from "./technicals-gauge";
import { changeClass, PriceText, pct, signed } from "./trading-watchlist";

/**
 * Symbol overview (TradingView's bottom sheet): price and change, range
 * chart 1D … All, key data, technical rating, news and details.
 */

type Tab = "overview" | "news";

function compact(n: number) {
  return n.toLocaleString("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function KeyData({ day, digits }: { day: History | null; digits: number }) {
  const m = day?.meta;
  const rows: [string, string][] = [
    ["Volume", m?.volume ? compact(m.volume) : "N/D"],
    [
      "Fechamento anterior",
      m?.previousClose == null ? "—" : formatPx(m.previousClose, digits),
    ],
    ["Abertura", m?.open == null ? "—" : formatPx(m.open, digits)],
    [
      "Faixa do dia",
      m?.dayLow == null || m.dayHigh == null
        ? "—"
        : `${formatPx(m.dayLow, digits)} — ${formatPx(m.dayHigh, digits)}`,
    ],
    [
      "Faixa de 52 semanas",
      m?.low52 == null || m.high52 == null
        ? "—"
        : `${formatPx(m.low52, digits)} — ${formatPx(m.high52, digits)}`,
    ],
  ];
  return (
    <section className="flex flex-col">
      <h3 className="mb-1 font-semibold text-lg">Dados principais</h3>
      {rows.map(([k, v]) => (
        <div className="flex justify-between gap-3 py-2.5 text-[15px]" key={k}>
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium tabular-nums">
            {v}{" "}
            {v !== "—" && v !== "N/D" && k !== "Volume" ? (
              <span className="text-muted-foreground text-xs">
                {m?.currency}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </section>
  );
}

function News({ symbol }: { symbol: string }) {
  const news = useSymbolNews(symbol, true);
  if (news.loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!news.data?.length) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {news.error ?? "Sem notícias recentes para este ativo."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {news.data.slice(0, 25).map((n) => (
        <li className="border-b" key={n.link}>
          <a
            className="flex flex-col gap-0.5 py-3"
            href={n.link}
            rel="noreferrer"
            target="_blank"
          >
            <span className="text-muted-foreground text-xs">
              {new Date(n.date).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              · {n.source || "Yahoo Finance"}
            </span>
            <span className="font-medium text-[15px] leading-snug">
              {n.title}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Header({
  item,
  meta,
}: {
  item: WatchItem;
  meta: History["meta"] | undefined;
}) {
  return (
    <SheetHeader className="flex-row items-center gap-3 p-4 pb-2">
      <SymbolIcon className="size-12" label={item.label} symbol={item.symbol} />
      <div className="min-w-0 flex-1 text-left">
        <SheetTitle className="truncate text-lg">
          {meta?.name || item.name}
        </SheetTitle>
        <SheetDescription className="truncate">
          {item.label}
          {meta?.exchange ? ` · ${meta.exchange}` : ""}
        </SheetDescription>
      </div>
    </SheetHeader>
  );
}

function PriceBlock({
  symbol,
  price,
  quote,
  digits,
  currency,
  change,
  range,
}: {
  symbol: string;
  price: number | null;
  quote: Quote | undefined;
  digits: number;
  currency: string;
  change: ReturnType<typeof periodChange>;
  range: RangeId;
}) {
  const day = quote ? { abs: quote.change, pct: quote.changePct } : null;
  return (
    <div className="px-4">
      <p className="flex items-baseline gap-2">
        <span className="font-bold text-4xl tracking-tight">
          {price == null ? (
            "—"
          ) : (
            <PriceText digits={digits} symbol={symbol} value={price} />
          )}
        </span>
        <span className="font-medium text-sm">{currency}</span>
      </p>
      {day ? (
        <p
          className={cn(
            "font-medium text-lg tabular-nums",
            changeClass(day.pct)
          )}
        >
          {signed(day.abs, digits)} {pct(day.pct)}{" "}
          <span className="font-normal text-muted-foreground text-sm">
            {quote?.marketState === "open" ? "agora" : "no fechamento"}
          </span>
        </p>
      ) : null}
      {change && range !== "1D" ? (
        <p className={cn("text-sm tabular-nums", changeClass(change.pct))}>
          {signed(change.abs, digits)} {pct(change.pct)} {RANGE_PAST[range]}
        </p>
      ) : null}
    </div>
  );
}

/** Everything the sheet shows for one symbol and range. */
function useOverview(
  item: WatchItem,
  quote: Quote | undefined,
  range: RangeId
) {
  const hist = useHistory(item.symbol, range);
  const day = useHistory(item.symbol, "1D");
  const year = useHistory(item.symbol, "1Y");
  const meta = day.data?.meta ?? hist.data?.meta;
  const price = quote?.price ?? meta?.price ?? null;
  const digits = autoDigits(
    item.symbol,
    price ?? 1,
    meta?.digits ?? quote?.digits
  );
  const change = hist.data ? periodChange(hist.data, range) : null;
  const tech = useMemo(
    () =>
      year.data
        ? technicals(
            year.data.points.map((p) => ({ high: p.h, low: p.l, close: p.c }))
          )
        : null,
    [year.data]
  );
  const baseline =
    range === "1D"
      ? (hist.data?.meta.previousClose ?? null)
      : (change?.base ?? null);
  return { hist, day, year, meta, price, digits, change, tech, baseline };
}

function Body({
  item,
  quote,
  onOpenChart,
}: {
  item: WatchItem;
  quote: Quote | undefined;
  onOpenChart: (symbol: string) => void;
}) {
  const [range, setRange] = useState<RangeId>("1D");
  const [tab, setTab] = useState<Tab>("overview");
  const { hist, day, year, meta, price, digits, change, tech, baseline } =
    useOverview(item, quote, range);

  return (
    <>
      <Header item={item} meta={meta} />
      <PriceBlock
        change={change}
        currency={meta?.currency ?? quote?.currency ?? ""}
        digits={digits}
        price={price}
        quote={quote}
        range={range}
        symbol={item.symbol}
      />
      <div className="relative mt-2 px-2">
        {hist.data && hist.data.points.length > 1 ? (
          <RangeChart
            baseline={baseline}
            digits={digits}
            points={hist.data.points}
            range={range}
            up={(change?.pct ?? 0) >= 0}
          />
        ) : (
          <div className="flex h-56 items-center justify-center text-muted-foreground text-sm">
            {hist.loading ? (
              <Spinner />
            ) : (
              (hist.error ?? "Sem dados para este período.")
            )}
          </div>
        )}
        <button
          aria-label="Abrir gráfico de velas"
          className="absolute right-4 bottom-8 flex size-11 items-center justify-center rounded-full border bg-background shadow-sm"
          onClick={() => onOpenChart(item.symbol)}
          type="button"
        >
          <Icon className="size-5" name="IconTradingViewCandles" />
        </button>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
        {RANGES.map((r) => (
          <button
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 font-medium text-sm",
              r === range ? "bg-muted" : "text-muted-foreground"
            )}
            key={r}
            onClick={() => setRange(r)}
            type="button"
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="px-4 py-2">
        <Button
          className="w-full"
          onClick={() => onOpenChart(item.symbol)}
          size="lg"
        >
          Abrir gráfico
        </Button>
      </div>
      <div className="sticky top-0 z-10 flex gap-1 border-b bg-popover px-3 py-2">
        {(
          [
            ["overview", "Visão geral"],
            ["news", "Notícias"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium text-[15px]",
              tab === t ? "bg-muted" : "text-muted-foreground"
            )}
            key={t}
            onClick={() => setTab(t)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-6 px-4 py-4">
        {tab === "overview" ? (
          <>
            <KeyData day={day.data} digits={digits} />
            <section>
              <h3 className="mb-2 font-semibold text-lg">Técnicos</h3>
              {tech ? (
                <TechnicalsGauge data={tech} digits={digits} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {year.loading
                    ? "Calculando…"
                    : "Histórico insuficiente para os técnicos."}
                </p>
              )}
            </section>
            <section className="text-sm">
              <h3 className="mb-2 font-semibold text-lg">Sobre</h3>
              <p className="text-muted-foreground">
                {meta?.name || item.name} · {item.symbol}
                {meta?.type ? ` · ${meta.type}` : ""}
                {meta?.exchange ? ` · ${meta.exchange}` : ""}. Dados do Yahoo
                Finance, com atraso conforme a bolsa.
              </p>
            </section>
          </>
        ) : (
          <News symbol={item.symbol} />
        )}
      </div>
    </>
  );
}

export function SymbolOverview({
  item,
  quote,
  onClose,
  onOpenChart,
}: {
  item: WatchItem | null;
  quote: Quote | undefined;
  onClose: () => void;
  onOpenChart: (symbol: string) => void;
}) {
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(item)}>
      <SheetContent
        className="gap-0 overflow-y-auto rounded-t-3xl bg-popover p-0 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[92dvh] md:mx-auto md:max-w-xl"
        side="bottom"
      >
        {item ? (
          <div className="mt5">
            <Body
              item={item}
              key={item.symbol}
              onOpenChart={onOpenChart}
              quote={quote}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
