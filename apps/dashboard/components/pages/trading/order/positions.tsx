"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { roundVolume, type SymbolSpec } from "@/lib/journal/lot";
import { cn } from "@/lib/utils";
import { money, tone } from "../journal/journal-summary";
import type { Session } from "./order-ticket";
import {
  ConfirmButton,
  errorText,
  lotText,
  NumberField,
  priceText,
  useLinked,
} from "./trade-kit";

/**
 * Open positions and pending orders of the account, live from the EA:
 * close all or part, breakeven, move SL/TP, cancel, and the state of the
 * automatic partials the EA is watching.
 */

type Position = Session["positions"][number];

const CLOSE_PCTS = [25, 50, 75];

function useAction() {
  const linked = useLinked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  // Busy also while the EA is not on the fast sync yet
  return { busy: busy || !linked, error, run };
}

function EditStops({
  account,
  ticket,
  sl,
  tp,
  onDone,
}: {
  account: string;
  ticket: string;
  sl: number;
  tp: number;
  onDone: () => void;
}) {
  const modify = useMutation(api.eatrade.modify);
  const [nsl, setSl] = useState(sl);
  const [ntp, setTp] = useState(tp);
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Stop loss" onChange={setSl} value={nsl} />
        <NumberField
          label="Take profit (0 = sem)"
          onChange={setTp}
          value={ntp}
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await modify({ account, ticket, sl: nsl, tp: ntp });
              onDone();
            })
          }
          size="sm"
        >
          Guardar
        </Button>
        <Button onClick={onDone} size="sm" variant="outline">
          Cancelar
        </Button>
      </div>
      {error ? <p className="text-[var(--down)] text-xs">{error}</p> : null}
    </div>
  );
}

function PositionRow({
  session,
  p,
  spec,
}: {
  session: Session;
  p: Position;
  spec: SymbolSpec | undefined;
}) {
  const close = useMutation(api.eatrade.closePosition);
  const modify = useMutation(api.eatrade.modify);
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const account = session.account;
  const digits = spec?.digits ?? 5;
  const pnl = p.profit + p.swap;
  const plan = session.plans.find((x) => x.ticket === p.ticket);
  const atBreakeven = p.sl > 0 && Math.abs(p.sl - p.priceOpen) < 1e-9;
  const partialOf = (pct: number) =>
    spec ? roundVolume((p.volume * pct) / 100, spec) : 0;

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">
            <span
              className={
                p.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"
              }
            >
              {p.side === "buy" ? "Compra" : "Venda"}
            </span>{" "}
            {lotText(p.volume)} {p.symbol}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {priceText(p.priceOpen, digits)} →{" "}
            {priceText(p.priceCurrent, digits)}
            {" · "}SL {priceText(p.sl, digits)} · TP {priceText(p.tp, digits)}
            {" · "}#{p.ticket}
          </p>
        </div>
        <p className={cn("shrink-0 font-semibold tabular-nums", tone(pnl))}>
          {money(pnl, true)}
        </p>
      </div>

      {plan ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
          {plan.levels.map((l, i) => (
            <li
              className={l.done ? "text-[var(--up)]" : "text-muted-foreground"}
              key={l.price}
            >
              {l.done ? "✓" : "○"} Parcial {i + 1}: {lotText(l.volume)} a{" "}
              {priceText(l.price, digits)}
            </li>
          ))}
          {plan.breakeven ? (
            <li className="text-muted-foreground">stop → entrada após a 1.ª</li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <ConfirmButton
          armedLabel="Confirmar fecho"
          disabled={busy}
          onConfirm={() => run(() => close({ account, ticket: p.ticket }))}
          size="xs"
        >
          Fechar
        </ConfirmButton>
        {CLOSE_PCTS.map((pct) => {
          const volume = partialOf(pct);
          if (volume <= 0 || volume >= p.volume) {
            return null;
          }
          return (
            <ConfirmButton
              armedLabel={`Fechar ${lotText(volume)}?`}
              disabled={busy}
              key={pct}
              onConfirm={() =>
                run(() => close({ account, ticket: p.ticket, volume }))
              }
              size="xs"
            >
              {pct}%
            </ConfirmButton>
          );
        })}
        <Button
          disabled={busy || atBreakeven}
          onClick={() =>
            run(() =>
              modify({ account, ticket: p.ticket, sl: p.priceOpen, tp: p.tp })
            )
          }
          size="xs"
          variant="outline"
        >
          Breakeven
        </Button>
        <Button
          onClick={() => setEditing((x) => !x)}
          size="xs"
          variant="outline"
        >
          SL/TP
        </Button>
      </div>
      {editing ? (
        <EditStops
          account={account}
          onDone={() => setEditing(false)}
          sl={p.sl}
          ticket={p.ticket}
          tp={p.tp}
        />
      ) : null}
      {error ? <p className="text-[var(--down)] text-xs">{error}</p> : null}
    </li>
  );
}

function OrderRow({
  session,
  o,
  digits,
}: {
  session: Session;
  o: Session["orders"][number];
  digits: number;
}) {
  const cancel = useMutation(api.eatrade.cancelOrder);
  const { busy, error, run } = useAction();
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          {o.side === "buy" ? "Compra" : "Venda"} {o.type} {lotText(o.volume)}{" "}
          {o.symbol}{" "}
          <span className="text-muted-foreground text-xs tabular-nums">
            a {priceText(o.price, digits)} · SL {priceText(o.sl, digits)} · TP{" "}
            {priceText(o.tp, digits)}
          </span>
        </p>
        <ConfirmButton
          armedLabel="Cancelar ordem?"
          disabled={busy}
          onConfirm={() =>
            run(() => cancel({ account: session.account, ticket: o.ticket }))
          }
          size="xs"
        >
          Cancelar
        </ConfirmButton>
      </div>
      {error ? <p className="text-[var(--down)] text-xs">{error}</p> : null}
    </li>
  );
}

export function Positions({
  session,
  specs,
}: {
  session: Session;
  specs: SymbolSpec[];
}) {
  const specOf = (s: string) => specs.find((x) => x.symbol === s);
  if (session.positions.length === 0 && session.orders.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
        Sem posições abertas nem ordens pendentes.
      </p>
    );
  }
  const floating = session.positions.reduce((a, p) => a + p.profit + p.swap, 0);
  return (
    <div className="flex flex-col gap-2">
      {session.positions.length ? (
        <p className="text-sm">
          Resultado aberto{" "}
          <span className={cn("font-semibold tabular-nums", tone(floating))}>
            {money(floating, true)} {session.info.currency}
          </span>
        </p>
      ) : null}
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {session.positions.map((p) => (
          <PositionRow
            key={p.ticket}
            p={p}
            session={session}
            spec={specOf(p.symbol)}
          />
        ))}
        {session.orders.map((o) => (
          <OrderRow
            digits={specOf(o.symbol)?.digits ?? 5}
            key={o.ticket}
            o={o}
            session={session}
          />
        ))}
      </ul>
    </div>
  );
}
