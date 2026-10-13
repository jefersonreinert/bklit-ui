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
  type Timeframe,
  updateSettings,
  useCandles,
  useQuotes,
  useTrading,
  type WatchItem,
} from "@/lib/markets/trading";
import { cn } from "@/lib/utils";
import { UnlockCard } from "../browser/unlock-card";
import { ExploreView } from "./explore-view";
import { FloatingTimeframes } from "./floating-timeframes";
import { JournalPanel, type JournalTab } from "./journal/journal-panel";
import {
  ChartToolbar,
  type MobileView,
  type MoreAction,
  TabBar,
} from "./mobile-chrome";
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
import { TradePanel } from "./order/trade-panel";
import { SymbolIcon } from "./symbol-icon";
import { SymbolOverview } from "./symbol-overview";
import { ToolRail, toolLabel } from "./trading-tools";
import { changeClass, pct, SymbolSearch, Watchlist } from "./trading-watchlist";

type Panel = "watchlist" | "search" | "settings" | "goto" | null;
type View = MobileView;

const VIEW_KEY = "cb:trading:view";
/** Full-width views that replace the chart. */
const SIDE_VIEWS = new Set<string>(["explore", "journal", "trade"]);

const VIEWS = new Set<string>(["list", "chart", "explore", "trade", "journal"]);

function initialView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY) ?? "";
    return VIEWS.has(saved) ? (saved as View) : "list";
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
  onView,
  ...props
}: React.ComponentProps<typeof Watchlist> & {
  onView: (v: View) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col md:hidden">
      <Watchlist {...props} />
      <TabBar onView={onView} view="list" />
    </div>
  );
}

/** Trading journal (all sizes): MT5 operations, metrics, TV alerts. */
function JournalView({
  onView,
  tab,
}: {
  onView: (v: View) => void;
  tab: JournalTab;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="hidden border-b px-3 py-2 md:block">
        <button
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onView("chart")}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar ao gráfico
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <JournalPanel initialTab={tab} />
      </div>
      <TabBar onView={onView} view="journal" />
    </div>
  );
}

/** Trading (all sizes): lot calculator, orders and positions via the EA. */
function TradeView({
  onView,
  symbol,
}: {
  onView: (v: View) => void;
  symbol: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="hidden border-b px-3 py-2 md:block">
        <button
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onView("chart")}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar ao gráfico
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TradePanel chartSymbol={symbol} />
      </div>
      <TabBar onView={onView} view="trade" />
    </div>
  );
}

/** Explore (all sizes): market cards, shortcuts and top stories. */
function ExplorePanel({
  onView,
  onPick,
  onSearch,
}: {
  onView: (v: View) => void;
  onPick: (s: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="hidden border-b px-3 py-2 md:block">
        <button
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onView("chart")}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar ao gráfico
        </button>
      </div>
      <ExploreView onPick={onPick} onSearch={onSearch} />
      <TabBar onView={onView} view="explore" />
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
  const [journalTab, setJournalTab] = useState<JournalTab>("summary");
  const sidePanel = SIDE_VIEWS.has(view);
  const [overview, setOverview] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [drawSettings, setDrawSettings] = useState(false);
  const [goTo, setGoTo] = useState<Date | null>(null);
  const candles = feed.candles ?? [];
  const replay = useReplay({ fullData: candles, activeTF: tf });
  const drawings = data.drawings[symbol] ?? [];
  const draw = useDrawingState(symbol, drawings);
  const { tool, selected } = draw;

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

  return (
    <div className="mt5 -m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      {view === "list" ? (
        <MobileWatchlist
          active={symbol}
          items={watchlist}
          onPick={setOverview}
          onSearch={() => setPanel("search")}
          onView={setView}
          quotes={quotes}
          sections={data.sections}
        />
      ) : null}
      {view === "journal" ? (
        <JournalView onView={setView} tab={journalTab} />
      ) : null}
      {view === "trade" ? <TradeView onView={setView} symbol={symbol} /> : null}
      {view === "explore" ? (
        <ExplorePanel
          onPick={setOverview}
          onSearch={() => setPanel("search")}
          onView={setView}
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1",
          view === "list" && "max-md:hidden",
          sidePanel && "hidden"
        )}
      >
        <ToolRail {...toolActions} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            change={quote}
            digits={digits}
            label={label}
            name={item?.name ?? quote?.name ?? symbol}
            onCycle={nav.cycle}
            onExplore={() => setView("explore")}
            onJournal={(tab) => {
              setJournalTab(tab);
              setView("journal");
            }}
            onOverview={() => setOverview(symbol)}
            onPanel={setPanel}
            onReplay={toggleReplay}
            onTrade={() => setView("trade")}
            price={price}
            replayActive={replay.active}
            symbol={symbol}
          />
          <ChartViewport
            candles={candles}
            digits={digits}
            draw={draw}
            drawings={shown}
            feed={feed}
            goTo={goTo}
            label={label}
            onDrawSettings={() => setDrawSettings(true)}
            rail={rail}
            replay={replay}
            settings={settings}
            settingsOpen={drawSettings || panel !== null}
            symbol={symbol}
            tf={tf}
          />
          <ChartToolbar
            canUndo={drawings.length > 0}
            drawing={rail || tool !== null}
            labelOf={(s) =>
              watchlist.find((w) => w.symbol === s)?.label ?? labelOf(s)
            }
            more={moreActions({
              setPanel,
              setOverview,
              symbol,
              onJournal: (tab) => {
                setJournalTab(tab);
                setView("journal");
              },
            })}
            onDraw={() => setRail((r) => !r)}
            onReplay={toggleReplay}
            onSymbol={pickSymbol}
            onTf={setTimeframe}
            onUndo={() => draw.change(drawings.slice(0, -1))}
            replay={replay.active}
            symbol={symbol}
            symbols={watchlist.map((w) => w.symbol)}
            tf={tf}
          />
          <TabBar onView={setView} view="chart" />
        </div>
      </div>
      <aside
        className={cn(
          "hidden w-72 shrink-0 flex-col border-l lg:flex",
          sidePanel && "lg:hidden"
        )}
      >
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
  symbol,
  replayActive,
  onPanel,
  onReplay,
  onCycle,
  onOverview,
  onExplore,
  onTrade,
  onJournal,
}: {
  onJournal: (tab: JournalTab) => void;
  onExplore: () => void;
  onTrade: () => void;
  onCycle: (dir: -1 | 1) => void;
  onOverview: () => void;
  label: string;
  name: string;
  price: number | undefined;
  change: Quote | undefined;
  digits: number;
  symbol: string;
  replayActive: boolean;
  onPanel: (p: Panel) => void;
  onReplay: () => void;
}) {
  // Day change against the previous close, with the live price
  const diff = price !== undefined && change ? price - change.prevClose : 0;
  const diffPct = change?.prevClose ? (diff / change.prevClose) * 100 : 0;
  return (
    <div className="flex shrink-0 flex-col border-b md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-0.5 px-1.5 pt-1 md:gap-2 md:px-3 md:py-1.5">
        <button
          aria-label="Ativo anterior"
          className="flex size-7 shrink-0 items-center justify-center text-muted-foreground md:hidden"
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
          <SymbolIcon className="size-7" label={label} symbol={symbol} />
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
          className="flex size-7 shrink-0 items-center justify-center text-muted-foreground md:hidden"
          onClick={() => onCycle(1)}
          type="button"
        >
          <Icon className="size-4 rotate-180" name="IconChevronLeft" />
        </button>
        <span className="ml-auto text-right md:ml-2">
          <span className="block font-semibold text-[15px] tabular-nums leading-tight">
            {price === undefined ? "—" : formatPx(price, digits)}
          </span>
          <span
            className={cn(
              "block text-[11px] tabular-nums leading-tight",
              changeClass(diff)
            )}
          >
            {change
              ? `${diff > 0 ? "+" : ""}${formatPx(diff, digits)} (${pct(diffPct)})`
              : ""}
          </span>
        </span>
      </div>
      <div className="hidden items-center px-2 md:flex md:flex-1">
        <div className="ml-auto hidden items-center gap-0.5 md:flex">
          <BarButton
            icon="IconChart1"
            label="Visão geral do ativo"
            onClick={onOverview}
          />
          <BarButton
            icon="IconCompassRound"
            label="Explorar mercados"
            onClick={onExplore}
          />
          <BarButton
            icon="IconCalculator"
            label="Operar: calculadora de lote e ordens no MT5"
            onClick={onTrade}
          />
          <BarButton
            icon="IconNotebook"
            label="Diário de trading"
            onClick={() => onJournal("summary")}
          />
          <BarButton
            icon="IconArrowsRepeat"
            label="Conector TradingView → MetaTrader"
            onClick={() => onJournal("connector")}
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

function moreActions({
  setPanel,
  setOverview,
  symbol,
  onJournal,
}: {
  setPanel: (p: Panel) => void;
  setOverview: (s: string) => void;
  symbol: string;
  onJournal: (tab: JournalTab) => void;
}): MoreAction[] {
  return [
    {
      label: "Conector TradingView → MT5",
      icon: "IconArrowsRepeat",
      onClick: () => onJournal("connector"),
    },
    {
      label: "Visão geral do ativo",
      icon: "IconChart1",
      onClick: () => setOverview(symbol),
    },
    {
      label: "Buscar ativo",
      icon: "IconMagnifyingGlass",
      onClick: () => setPanel("search"),
    },
    {
      label: "Ir para data",
      icon: "IconCalendarClock",
      onClick: () => setPanel("goto"),
    },
    {
      label: "Configurações do gráfico",
      icon: "IconSettingsGear1",
      onClick: () => setPanel("settings"),
    },
  ];
}

function ChartViewport({
  symbol,
  tf,
  candles,
  feed,
  replay,
  draw,
  drawings,
  settings,
  digits,
  goTo,
  label,
  rail,
  settingsOpen,
  onDrawSettings,
}: {
  symbol: string;
  tf: Timeframe;
  candles: Candle[];
  feed: ReturnType<typeof useCandles>;
  replay: ReturnType<typeof useReplay>;
  draw: ReturnType<typeof useDrawingState>;
  drawings: Drawing[];
  settings: ReturnType<typeof useTrading>["settings"];
  digits: number;
  goTo: Date | null;
  label: string;
  rail: boolean;
  settingsOpen: boolean;
  onDrawSettings: () => void;
}) {
  const { tool, selectedId } = draw;
  const chartData = replay.active ? replay.replayData : candles;
  return (
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
            drawings,
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
      <FloatingTimeframes onTf={setTimeframe} tf={tf} />
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
        onSettings={onDrawSettings}
        rail={rail}
        settingsOpen={settingsOpen}
      />
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
