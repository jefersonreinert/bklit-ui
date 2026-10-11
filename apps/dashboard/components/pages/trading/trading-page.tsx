"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon, type IconName } from "@/lib/icons";
import {
  autoDigits,
  type FeedSource,
  formatPx,
  labelOf,
  type Quote,
  setDrawings,
  setSymbol,
  setTimeframe,
  TIMEFRAMES,
  type Timeframe,
  updateSettings,
  useCandles,
  useQuotes,
  useTrading,
  type WatchItem,
} from "@/lib/markets/trading";
import { cn } from "@/lib/utils";
import { UnlockCard } from "../browser/unlock-card";
import type { Candle } from "./mt5/engine/ChartEngine";
import { SVGChart } from "./mt5/SVGChart";
import { ChartSettingsDialog } from "./mt5/tv/chart-settings-dialog";
import type {
  Drawing,
  DrawingStyle,
  DrawToolType,
} from "./mt5/tv/drawing-engine";
import { DrawingPropertiesBar } from "./mt5/tv/drawing-properties-bar";
import { DrawingSettingsDialog } from "./mt5/tv/drawing-settings-dialog";
import { GoToDateDialog } from "./mt5/tv/go-to-date-dialog";
import { ReplayControls } from "./mt5/tv/replay-controls";
import { useReplay } from "./mt5/tv/use-replay";
import { SymbolOverview } from "./symbol-overview";
import { ToolRail, toolLabel } from "./trading-tools";
import { changeClass, pct, SymbolSearch, Watchlist } from "./trading-watchlist";

type Panel = "watchlist" | "search" | "settings" | "goto" | null;
type View = "list" | "chart";

const VIEW_KEY = "cb:trading:view";

function initialView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "chart" ? "chart" : "list";
  } catch {
    return "list";
  }
}

/** Phone: watchlist or chart (like TradingView's tabs); saved per device. */
function useMobileView() {
  const [view, setViewState] = useState<View>("list");
  useEffect(() => {
    setViewState(initialView());
  }, []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // private mode
    }
  }, []);
  return { view, setView };
}

const REPLAY_BARS = 150;

/** Drawing tools, selection and edits of the current symbol's drawings. */
function useDrawingState(symbol: string, drawings: Drawing[]) {
  const [tool, setTool] = useState<DrawToolType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const selected = drawings.find((d) => d.id === selectedId) ?? null;

  const change = useCallback(
    (next: Drawing[]) => setDrawings(symbol, next),
    [symbol]
  );
  const update = (partial: Partial<Drawing>) => {
    if (selected) {
      change(
        drawings.map((d) => (d.id === selected.id ? { ...d, ...partial } : d))
      );
    }
  };
  const remove = useCallback(() => {
    if (selectedId) {
      change(drawings.filter((d) => d.id !== selectedId));
      setSelectedId(null);
    }
  }, [selectedId, drawings, change]);
  const clone = () => {
    if (!selected) {
      return;
    }
    const copy: Drawing = {
      ...selected,
      id: crypto.randomUUID(),
      points: selected.points.map((p) => ({ ...p, price: p.price * 1.001 })),
    };
    change([...drawings, copy]);
    setSelectedId(copy.id);
  };
  const reset = () => {
    setTool(null);
    setSelectedId(null);
  };

  // Desktop shortcuts: Delete removes the selected drawing, Esc cancels
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        remove();
      } else if (e.key === "Escape") {
        setTool(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remove]);

  const actions = {
    active: tool,
    onPick: (t: DrawToolType | null) => {
      setTool(t);
      setSelectedId(null);
      if (t) {
        setHidden(false);
      }
    },
    hidden,
    onToggleHidden: () => setHidden((h) => !h),
    onClear: () => setAskClear(true),
    count: drawings.length,
  };
  const clearAll = () => {
    change([]);
    setSelectedId(null);
    setAskClear(false);
  };

  return {
    tool,
    setTool,
    selectedId,
    setSelectedId,
    selected,
    hidden,
    askClear,
    setAskClear,
    clearAll,
    change,
    update,
    remove,
    clone,
    reset,
    actions,
  };
}

/** Overview sheet target, chart opening and prev/next symbol. */
function useSymbolNav({
  watchlist,
  symbol,
  quotes,
  pickSymbol,
  overview,
  setOverview,
  setView,
}: {
  watchlist: WatchItem[];
  symbol: string;
  quotes: Record<string, Quote>;
  pickSymbol: (s: string) => void;
  overview: string | null;
  setOverview: (s: string | null) => void;
  setView: (v: View) => void;
}) {
  const openChart = (s: string) => {
    pickSymbol(s);
    setOverview(null);
    setView("chart");
  };
  const cycle = (dir: -1 | 1) => {
    const i = watchlist.findIndex((w) => w.symbol === symbol);
    const next = watchlist[(i + dir + watchlist.length) % watchlist.length];
    if (next) {
      pickSymbol(next.symbol);
    }
  };
  let overviewItem: WatchItem | null = null;
  if (overview !== null) {
    overviewItem = watchlist.find((w) => w.symbol === overview) ?? {
      symbol: overview,
      label: labelOf(overview),
      name: quotes[overview]?.name ?? overview,
    };
  }
  return { openChart, cycle, overviewItem };
}

/** Fixed precision from the settings, or automatic for the instrument. */
function chartDigits(
  precision: number,
  symbol: string,
  price: number | undefined,
  hint: number | undefined
) {
  return precision >= 0 ? precision : autoDigits(symbol, price ?? 1, hint);
}

/** Tablet: the watchlist in a bottom sheet. */
function WatchlistSheet({
  open,
  onClose,
  ...props
}: React.ComponentProps<typeof Watchlist> & {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="h-[80dvh] gap-0 rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Lista de ativos</SheetTitle>
        </SheetHeader>
        <div className="mt5 flex min-h-0 flex-1 flex-col pt-3">
          <Watchlist {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Phone: the full-screen watchlist (TradingView's first tab). */
function MobileWatchlist({
  onChart,
  ...props
}: React.ComponentProps<typeof Watchlist> & { onChart: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col md:hidden">
      <Watchlist {...props} />
      <ViewBar onChart={onChart} onSearch={props.onSearch} />
    </div>
  );
}

/** Charting platform (MT5 / TradingView style), mobile first. */
export function TradingPage() {
  const data = useTrading();
  const { symbol, tf, settings, watchlist } = data;
  const feed = useCandles(symbol, tf);
  const symbols = useMemo(() => {
    const list = watchlist.map((w) => w.symbol);
    return list.includes(symbol) ? list : [...list, symbol];
  }, [watchlist, symbol]);
  const { quotes, locked, reload: reloadQuotes } = useQuotes(symbols);
  const [panel, setPanel] = useState<Panel>(null);
  const { view, setView } = useMobileView();
  const [overview, setOverview] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [drawSettings, setDrawSettings] = useState(false);
  const [goTo, setGoTo] = useState<Date | null>(null);
  const candles = feed.candles ?? [];
  const replay = useReplay({ fullData: candles, activeTF: tf });
  const drawings = data.drawings[symbol] ?? [];
  const draw = useDrawingState(symbol, drawings);
  const { tool, selected, selectedId } = draw;

  const item = watchlist.find((w) => w.symbol === symbol);
  const label = item?.label ?? labelOf(symbol);
  const quote = quotes[symbol];
  const price = candles.at(-1)?.close ?? quote?.price;
  const digits = chartDigits(
    settings.precision,
    symbol,
    price,
    feed.digits ?? quote?.digits
  );

  const pickSymbol = (s: string) => {
    replay.stop();
    draw.reset();
    setSymbol(s);
    setPanel(null);
  };
  const nav = useSymbolNav({
    watchlist,
    symbol,
    quotes,
    pickSymbol,
    overview,
    setOverview,
    setView,
  });
  const toggleReplay = () =>
    replay.active
      ? replay.stop()
      : replay.start(Math.max(0, candles.length - REPLAY_BARS));

  if (feed.error === "locked" || locked) {
    return (
      <UnlockCard
        onDone={() => {
          feed.reload();
          reloadQuotes();
        }}
      />
    );
  }

  const toolActions = draw.actions;

  const shown = visibleDrawings(drawings, draw.hidden);
  const chartData = replay.active ? replay.replayData : candles;

  return (
    <div className="mt5 -m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      {view === "list" ? (
        <MobileWatchlist
          active={symbol}
          items={watchlist}
          onChart={() => setView("chart")}
          onPick={setOverview}
          onSearch={() => setPanel("search")}
          quotes={quotes}
          sections={data.sections}
        />
      ) : null}
      <ToolRail {...toolActions} />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          view === "list" && "max-md:hidden"
        )}
      >
        <TopBar
          change={quote}
          digits={digits}
          label={label}
          name={item?.name ?? quote?.name ?? symbol}
          onCycle={nav.cycle}
          onOverview={() => setOverview(symbol)}
          onPanel={setPanel}
          onReplay={toggleReplay}
          price={price}
          replayActive={replay.active}
          tf={tf}
        />
        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
            replay.active && "pt-9"
          )}
        >
          {candles.length > 0 ? (
            <SVGChart
              data={chartData}
              drawingProps={{
                drawings: shown,
                selectedId,
                activeTool: tool,
                onDrawingsChange: draw.change,
                onSelectedChange: draw.setSelectedId,
                onToolDone: () => draw.setTool(null),
              }}
              followLast={replay.active && replay.playing}
              goToDate={replay.active ? undefined : goTo}
              key={`${symbol}-${tf}`}
              settings={{ ...settings, precision: digits }}
            />
          ) : null}
          <ChartStatus
            candles={candles}
            error={feed.error}
            loading={feed.candles === null}
            onRetry={feed.reload}
            source={feed.source}
          />
          <ReplayControls
            precision={digits}
            replay={replay}
            symbol={symbol}
            timezone={settings.timezone}
          />
          <DrawOverlays
            draw={draw}
            label={label}
            onSettings={() => setDrawSettings(true)}
            rail={rail}
            settingsOpen={drawSettings || panel !== null}
          />
        </div>
        <MobileBar
          onDraw={() => setRail((r) => !r)}
          onList={() => setView("list")}
          onPanel={setPanel}
          onReplay={toggleReplay}
          rail={rail}
          replayActive={replay.active}
          tool={tool}
        />
      </div>
      <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
        <Watchlist
          active={symbol}
          compact
          items={watchlist}
          onPick={pickSymbol}
          onSearch={() => setPanel("search")}
          quotes={quotes}
          sections={data.sections}
        />
      </aside>

      <WatchlistSheet
        active={symbol}
        compact
        inSheet
        items={watchlist}
        onClose={() => setPanel(null)}
        onPick={pickSymbol}
        onSearch={() => setPanel("search")}
        open={panel === "watchlist"}
        quotes={quotes}
        sections={data.sections}
      />
      <SymbolSearch
        onClose={() => setPanel(null)}
        onPick={(s) => (view === "list" ? setOverview(s) : pickSymbol(s))}
        open={panel === "search"}
        watchlist={watchlist}
      />
      <SymbolOverview
        item={nav.overviewItem}
        onClose={() => setOverview(null)}
        onOpenChart={nav.openChart}
        quote={overview ? quotes[overview] : undefined}
      />
      <ChartSettingsDialog
        onClose={() => setPanel(null)}
        onUpdate={updateSettings}
        open={panel === "settings"}
        settings={settings}
      />
      <GoToDateDialog
        onClose={() => setPanel(null)}
        onGoTo={(d) => {
          setGoTo(d);
          setPanel(null);
        }}
        open={panel === "goto"}
      />
      {drawSettings && selected ? (
        <DrawingSettingsDialog
          drawing={selected}
          onClose={() => setDrawSettings(false)}
          onUpdate={draw.update}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  label,
  name,
  price,
  change,
  digits,
  tf,
  replayActive,
  onPanel,
  onReplay,
  onCycle,
  onOverview,
}: {
  onCycle: (dir: -1 | 1) => void;
  onOverview: () => void;
  label: string;
  name: string;
  price: number | undefined;
  change: Quote | undefined;
  digits: number;
  tf: Timeframe;
  replayActive: boolean;
  onPanel: (p: Panel) => void;
  onReplay: () => void;
}) {
  // Day change against the previous close, with the live price
  const diff = price !== undefined && change ? price - change.prevClose : 0;
  const diffPct = change?.prevClose ? (diff / change.prevClose) * 100 : 0;
  return (
    <div className="flex shrink-0 flex-col border-b md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-1 px-2 py-2 md:gap-2 md:px-3 md:py-1.5">
        <button
          aria-label="Ativo anterior"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          onClick={() => onCycle(-1)}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
        </button>
        <button
          className="flex min-w-0 items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-left hover:bg-muted"
          onClick={() => onPanel("search")}
          type="button"
        >
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            name="IconMagnifyingGlass"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[15px] leading-tight">
              {label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground leading-tight md:hidden">
              {name}
            </span>
          </span>
        </button>
        <button
          aria-label="Próximo ativo"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          onClick={() => onCycle(1)}
          type="button"
        >
          <Icon className="size-4 rotate-180" name="IconChevronLeft" />
        </button>
        <span className="ml-auto text-right md:ml-2">
          <span className="block font-mono font-semibold text-[15px] tabular-nums leading-tight">
            {price === undefined ? "—" : formatPx(price, digits)}
          </span>
          <span
            className={cn(
              "block font-mono text-[11px] tabular-nums leading-tight",
              changeClass(diff)
            )}
          >
            {change
              ? `${diff > 0 ? "+" : ""}${formatPx(diff, digits)} (${pct(diffPct)})`
              : ""}
          </span>
        </span>
      </div>
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto px-2 pb-1.5 md:flex-1 md:pb-0">
        {TIMEFRAMES.map((t) => (
          <button
            className={cn(
              "h-7 shrink-0 rounded-md px-2.5 font-medium text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              t.id === tf &&
                "bg-[#2962ff]/12 text-[#2962ff] hover:bg-[#2962ff]/18 hover:text-[#2962ff]"
            )}
            key={t.id}
            onClick={() => setTimeframe(t.id)}
            title={t.name}
            type="button"
          >
            {t.label}
          </button>
        ))}
        <button
          className="ml-auto h-7 shrink-0 rounded-md px-2.5 font-medium text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          onClick={onOverview}
          type="button"
        >
          Visão geral
        </button>
        <div className="ml-auto hidden items-center gap-0.5 md:flex">
          <BarButton
            icon="IconChart1"
            label="Visão geral do ativo"
            onClick={onOverview}
          />
          <BarButton
            active={replayActive}
            icon="IconReplay"
            label="Replay"
            onClick={onReplay}
          />
          <BarButton
            icon="IconCalendarClock"
            label="Ir para data"
            onClick={() => onPanel("goto")}
          />
          <BarButton
            icon="IconSettingsGear1"
            label="Configurações do gráfico"
            onClick={() => onPanel("settings")}
          />
          <span className="lg:hidden">
            <BarButton
              icon="IconListBullets"
              label="Lista de ativos"
              onClick={() => onPanel("watchlist")}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Phone, watchlist view: back to the chart or search a symbol. */
function ViewBar({
  onChart,
  onSearch,
}: {
  onChart: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-3 border-t pb-[env(safe-area-inset-bottom)]">
      <span className="flex flex-col items-center gap-0.5 py-1.5 font-medium text-[10px] text-foreground">
        <Icon className="size-5" name="IconListBullets" />
        Watchlist
      </span>
      <button
        className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] text-muted-foreground active:bg-muted"
        onClick={onChart}
        type="button"
      >
        <Icon className="size-5" name="IconTradingViewCandles" />
        Gráfico
      </button>
      <button
        className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] text-muted-foreground active:bg-muted"
        onClick={onSearch}
        type="button"
      >
        <Icon className="size-5" name="IconMagnifyingGlass" />
        Buscar
      </button>
    </div>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-[#2962ff]/12 text-[#2962ff]"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-[18px]" name={icon} />
    </button>
  );
}

/** Phone: thumb-reach actions under the chart. */
function MobileBar({
  onPanel,
  onReplay,
  onList,
  onDraw,
  rail,
  replayActive,
  tool,
}: {
  onPanel: (p: Panel) => void;
  onReplay: () => void;
  onList: () => void;
  onDraw: () => void;
  rail: boolean;
  replayActive: boolean;
  tool: DrawToolType | null;
}) {
  const items: {
    icon: IconName;
    label: string;
    onClick: () => void;
    active?: boolean;
  }[] = [
    {
      icon: "IconListBullets",
      label: "Watchlist",
      onClick: onList,
    },
    {
      icon: "IconPencil",
      label: "Desenhar",
      onClick: onDraw,
      active: rail || tool !== null,
    },
    {
      icon: "IconReplay",
      label: "Replay",
      onClick: onReplay,
      active: replayActive,
    },
    {
      icon: "IconCalendarClock",
      label: "Data",
      onClick: () => onPanel("goto"),
    },
    {
      icon: "IconSettingsGear1",
      label: "Ajustes",
      onClick: () => onPanel("settings"),
    },
  ];
  return (
    <div className="grid shrink-0 grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((i) => (
        <button
          className={cn(
            "flex flex-col items-center gap-0.5 py-1.5 text-[10px] text-muted-foreground active:bg-muted",
            i.active && "text-[#2962ff]"
          )}
          key={i.label}
          onClick={i.onClick}
          type="button"
        >
          <Icon className="size-5" name={i.icon} />
          {i.label}
        </button>
      ))}
    </div>
  );
}

const visibleDrawings = (drawings: Drawing[], hidden: boolean) =>
  hidden ? drawings.map((d) => ({ ...d, visible: false })) : drawings;

function DrawOverlays({
  draw,
  rail,
  label,
  settingsOpen,
  onSettings,
}: {
  draw: ReturnType<typeof useDrawingState>;
  rail: boolean;
  label: string;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  const { tool, selected } = draw;
  return (
    <>
      {rail ? <ToolRail floating {...draw.actions} /> : null}
      {tool ? (
        <DrawHint onCancel={() => draw.setTool(null)} tool={tool} />
      ) : null}
      {draw.askClear ? (
        <ConfirmClear
          count={draw.actions.count}
          label={label}
          onCancel={() => draw.setAskClear(false)}
          onConfirm={draw.clearAll}
        />
      ) : null}
      {selected && !settingsOpen && !tool ? (
        <DrawingPropertiesBar
          className="no-scrollbar max-w-[calc(100%-16px)] overflow-x-auto"
          drawing={selected}
          onClone={draw.clone}
          onDelete={draw.remove}
          onDrawingUpdate={draw.update}
          onSettings={onSettings}
          onStyleUpdate={(s: Partial<DrawingStyle>) =>
            draw.update({ style: { ...selected.style, ...s } })
          }
          style={{
            bottom: 36,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmClear({
  count,
  label,
  onConfirm,
  onCancel,
}: {
  count: number;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 py-1 pr-1 pl-3 text-xs shadow-lg backdrop-blur">
      <span className="whitespace-nowrap">
        Apagar {count} desenhos de {label}?
      </span>
      <button
        className="rounded-full bg-destructive px-2.5 py-1 font-medium text-white"
        onClick={onConfirm}
        type="button"
      >
        Apagar
      </button>
      <button
        className="rounded-full bg-muted px-2.5 py-1 font-medium"
        onClick={onCancel}
        type="button"
      >
        Cancelar
      </button>
    </div>
  );
}

function DrawHint({
  tool,
  onCancel,
}: {
  tool: DrawToolType;
  onCancel: () => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 py-1 pr-1 pl-3 text-xs shadow-lg backdrop-blur">
      <span className="whitespace-nowrap">
        {toolLabel(tool)}: toque no gráfico
      </span>
      <button
        className="rounded-full bg-muted px-2.5 py-1 font-medium"
        onClick={onCancel}
        type="button"
      >
        Cancelar
      </button>
    </div>
  );
}

const SOURCE_LABEL: Record<FeedSource, string> = {
  binance: "Binance · tempo real",
  yahoo: "Yahoo Finance",
};

function ChartStatus({
  candles,
  error,
  loading,
  source,
  onRetry,
}: {
  candles: Candle[];
  error: string | null;
  loading: boolean;
  source: FeedSource;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button onClick={onRetry} size="sm" variant="outline">
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (candles.length === 0) {
    return null;
  }
  return (
    <span className="pointer-events-none absolute bottom-9 left-2 text-[10px] text-muted-foreground/70">
      {SOURCE_LABEL[source]}
    </span>
  );
}
