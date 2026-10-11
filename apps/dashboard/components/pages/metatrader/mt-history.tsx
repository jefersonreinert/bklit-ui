"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatSigned,
  pick,
  sumColumn,
  type Table,
  toTable,
} from "@/lib/metatrader/data";
import { cn } from "@/lib/utils";
import { DataTable, type MtOutput, OutputView, useMtCall } from "./mt-shared";

/** get_deals and get_orders with date range, symbol and totals. */

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function Totals({ table }: { table: Table }) {
  const cols = ["profit", "commission", "swap", "fee"].filter((c) =>
    table.columns.includes(c)
  );
  if (cols.length === 0 || table.rows.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {cols.map((c) => {
        const v = sumColumn(table, c);
        return (
          <span key={c}>
            <span className="text-muted-foreground">{c}: </span>
            <span
              className={cn(
                "tabular-nums",
                v > 0 && "text-success",
                v < 0 && "text-destructive"
              )}
            >
              {formatSigned(v)}
            </span>
          </span>
        );
      })}
      {pick(table, "profit") ? (
        <span className="font-semibold">
          Líquido:{" "}
          {formatSigned(cols.reduce((acc, c) => acc + sumColumn(table, c), 0))}
        </span>
      ) : null}
    </div>
  );
}

export function MtHistory() {
  const { run, busy } = useMtCall();
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * DAY_MS)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [symbol, setSymbol] = useState("");
  const [kind, setKind] = useState<"get_deals" | "get_orders">("get_deals");
  const [out, setOut] = useState<MtOutput | null>(null);
  const table = out?.ok ? toTable(out.value) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border p-0.5">
          {(
            [
              ["get_deals", "Negócios (deals)"],
              ["get_orders", "Ordens"],
            ] as const
          ).map(([k, label]) => (
            <button
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                kind === k && "bg-muted font-semibold"
              )}
              key={k}
              onClick={() => setKind(k)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
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
        <Input
          aria-label="Símbolo"
          className="w-32"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Símbolo"
          value={symbol}
        />
        <Button
          disabled={busy}
          onClick={async () =>
            setOut(await run(kind, { from_date: from, to_date: to, symbol }))
          }
          size="sm"
        >
          {busy ? "A carregar…" : "Ver histórico"}
        </Button>
      </div>
      {table ? (
        <>
          <p className="text-muted-foreground text-sm">
            {table.rows.length} registos de {from} a {to}
            {symbol ? ` · ${symbol}` : ""}
          </p>
          <Totals table={table} />
          <DataTable empty="Sem registos neste intervalo." table={table} />
        </>
      ) : null}
      {out && !table ? <OutputView out={out} /> : null}
    </div>
  );
}
