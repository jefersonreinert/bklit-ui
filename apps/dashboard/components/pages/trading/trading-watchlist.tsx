"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import { groupBySection, splitPips } from "@/lib/markets/sections";
import {
  addSection,
  addToWatchlist,
  autoDigits,
  formatPx,
  labelOf,
  moveInWatchlist,
  moveSection,
  type Quote,
  removeFromWatchlist,
  removeSection,
  renameSection,
  resetWatchlist,
  setItemSection,
  toggleFlag,
  useSymbolSearch,
  type WatchItem,
} from "@/lib/markets/trading";
import { cn } from "@/lib/utils";
import { SymbolIcon } from "./symbol-icon";

export function changeClass(v: number | undefined) {
  if (!v) {
    return "text-muted-foreground";
  }
  return v > 0 ? "text-[var(--up)]" : "text-[var(--down)]";
}

function sign(v: number) {
  if (v > 0) {
    return "+";
  }
  return v < 0 ? "−" : "";
}

export const pct = (v: number) => `${sign(v)}${Math.abs(v).toFixed(2)}%`;

/** "+0.118", "−25" (with a real minus sign). */
export const signed = (v: number, digits: number) =>
  `${sign(v)}${formatPx(Math.abs(v), digits)}`;

/** Price with the fractional pip drawn small, like TradingView. */
export function PriceText({
  value,
  digits,
  symbol,
  className,
}: {
  value: number;
  digits: number;
  /** Fractional pips only for forex pairs. */
  symbol: string;
  className?: string;
}) {
  const text = formatPx(value, digits);
  const { main, pip } = symbol.endsWith("=X")
    ? splitPips(text, digits)
    : { main: text, pip: "" };
  return (
    <span className={cn("tabular-nums", className)}>
      {main}
      {pip ? <sup className="ml-px text-[0.6em]">{pip}</sup> : null}
    </span>
  );
}

const MAX_CHANGE_DIGITS = 5;

function Row({
  item,
  quote,
  active,
  compact,
  onPick,
}: {
  item: WatchItem;
  quote: Quote | undefined;
  active: boolean;
  compact: boolean;
  onPick: (symbol: string) => void;
}) {
  const digits = quote ? autoDigits(item.symbol, quote.price, quote.digits) : 2;
  return (
    <button
      className={cn(
        "relative flex w-full items-center gap-3 border-border/60 border-b text-left transition-colors hover:bg-muted/50",
        compact ? "px-3 py-2" : "px-4 py-3",
        active && "bg-[#2962ff]/8"
      )}
      onClick={() => onPick(item.symbol)}
      type="button"
    >
      {item.flag ? (
        <span className="absolute top-1/2 left-0 h-5 w-1.5 -translate-y-1/2 bg-[#e0484f] [clip-path:polygon(0_0,100%_0,60%_50%,100%_100%,0_100%)]">
          <span className="sr-only">Marcado</span>
        </span>
      ) : null}
      <SymbolIcon
        className={compact ? "size-7" : "size-11"}
        label={item.label}
        symbol={item.symbol}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-semibold",
            compact ? "text-[13px]" : "text-[17px]"
          )}
        >
          {item.label}
        </span>
        <span
          className={cn(
            "block truncate text-muted-foreground",
            compact ? "text-[11px]" : "text-[14px]"
          )}
        >
          {item.name}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={cn(
            "block font-medium",
            compact ? "text-[13px]" : "text-[17px]"
          )}
        >
          {quote ? (
            <PriceText
              digits={digits}
              symbol={item.symbol}
              value={quote.price}
            />
          ) : (
            "—"
          )}
        </span>
        <span
          className={cn(
            "block tabular-nums",
            compact ? "text-[11px]" : "text-[14px]",
            changeClass(quote?.changePct)
          )}
        >
          {quote
            ? `${compact ? "" : `${signed(quote.change, Math.min(digits, MAX_CHANGE_DIGITS))} `}${pct(quote.changePct)}`
            : ""}
        </span>
      </span>
    </button>
  );
}

function EditRow({
  item,
  sections,
  first,
  last,
}: {
  item: WatchItem;
  sections: string[];
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-border/60 border-b px-3 py-2">
      <SymbolIcon className="size-7" label={item.label} symbol={item.symbol} />
      <span className="min-w-0 flex-1 truncate font-medium text-sm">
        {item.label}
      </span>
      <select
        aria-label={`Secção de ${item.label}`}
        className="h-8 max-w-28 rounded-md border bg-background px-1 text-xs"
        onChange={(e) => setItemSection(item.symbol, e.target.value)}
        value={item.section}
      >
        {sections.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        aria-label={item.flag ? "Desmarcar" : "Marcar"}
        aria-pressed={Boolean(item.flag)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md",
          item.flag ? "text-[#e0484f]" : "text-muted-foreground"
        )}
        onClick={() => toggleFlag(item.symbol)}
        type="button"
      >
        <Icon className="size-4" name="IconFlag1" />
      </button>
      <button
        aria-label="Subir"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground disabled:opacity-30"
        disabled={first}
        onClick={() => moveInWatchlist(item.symbol, -1)}
        type="button"
      >
        <Icon className="size-3.5 rotate-90" name="IconChevronLeft" />
      </button>
      <button
        aria-label="Descer"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground disabled:opacity-30"
        disabled={last}
        onClick={() => moveInWatchlist(item.symbol, 1)}
        type="button"
      >
        <Icon className="size-3.5 -rotate-90" name="IconChevronLeft" />
      </button>
      <button
        aria-label={`Remover ${item.label}`}
        className="flex size-8 items-center justify-center rounded-md text-destructive"
        onClick={() => removeFromWatchlist(item.symbol)}
        type="button"
      >
        <Icon className="size-4" name="IconTrashCan" />
      </button>
    </div>
  );
}

function SectionHeader({
  name,
  count,
  collapsed,
  editing,
  first,
  last,
  compact,
  onToggle,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  editing: boolean;
  first: boolean;
  last: boolean;
  compact: boolean;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (editing) {
    return (
      <div className="flex items-center gap-1 bg-muted/40 px-3 py-1.5">
        {draft === null ? (
          <button
            className="min-w-0 flex-1 truncate text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide"
            onClick={() => setDraft(name)}
            title="Renomear"
            type="button"
          >
            {name} · {count}
          </button>
        ) : (
          <form
            className="flex flex-1 gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              renameSection(name, draft);
              setDraft(null);
            }}
          >
            <Input
              aria-label="Nome da secção"
              autoFocus
              className="h-7 text-xs"
              onBlur={() => setDraft(null)}
              onChange={(e) => setDraft(e.target.value)}
              value={draft}
            />
          </form>
        )}
        <button
          aria-label="Subir secção"
          className="flex size-7 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
          disabled={first}
          onClick={() => moveSection(name, -1)}
          type="button"
        >
          <Icon className="size-3.5 rotate-90" name="IconChevronLeft" />
        </button>
        <button
          aria-label="Descer secção"
          className="flex size-7 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
          disabled={last}
          onClick={() => moveSection(name, 1)}
          type="button"
        >
          <Icon className="size-3.5 -rotate-90" name="IconChevronLeft" />
        </button>
        <button
          aria-label={`Apagar secção ${name}`}
          className="flex size-7 items-center justify-center rounded text-destructive"
          onClick={() => removeSection(name)}
          type="button"
        >
          <Icon className="size-3.5" name="IconTrashCan" />
        </button>
      </div>
    );
  }
  return (
    <button
      aria-expanded={!collapsed}
      className={cn(
        "flex w-full items-center gap-1 text-left font-semibold text-muted-foreground uppercase tracking-wide",
        compact ? "px-3 pt-3 pb-1 text-[10px]" : "px-4 pt-5 pb-2 text-[13px]"
      )}
      onClick={onToggle}
      type="button"
    >
      <Icon
        className={cn(
          "size-3 transition-transform",
          collapsed ? "-rotate-90" : ""
        )}
        name="IconChevronDownSmall"
      />
      {name}
    </button>
  );
}

function NewSection() {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        addSection(name);
        setName("");
      }}
    >
      <Input
        aria-label="Nova secção"
        className="h-8 text-sm"
        onChange={(e) => setName(e.target.value)}
        placeholder="Nova secção (ex.: Swing, Favoritos)"
        value={name}
      />
      <button
        className="h-8 shrink-0 rounded-md bg-muted px-3 text-sm disabled:opacity-40"
        disabled={!name.trim()}
        type="submit"
      >
        Criar
      </button>
    </form>
  );
}

/** Symbols grouped in sections, with price and day change. */
export function Watchlist({
  items,
  sections,
  quotes,
  active,
  onPick,
  onSearch,
  inSheet,
  compact = false,
}: {
  inSheet?: boolean;
  compact?: boolean;
  items: WatchItem[];
  sections: string[];
  quotes: Record<string, Quote>;
  active: string;
  onPick: (symbol: string) => void;
  onSearch: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [askReset, setAskReset] = useState(false);
  const groups = groupBySection(items, sections).filter(
    (g) => editing || g.items.length > 0
  );
  const toggle = (name: string) => {
    const next = new Set(collapsed);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setCollapsed(next);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex items-center gap-1 border-b px-3 py-2",
          inSheet && "pr-12"
        )}
      >
        <p
          className={cn(
            "flex-1 font-semibold",
            compact ? "text-sm" : "text-lg"
          )}
        >
          Watchlist
        </p>
        <button
          aria-label="Adicionar ativo"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onSearch}
          type="button"
        >
          <Icon className="size-5" name="IconPlusMedium" />
        </button>
        <button
          className={cn(
            "h-8 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground",
            editing && "bg-muted text-foreground"
          )}
          onClick={() => {
            setEditing((e) => !e);
            setAskReset(false);
          }}
          type="button"
        >
          {editing ? "OK" : "Editar"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((g, gi) => (
          <section key={g.name}>
            <SectionHeader
              collapsed={collapsed.has(g.name)}
              compact={compact}
              count={g.items.length}
              editing={editing}
              first={gi === 0}
              last={gi === groups.length - 1}
              name={g.name}
              onToggle={() => toggle(g.name)}
            />
            {editing
              ? g.items.map((w, i) => (
                  <EditRow
                    first={i === 0}
                    item={w}
                    key={w.symbol}
                    last={i === g.items.length - 1}
                    sections={sections}
                  />
                ))
              : null}
            {editing || collapsed.has(g.name)
              ? null
              : g.items.map((w) => (
                  <Row
                    active={w.symbol === active}
                    compact={compact}
                    item={w}
                    key={w.symbol}
                    onPick={onPick}
                    quote={quotes[w.symbol]}
                  />
                ))}
          </section>
        ))}
        {items.length === 0 && !editing ? (
          <p className="px-3 py-8 text-center text-muted-foreground text-sm">
            Lista vazia. Toque em + para adicionar ativos.
          </p>
        ) : null}
        {editing ? (
          <>
            <NewSection />
            <div className="px-3 pb-4">
              <button
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-xs",
                  askReset
                    ? "border-destructive text-destructive"
                    : "text-muted-foreground"
                )}
                onClick={() => {
                  if (askReset) {
                    resetWatchlist();
                    setAskReset(false);
                  } else {
                    setAskReset(true);
                  }
                }}
                type="button"
              >
                {askReset
                  ? "Toque de novo: substituir pela lista padrão"
                  : "Restaurar lista padrão (Índices, Forex, Commodities, Juros, Cripto, Ações)"}
              </button>
            </div>
          </>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 py-5 font-medium text-[15px]"
            onClick={onSearch}
            type="button"
          >
            <Icon className="size-5" name="IconPlusMedium" />
            Adicionar ativo
          </button>
        )}
      </div>
    </div>
  );
}

const QUICK = [
  { q: "EURUSD=X", label: "Forex" },
  { q: "GC=F", label: "Ouro" },
  { q: "^NDX", label: "Nasdaq" },
  { q: "BTC-USD", label: "Bitcoin" },
  { q: "PETR4.SA", label: "Petrobras" },
  { q: "SOL-USD", label: "Solana" },
];

/** Find any Yahoo Finance symbol: open it, or add it to the list. */
export function SymbolSearch({
  open,
  onClose,
  onPick,
  watchlist,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  watchlist: WatchItem[];
}) {
  const [q, setQ] = useState("");
  const { results, loading } = useSymbolSearch(q);
  const inList = new Set(watchlist.map((w) => w.symbol));
  const pick = (symbol: string) => {
    onPick(symbol);
    setQ("");
    onClose();
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="h-[85dvh] gap-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>Buscar ativo</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-2">
          <Input
            aria-label="Buscar ativo"
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="EURUSD, ouro, Apple, PETR4, BTC…"
            value={q}
          />
        </div>
        {q ? null : (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {QUICK.map((s) => (
              <button
                className="rounded-full bg-muted px-3 py-1 text-xs"
                key={s.q}
                onClick={() => setQ(s.label)}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto border-t">
          {loading && results.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : null}
          {results.map((r) => (
            <div
              className="flex items-center gap-3 border-border/50 border-b px-4"
              key={r.symbol}
            >
              <SymbolIcon
                className="size-8"
                label={labelOf(r.symbol)}
                symbol={r.symbol}
              />
              <button
                className="min-w-0 flex-1 py-2.5 text-left"
                onClick={() => pick(r.symbol)}
                type="button"
              >
                <span className="block font-medium text-sm">
                  {labelOf(r.symbol)}
                  <span className="ml-2 font-normal text-[11px] text-muted-foreground">
                    {r.symbol}
                  </span>
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {r.name} · {r.type} · {r.exchange}
                </span>
              </button>
              <button
                aria-label={
                  inList.has(r.symbol)
                    ? "Já está na lista"
                    : "Adicionar à lista"
                }
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted disabled:opacity-40"
                disabled={inList.has(r.symbol)}
                onClick={() =>
                  addToWatchlist(
                    {
                      symbol: r.symbol,
                      label: labelOf(r.symbol),
                      name: r.name,
                    },
                    r.type
                  )
                }
                type="button"
              >
                <Icon
                  className="size-4"
                  name={
                    inList.has(r.symbol) ? "IconCheckmark1" : "IconPlusMedium"
                  }
                />
              </button>
            </div>
          ))}
          {q && !loading && results.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Nada encontrado.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
