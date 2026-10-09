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
import { ToolRail, ToolsSheet, toolLabel } from "./trading-tools";
import { changeClass, pct, SymbolSearch, Watchlist } from "./trading-watchlist";

type Panel = "watchlist" | "tools" | "search" | "settings" | "goto" | null;

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
  const digits =
    settings.precision >= 0
      ? settings.precision
      : autoDigits(symbol, price ?? 1, feed.digits ?? quote?.digits);

  const pickSymbol = (s: string) => {
    replay.stop();
    draw.reset();
    setSymbol(s);
    setPanel(null);
  };
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

  const shown = draw.hidden
    ? drawings.map((d) => ({ ...d, visible: false }))
    : drawings;
  const chartData = replay.active ? replay.replayData : candles;

  return (
    <div className="mt5 -m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <ToolRail {...toolActions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          change={quote}
          digits={digits}
          label={label}
          name={item?.name ?? quote?.name ?? symbol}
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
            settingsOpen={drawSettings || panel !== null}
          />
        </div>
        <MobileBar
          onPanel={setPanel}
          onReplay={toggleReplay}
          replayActive={replay.active}
          tool={tool}
        />
      </div>
      <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
        <Watchlist
          active={symbol}
          items={watchlist}
          onPick={pickSymbol}
          onSearch={() => setPanel("search")}
          quotes={quotes}
        />
      </aside>

      <Sheet
        onOpenChange={(o) => (o ? null : setPanel(null))}
        open={panel === "watchlist"}
      >
        <SheetContent
          className="h-[80dvh] gap-0 rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-lg"
          side="bottom"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Lista de ativos</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            <Watchlist
              active={symbol}
              inSheet
              items={watchlist}
              onPick={pickSymbol}
              onSearch={() => setPanel("search")}
              quotes={quotes}
            />
          </div>
        </SheetContent>
      </Sheet>
      <SymbolSearch
        onClose={() => setPanel(null)}
        onPick={pickSymbol}
        open={panel === "search"}
        watchlist={watchlist}
      />
      <ToolsSheet
        onClose={() => setPanel(null)}
        open={panel === "tools"}
        {...toolActions}
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
}: {
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
      <div className="flex min-w-0 items-center gap-2 px-3 py-2 md:py-1.5">
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
        <div className="ml-auto hidden items-center gap-0.5 md:flex">
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

/** Phone: thumb-reach actions under the chart. */
function MobileBar({
  onPanel,
  onReplay,
  replayActive,
  tool,
}: {
  onPanel: (p: Panel) => void;
  onReplay: () => void;
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
      label: "Lista",
      onClick: () => onPanel("watchlist"),
    },
    {
      icon: "IconPencil",
      label: "Desenhar",
      onClick: () => onPanel("tools"),
      active: tool !== null,
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

function DrawOverlays({
  draw,
  label,
  settingsOpen,
  onSettings,
}: {
  draw: ReturnType<typeof useDrawingState>;
  label: string;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  const { tool, selected } = draw;
  return (
    <>
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
