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
import {
  addToWatchlist,
  autoDigits,
  formatPx,
  labelOf,
  moveInWatchlist,
  type Quote,
  removeFromWatchlist,
  useSymbolSearch,
  type WatchItem,
} from "@/lib/markets/trading";
import { cn } from "@/lib/utils";

export function changeClass(v: number | undefined) {
  if (!v) {
    return "text-muted-foreground";
  }
  return v > 0 ? "text-[var(--up)]" : "text-[var(--down)]";
}

export const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** Symbols with price and day change; tap to open the chart. */
export function Watchlist({
  items,
  quotes,
  active,
  onPick,
  onSearch,
  inSheet,
}: {
  inSheet?: boolean;
  items: WatchItem[];
  quotes: Record<string, Quote>;
  active: string;
  onPick: (symbol: string) => void;
  onSearch: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn("flex items-center gap-1 px-3 py-2", inSheet && "pr-12")}
      >
        <p className="flex-1 font-semibold text-sm">Lista</p>
        <button
          aria-label="Adicionar ativo"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onSearch}
          type="button"
        >
          <Icon className="size-4" name="IconPlusMedium" />
        </button>
        <button
          className={cn(
            "h-8 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground",
            editing && "bg-muted text-foreground"
          )}
          onClick={() => setEditing((e) => !e)}
          type="button"
        >
          {editing ? "OK" : "Editar"}
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-y px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <span>Ativo</span>
        <span className="text-right">Preço</span>
        <span className="w-14 text-right">Var.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((w, i) => (
          <WatchRow
            active={w.symbol === active}
            editing={editing}
            first={i === 0}
            item={w}
            key={w.symbol}
            last={i === items.length - 1}
            onPick={onPick}
            quote={quotes[w.symbol]}
          />
        ))}
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-muted-foreground text-sm">
            Lista vazia. Toque em + para adicionar ativos.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WatchRow({
  item,
  quote,
  active,
  editing,
  first,
  last,
  onPick,
}: {
  item: WatchItem;
  quote: Quote | undefined;
  active: boolean;
  editing: boolean;
  first: boolean;
  last: boolean;
  onPick: (symbol: string) => void;
}) {
  const digits = quote ? autoDigits(item.symbol, quote.price, quote.digits) : 2;
  return (
    <div
      className={cn(
        "flex items-center gap-1 border-border/50 border-b pr-1",
        active && "bg-[#2962ff]/8"
      )}
    >
      <button
        className="grid min-w-0 flex-1 grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2 pl-3 text-left"
        onClick={() => onPick(item.symbol)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-[13px]">
            {item.label}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {item.name}
          </span>
        </span>
        <span className="text-right font-mono text-[13px] tabular-nums">
          {quote ? formatPx(quote.price, digits) : "—"}
        </span>
        <span
          className={cn(
            "w-14 text-right font-mono text-[12px] tabular-nums",
            changeClass(quote?.changePct)
          )}
        >
          {quote ? pct(quote.changePct) : ""}
        </span>
      </button>
      {editing ? (
        <div className="flex shrink-0 items-center">
          <button
            aria-label="Subir"
            className="flex size-7 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
            disabled={first}
            onClick={() => moveInWatchlist(item.symbol, -1)}
            type="button"
          >
            <Icon className="size-3.5 rotate-90" name="IconChevronLeft" />
          </button>
          <button
            aria-label="Descer"
            className="flex size-7 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
            disabled={last}
            onClick={() => moveInWatchlist(item.symbol, 1)}
            type="button"
          >
            <Icon className="size-3.5 -rotate-90" name="IconChevronLeft" />
          </button>
          <button
            aria-label={`Remover ${item.label}`}
            className="flex size-7 items-center justify-center rounded text-destructive"
            onClick={() => removeFromWatchlist(item.symbol)}
            type="button"
          >
            <Icon className="size-3.5" name="IconTrashCan" />
          </button>
        </div>
      ) : null}
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
              className="flex items-center gap-2 border-border/50 border-b px-4"
              key={r.symbol}
            >
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
                  addToWatchlist({
                    symbol: r.symbol,
                    label: labelOf(r.symbol),
                    name: r.name,
                  })
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
