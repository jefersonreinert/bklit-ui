"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ConfirmButton,
  type MtOutput,
  Notice,
  OutputView,
  RecordView,
  useMtCall,
} from "./mt-shared";

/**
 * Order tickets. A market order with SL/TP follows the skill's two-step
 * workflow: place_market_order, then modify_position on the new position.
 */

type Side = "BUY" | "SELL";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </span>
  );
}

function SidePicker({
  side,
  onSide,
}: {
  side: Side;
  onSide: (s: Side) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {(["BUY", "SELL"] as const).map((s) => (
        <button
          className={cn(
            "h-9 rounded-lg border font-semibold text-sm",
            side === s &&
              (s === "BUY"
                ? "border-success bg-success/15 text-success"
                : "border-destructive bg-destructive/10 text-destructive")
          )}
          key={s}
          onClick={() => onSide(s)}
          type="button"
        >
          {s === "BUY" ? "Comprar (BUY)" : "Vender (SELL)"}
        </button>
      ))}
    </div>
  );
}

/** Position id from a TradeResult (data.order or data.deal). */
function positionId(out: MtOutput): unknown {
  const data = (out.value as { data?: Record<string, unknown> } | null)?.data;
  return data?.order ?? data?.deal ?? data?.position ?? null;
}

function Quote({ symbol }: { symbol: string }) {
  const { run, busy } = useMtCall();
  const [price, setPrice] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={busy || !symbol}
        onClick={async () => {
          const out = await run("get_symbol_price", { symbol_name: symbol });
          setPrice(out.ok ? (out.value as Record<string, unknown>) : null);
        }}
        size="sm"
        variant="ghost"
      >
        {busy ? "A consultar…" : "Ver preço atual"}
      </Button>
      {price ? <RecordView value={price} /> : null}
    </div>
  );
}

function MarketTicket() {
  const { run, busy } = useMtCall();
  const [symbol, setSymbol] = useState("EURUSD");
  const [volume, setVolume] = useState("0.01");
  const [side, setSide] = useState<Side>("BUY");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [results, setResults] = useState<MtOutput[]>([]);

  const submit = async () => {
    const placed = await run("place_market_order", {
      symbol,
      volume,
      type: side,
    });
    const out = [placed];
    const id = positionId(placed);
    if (placed.ok && (sl || tp) && id != null) {
      out.push(
        await run("modify_position", { id, stop_loss: sl, take_profit: tp })
      );
    }
    setResults(out);
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-semibold">Ordem a mercado</h3>
      <SidePicker onSide={setSide} side={side} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Símbolo">
          <Input
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            value={symbol}
          />
        </Field>
        <Field label="Volume (lotes)">
          <Input
            inputMode="decimal"
            onChange={(e) => setVolume(e.target.value)}
            value={volume}
          />
        </Field>
        <Field label="Stop loss (opcional)">
          <Input
            inputMode="decimal"
            onChange={(e) => setSl(e.target.value)}
            value={sl}
          />
        </Field>
        <Field label="Take profit (opcional)">
          <Input
            inputMode="decimal"
            onChange={(e) => setTp(e.target.value)}
            value={tp}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-xs">
        Com SL/TP, a ordem é executada e depois a posição é modificada
        (place_market_order → modify_position).
      </p>
      <Quote symbol={symbol} />
      <ConfirmButton
        confirm={`Confirmar ${side} ${volume} ${symbol}`}
        disabled={busy || !(symbol && Number(volume.replace(",", ".")) > 0)}
        label={busy ? "A enviar…" : `${side} ${volume} ${symbol}`}
        onConfirm={submit}
        size="default"
        variant="default"
      />
      {results.map((r, i) => (
        <OutputView key={i} out={r} />
      ))}
    </section>
  );
}

function PendingTicket() {
  const { run, busy } = useMtCall();
  const [symbol, setSymbol] = useState("EURUSD");
  const [volume, setVolume] = useState("0.01");
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [result, setResult] = useState<MtOutput | null>(null);
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-semibold">Ordem pendente</h3>
      <SidePicker onSide={setSide} side={side} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="Símbolo">
          <Input
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            value={symbol}
          />
        </Field>
        <Field label="Volume (lotes)">
          <Input
            inputMode="decimal"
            onChange={(e) => setVolume(e.target.value)}
            value={volume}
          />
        </Field>
        <Field label="Preço">
          <Input
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            value={price}
          />
        </Field>
        <Field label="Stop loss">
          <Input
            inputMode="decimal"
            onChange={(e) => setSl(e.target.value)}
            value={sl}
          />
        </Field>
        <Field label="Take profit">
          <Input
            inputMode="decimal"
            onChange={(e) => setTp(e.target.value)}
            value={tp}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-xs">
        O servidor escolhe LIMIT ou STOP pelo preço atual.
      </p>
      <ConfirmButton
        confirm={`Confirmar ${side} ${volume} ${symbol} @ ${price}`}
        disabled={
          busy || !(symbol && price && Number(volume.replace(",", ".")) > 0)
        }
        label={busy ? "A enviar…" : "Colocar ordem pendente"}
        onConfirm={async () =>
          setResult(
            await run("place_pending_order", {
              symbol,
              volume,
              type: side,
              price,
              stop_loss: sl,
              take_profit: tp,
            })
          )
        }
        size="default"
        variant="default"
      />
      {result ? <OutputView out={result} /> : null}
    </section>
  );
}

export function MtTrade({ canTrade }: { canTrade: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {canTrade ? (
        <Notice>
          As ordens vão para a conta MT5 real ligada ao servidor. Cada envio
          pede um segundo toque para confirmar.
        </Notice>
      ) : (
        <Notice tone="error">
          Negociação desligada. Ligue "Permitir ordens pelo painel" em
          Conectores → MetaTrader para enviar ordens.
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <MarketTicket />
        <PendingTicket />
      </div>
    </div>
  );
}
