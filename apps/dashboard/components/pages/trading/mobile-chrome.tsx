"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { TIMEFRAMES, type Timeframe } from "@/lib/markets/trading";
import { cn } from "@/lib/utils";

/**
 * Phone chrome like TradingView's app: the bottom tab bar (Watchlist,
 * Chart, Explore) and the chart toolbar with symbol and timeframe wheels.
 */

export type MobileView = "list" | "chart" | "explore" | "journal";

const TABS: { view: MobileView; label: string; icon: IconName }[] = [
  { view: "list", label: "Watchlist", icon: "IconListBullets" },
  { view: "chart", label: "Gráfico", icon: "IconTradingViewCandles" },
  { view: "explore", label: "Explorar", icon: "IconCompassRound" },
  { view: "journal", label: "Diário", icon: "IconNotebook" },
];

export function TabBar({
  view,
  onView,
}: {
  view: MobileView;
  onView: (v: MobileView) => void;
}) {
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map((t) => (
        <button
          aria-current={t.view === view ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-0.5 py-1.5 text-[11px] active:bg-muted",
            t.view === view
              ? "font-semibold text-foreground"
              : "text-muted-foreground"
          )}
          key={t.view}
          onClick={() => onView(t.view)}
          type="button"
        >
          <Icon className="size-6" name={t.icon} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

const ROW = 22;
const SETTLE_MS = 120;

/**
 * iOS-style vertical wheel: the centered row is the value; scroll or tap a
 * neighbor to change it.
 */
export function Wheel<T extends string>({
  items,
  value,
  onChange,
  render,
  label,
  className,
}: {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.indexOf(value));

  // Re-center when the value changes and when the wheel becomes visible
  // (scrollTop can't be set while a parent is display: none).
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const align = () => {
      if (el.clientHeight > 0 && Math.round(el.scrollTop / ROW) !== index) {
        el.scrollTo({ top: index * ROW });
      }
    };
    align();
    const ro = new ResizeObserver(align);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  const onScroll = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) {
        return;
      }
      const next = items[Math.round(el.scrollTop / ROW)];
      if (next && next !== value) {
        onChange(next);
      }
    }, SETTLE_MS);
  };

  return (
    <div
      aria-label={label}
      className={cn(
        "no-scrollbar relative h-[66px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[22px]",
        className
      )}
      onScroll={onScroll}
      ref={ref}
      role="listbox"
    >
      {items.map((it) => (
        <button
          aria-selected={it === value}
          className={cn(
            "block h-[22px] w-full snap-center truncate text-left leading-[22px] transition-all",
            it === value
              ? "font-semibold text-[19px] text-foreground"
              : "text-[13px] text-muted-foreground/50"
          )}
          key={it}
          onClick={() => onChange(it)}
          role="option"
          type="button"
        >
          {render(it)}
        </button>
      ))}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground disabled:opacity-30",
        active && "bg-[#2962ff]/12 text-[#2962ff]"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-6" name={icon} />
    </button>
  );
}

export interface MoreAction {
  label: string;
  icon: IconName;
  onClick: () => void;
}

function MoreMenu({
  actions,
  onClose,
}: {
  actions: MoreAction[];
  onClose: () => void;
}) {
  return (
    <>
      <button
        aria-label="Fechar menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="absolute right-2 bottom-full z-50 mb-2 flex min-w-48 flex-col rounded-xl border bg-popover p-1 shadow-xl">
        {actions.map((a) => (
          <button
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
            key={a.label}
            onClick={() => {
              a.onClick();
              onClose();
            }}
            type="button"
          >
            <Icon className="size-4" name={a.icon} />
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function ChartToolbar({
  symbols,
  symbol,
  labelOf,
  onSymbol,
  tf,
  onTf,
  drawing,
  onDraw,
  replay,
  onReplay,
  canUndo,
  onUndo,
  more,
}: {
  symbols: string[];
  symbol: string;
  labelOf: (s: string) => string;
  onSymbol: (s: string) => void;
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
  drawing: boolean;
  onDraw: () => void;
  replay: boolean;
  onReplay: () => void;
  canUndo: boolean;
  onUndo: () => void;
  more: MoreAction[];
}) {
  const [menu, setMenu] = useState(false);
  const list = symbols.includes(symbol) ? symbols : [...symbols, symbol];
  return (
    <div className="relative flex shrink-0 items-center gap-1 border-t px-3 md:hidden">
      <Wheel
        className="w-[38%] shrink-0"
        items={list}
        label="Ativo"
        onChange={onSymbol}
        render={labelOf}
        value={symbol}
      />
      <Wheel
        className="w-14 shrink-0"
        items={TIMEFRAMES.map((t) => t.id)}
        label="Tempo gráfico"
        onChange={onTf}
        render={(id) => TIMEFRAMES.find((t) => t.id === id)?.label ?? id}
        value={tf}
      />
      <div className="ml-auto flex items-center">
        <ToolButton
          active={drawing}
          icon="IconPencil"
          label="Desenhar"
          onClick={onDraw}
        />
        <ToolButton
          active={replay}
          icon="IconReplay"
          label="Replay"
          onClick={onReplay}
        />
        <ToolButton
          icon="IconDotGrid1x3Horizontal"
          label="Mais"
          onClick={() => setMenu(!menu)}
        />
        <ToolButton
          disabled={!canUndo}
          icon="IconArrowUndoUp"
          label="Desfazer último desenho"
          onClick={onUndo}
        />
      </div>
      {menu ? <MoreMenu actions={more} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}
