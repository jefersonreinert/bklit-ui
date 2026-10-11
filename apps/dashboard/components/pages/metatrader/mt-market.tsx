"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MT_TIMEFRAMES } from "@/lib/metatrader/catalog";
import { pick, type Table, toTable } from "@/lib/metatrader/data";
import { cn } from "@/lib/utils";
import {
  DataTable,
  type MtOutput,
  OutputView,
  RecordView,
  useMtCall,
} from "./mt-shared";

/**
 * Market data: get_symbol_price, get_candles_latest, get_candles_by_date,
 * get_symbol_info, get_all_symbols and get_symbols.
 */

const PRICE_REFRESH_MS = 2000;
const CHART_W = 640;
const CHART_H = 220;

function Candles({ table }: { table: Table }) {
  const o = pick(table, "open");
  const h = pick(table, "high");
  const l = pick(table, "low");
  const c = pick(table, "close");
  const bars = useMemo(() => {
    if (!(o && h && l && c)) {
      return [];
    }
    return table.rows
      .map((r) => ({
        o: Number(r[o]),
        h: Number(r[h]),
        l: Number(r[l]),
        c: Number(r[c]),
      }))
      .filter((b) => [b.o, b.h, b.l, b.c].every(Number.isFinite));
  }, [table, o, h, l, c]);
  if (bars.length < 2) {
    return null;
  }
  const lo = Math.min(...bars.map((b) => b.l));
  const hi = Math.max(...bars.map((b) => b.h));
  const y = (v: number) => CHART_H - ((v - lo) / (hi - lo || 1)) * CHART_H;
  const step = CHART_W / bars.length;
  const bw = Math.max(1, step * 0.6);
  return (
    <svg
      aria-label="Gráfico de velas"
      className="h-56 w-full rounded-xl border bg-muted/20"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
    >
      {bars.map((b, i) => {
        const x = i * step + step / 2;
        const up = b.c >= b.o;
        return (
          <g key={i}>
            <line stroke="#000" x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
            <rect
              fill={up ? "#EBDBBC" : "#D4A27F"}
              height={Math.max(1, Math.abs(y(b.o) - y(b.c)))}
              stroke="#000"
              strokeWidth={0.5}
              width={bw}
              x={x - bw / 2}
              y={Math.min(y(b.o), y(b.c))}
            />
          </g>
        );
      })}
    </svg>
  );
}

function PriceBox() {
  const { run } = useMtCall();
  const [symbol, setSymbol] = useState("EURUSD");
  const [live, setLive] = useState(false);
  const [out, setOut] = useState<MtOutput | null>(null);
  useEffect(() => {
    if (!live) {
      return;
    }
    let stop = false;
    const tick = async () => {
      const r = await run("get_symbol_price", { symbol_name: symbol });
      if (!stop) {
        setOut(r);
      }
    };
    tick();
    const t = setInterval(tick, PRICE_REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, symbol, run]);
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h3 className="font-semibold">Preço</h3>
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-36"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          value={symbol}
        />
        <Button
          onClick={async () =>
            setOut(await run("get_symbol_price", { symbol_name: symbol }))
          }
          size="sm"
          variant="outline"
        >
          Consultar
        </Button>
        <Button
          onClick={() => setLive((v) => !v)}
          size="sm"
          variant={live ? "secondary" : "ghost"}
        >
          {live ? "Ao vivo (parar)" : "Ao vivo"}
        </Button>
      </div>
      {out?.ok && out.value && typeof out.value === "object" ? (
        <Spread value={out.value as Record<string, unknown>} />
      ) : null}
      {out && !out.ok ? <OutputView out={out} /> : null}
    </section>
  );
}

function Spread({ value }: { value: Record<string, unknown> }) {
  const bid = Number(value.bid);
  const ask = Number(value.ask);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border p-2">
          <p className="text-muted-foreground text-xs">Bid</p>
          <p className="font-semibold tabular-nums">{String(value.bid)}</p>
        </div>
        <div className="rounded-xl border p-2">
          <p className="text-muted-foreground text-xs">Ask</p>
          <p className="font-semibold tabular-nums">{String(value.ask)}</p>
        </div>
        <div className="rounded-xl border p-2">
          <p className="text-muted-foreground text-xs">Spread</p>
          <p className="font-semibold tabular-nums">
            {Number.isFinite(ask - bid) ? (ask - bid).toPrecision(3) : "—"}
          </p>
        </div>
      </div>
      <RecordView value={value} />
    </div>
  );
}

function CandlesBox({ hasRest }: { hasRest: boolean }) {
  const { run, busy } = useMtCall();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<string>("H1");
  const [count, setCount] = useState("100");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [out, setOut] = useState<MtOutput | null>(null);
  const table = out?.ok ? toTable(out.value) : null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h3 className="font-semibold">Velas</h3>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label="Símbolo"
          className="w-32"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          value={symbol}
        />
        <select
          aria-label="Tempo gráfico"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          onChange={(e) => setTf(e.target.value)}
          value={tf}
        >
          {MT_TIMEFRAMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Input
          aria-label="Quantidade"
          className="w-20"
          inputMode="numeric"
          onChange={(e) => setCount(e.target.value)}
          value={count}
        />
        <Button
          disabled={busy}
          onClick={async () =>
            setOut(
              await run("get_candles_latest", {
                symbol_name: symbol,
                timeframe: tf,
                count,
              })
            )
          }
          size="sm"
          variant="outline"
        >
          Últimas
        </Button>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-end gap-2",
          !hasRest && "opacity-60"
        )}
      >
        <Input
          aria-label="De"
          className="w-40"
          onChange={(e) => setFrom(e.target.value)}
          type="date"
          value={from}
        />
        <Input
          aria-label="Até"
          className="w-40"
          onChange={(e) => setTo(e.target.value)}
          type="date"
          value={to}
        />
        <Button
          disabled={busy || !(from && to)}
          onClick={async () =>
            setOut(
              await run("get_candles_by_date", {
                symbol_name: symbol,
                timeframe: tf,
                from_date: from,
                to_date: to,
              })
            )
          }
          size="sm"
          variant="outline"
        >
          Por datas
        </Button>
        {hasRest ? null : (
          <span className="text-muted-foreground text-xs">
            Por datas precisa da API HTTP (Conectores → MetaTrader).
          </span>
        )}
      </div>
      {table ? (
        <>
          <Candles table={table} />
          <DataTable maxRows={20} table={table} />
          <p className="text-muted-foreground text-xs">
            {table.rows.length} velas · {symbol} {tf} (a tabela mostra as 20
            mais recentes)
          </p>
        </>
      ) : null}
      {out && !table ? <OutputView out={out} /> : null}
    </section>
  );
}

function SymbolsBox({ hasRest }: { hasRest: boolean }) {
  const { run, busy } = useMtCall();
  const [group, setGroup] = useState("");
  const [filter, setFilter] = useState("");
  const [symbols, setSymbols] = useState<string[] | null>(null);
  const [info, setInfo] = useState<MtOutput | null>(null);
  const [error, setError] = useState<MtOutput | null>(null);
  const shown = (symbols ?? []).filter((s) =>
    s.toLowerCase().includes(filter.toLowerCase())
  );
  const load = async (name: string, args: Record<string, unknown> = {}) => {
    const out = await run(name, args);
    if (out.ok && Array.isArray(out.value)) {
      setSymbols(out.value.map(String));
      setError(null);
    } else {
      setError(out);
    }
  };
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h3 className="font-semibold">Símbolos</h3>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => load("get_all_symbols")}
          size="sm"
          variant="outline"
        >
          Todos
        </Button>
        <Input
          className="w-32"
          onChange={(e) => setGroup(e.target.value)}
          placeholder="*USD*"
          value={group}
        />
        <Button
          disabled={busy || !group}
          onClick={() => load("get_symbols", { group })}
          size="sm"
          variant="outline"
        >
          Filtrar no servidor
        </Button>
      </div>
      {error ? <OutputView out={error} /> : null}
      {symbols ? (
        <>
          <Input
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Procurar em ${symbols.length} símbolos`}
            value={filter}
          />
          <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
            {shown.slice(0, 400).map((s) => (
              <button
                className="rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                disabled={!hasRest}
                key={s}
                onClick={async () =>
                  setInfo(await run("get_symbol_info", { symbol_name: s }))
                }
                title={hasRest ? "Ver detalhes" : s}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {info ? <OutputView out={info} /> : null}
    </section>
  );
}

export function MtMarket({ hasRest }: { hasRest: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PriceBox />
      <SymbolsBox hasRest={hasRest} />
      <div className="lg:col-span-2">
        <CandlesBox hasRest={hasRest} />
      </div>
    </div>
  );
}
