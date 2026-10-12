"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type OrderType,
  type PartialLevel,
  pipSize,
  roundPrice,
  type Side,
  type SymbolSpec,
} from "@/lib/journal/lot";
import {
  computeTicket,
  type Ticket,
  type TicketPrefs,
} from "@/lib/journal/ticket";
import { cn } from "@/lib/utils";
import { money } from "../journal/journal-summary";
import {
  Chips,
  ConfirmButton,
  errorText,
  lotText,
  NumberField,
  priceText,
  StatusText,
  useLinked,
  useLocal,
} from "./trade-kit";

/**
 * Order ticket: pick the symbol, the side and the risk in % of the balance;
 * the lot comes from the stop distance with the terminal's live tick value
 * (spread included), and the order goes to MT5 through the EA. Partial
 * take profits close part of the initial lot at R multiples; the EA can
 * move the stop to breakeven after the first one.
 */

export type Session = NonNullable<
  FunctionReturnType<typeof api.eatrade.session>
>;
type LiveQuote = Session["quotes"][number];

const RISKS = [0.25, 0.5, 1, 1.5, 2];
const RRS = [1, 1.5, 2, 3, 4];
const TYPE_LABEL: Record<OrderType, string> = {
  market: "Mercado",
  limit: "Limit",
  stop: "Stop",
};
const TP_LABEL = { rr: "R:R", price: "Preço", none: "Sem" } as const;

const DEFAULTS: TicketPrefs = {
  riskPct: 1,
  slMode: "pips",
  slPips: 20,
  tpMode: "rr",
  rr: 2,
  commission: 0,
  partialsOn: false,
  levels: [{ r: 1, pct: 50 }],
  breakeven: true,
};

type SetPrefs = (p: Partial<TicketPrefs>) => void;

function QuoteHeader({
  symbol,
  symbols,
  onSymbol,
  quote,
  spec,
}: {
  symbol: string;
  symbols: string[];
  onSymbol: (s: string) => void;
  quote: LiveQuote | undefined;
  spec: SymbolSpec | undefined;
}) {
  const digits = spec?.digits ?? 5;
  const spreadPips =
    spec && quote ? (quote.ask - quote.bid) / pipSize(spec) : 0;
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Ativo</span>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          onChange={(e) => onSymbol(e.target.value)}
          value={symbol}
        >
          {[...new Set([symbol, ...symbols])].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className="text-right text-xs tabular-nums">
        {quote ? (
          <>
            <p>
              <span className="text-[var(--down)]">
                {priceText(quote.bid, digits)}
              </span>{" "}
              /{" "}
              <span className="text-[var(--up)]">
                {priceText(quote.ask, digits)}
              </span>
            </p>
            <p className="text-muted-foreground">
              spread {spreadPips.toFixed(1)} pips ({quote.spread} pts)
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">À espera da cotação…</p>
        )}
      </div>
    </div>
  );
}

function SideToggle({
  side,
  onSide,
}: {
  side: Side;
  onSide: (s: Side) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["buy", "sell"] as const).map((s) => {
        const on = side === s;
        return (
          <button
            aria-pressed={on}
            className={cn(
              "rounded-md border py-2 font-semibold text-sm",
              on &&
                s === "buy" &&
                "border-[var(--up)] bg-[var(--up)] text-background",
              on &&
                s === "sell" &&
                "border-[var(--down)] bg-[var(--down)] text-background"
            )}
            key={s}
            onClick={() => onSide(s)}
            type="button"
          >
            {s === "buy" ? "Compra" : "Venda"}
          </button>
        );
      })}
    </div>
  );
}

function RiskPicker({
  prefs,
  set,
  balance,
  currency,
}: {
  prefs: TicketPrefs;
  set: SetPrefs;
  balance: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        Risco por operação (% do saldo {money(balance)} {currency})
      </span>
      <div className="flex flex-wrap items-end gap-2">
        <Chips
          format={(r) => `${r}%`}
          label="Risco"
          onChange={(riskPct) => set({ riskPct })}
          options={RISKS}
          value={prefs.riskPct}
        />
        <NumberField
          className="w-24"
          label="Outro"
          onChange={(riskPct) => set({ riskPct })}
          step={0.05}
          suffix="%"
          value={prefs.riskPct}
        />
      </div>
    </div>
  );
}

function StopPicker({
  prefs,
  set,
  slPrice,
  onSlPrice,
}: {
  prefs: TicketPrefs;
  set: SetPrefs;
  slPrice: number;
  onSlPrice: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Stop loss</span>
        <Chips
          format={(m) => (m === "pips" ? "Pips" : "Preço")}
          label="Stop em"
          onChange={(slMode) => set({ slMode })}
          options={["pips", "price"] as TicketPrefs["slMode"][]}
          value={prefs.slMode}
        />
      </div>
      {prefs.slMode === "pips" ? (
        <NumberField
          label="Distância"
          onChange={(slPips) => set({ slPips })}
          step={1}
          suffix="pips"
          value={prefs.slPips}
        />
      ) : (
        <NumberField
          label="Preço do stop"
          onChange={onSlPrice}
          value={slPrice}
        />
      )}
    </div>
  );
}

function TargetPicker({
  prefs,
  set,
  tpPrice,
  onTpPrice,
}: {
  prefs: TicketPrefs;
  set: SetPrefs;
  tpPrice: number;
  onTpPrice: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Take profit</span>
        <Chips
          format={(m) => TP_LABEL[m]}
          label="Take profit em"
          onChange={(tpMode) => set({ tpMode })}
          options={["rr", "price", "none"] as TicketPrefs["tpMode"][]}
          value={prefs.tpMode}
        />
      </div>
      {prefs.tpMode === "rr" ? (
        <Chips
          format={(r) => `1:${r}`}
          label="Relação risco:retorno"
          onChange={(rr) => set({ rr })}
          options={RRS}
          value={prefs.rr}
        />
      ) : null}
      {prefs.tpMode === "price" ? (
        <NumberField
          label="Preço do alvo"
          onChange={onTpPrice}
          value={tpPrice}
        />
      ) : null}
    </div>
  );
}

function PartialsEditor({
  levels,
  onChange,
  breakeven,
  onBreakeven,
}: {
  levels: PartialLevel[];
  onChange: (l: PartialLevel[]) => void;
  breakeven: boolean;
  onBreakeven: (b: boolean) => void;
}) {
  const setLevel = (i: number, patch: Partial<PartialLevel>) =>
    onChange(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-2">
      {levels.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: levels are edited in place
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" key={i}>
          <NumberField
            label={`Parcial ${i + 1} em`}
            onChange={(r) => setLevel(i, { r })}
            step={0.5}
            suffix="R"
            value={l.r}
          />
          <NumberField
            label="Fechar"
            onChange={(pct) => setLevel(i, { pct })}
            step={5}
            suffix="% do lote"
            value={l.pct}
          />
          <Button
            aria-label={`Remover parcial ${i + 1}`}
            onClick={() => onChange(levels.filter((_, j) => j !== i))}
            size="sm"
            variant="outline"
          >
            ✕
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {levels.length < 4 ? (
          <Button
            onClick={() =>
              onChange([...levels, { r: (levels.at(-1)?.r ?? 0) + 1, pct: 25 }])
            }
            size="sm"
            variant="outline"
          >
            + Parcial
          </Button>
        ) : null}
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={breakeven}
            onChange={(e) => onBreakeven(e.target.checked)}
            type="checkbox"
          />
          Mover o stop para a entrada após a 1.ª parcial
        </label>
      </div>
    </div>
  );
}

function PartialsBox({ prefs, set }: { prefs: TicketPrefs; set: SetPrefs }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5">
      <label className="flex items-center gap-2 font-medium text-sm">
        <input
          checked={prefs.partialsOn}
          onChange={(e) => set({ partialsOn: e.target.checked })}
          type="checkbox"
        />
        Parciais automáticas (o EA fecha no preço)
      </label>
      {prefs.partialsOn ? (
        <PartialsEditor
          breakeven={prefs.breakeven}
          levels={prefs.levels}
          onBreakeven={(breakeven) => set({ breakeven })}
          onChange={(levels) => set({ levels })}
        />
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </>
  );
}

function Summary({
  t,
  digits,
  currency,
}: {
  t: Ticket;
  digits: number;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm tabular-nums">
      <span className="text-muted-foreground">Lote</span>
      <span className="text-right font-semibold text-base">
        {lotText(t.lot.lot)}
      </span>
      <Row label="Risco real">
        {money(t.lot.risk)} ({t.lot.riskPct.toFixed(2)}%)
      </Row>
      <Row label="Entrada">{priceText(t.entry, digits)}</Row>
      <Row label="Stop">
        {priceText(t.sl, digits)} · {t.lot.slPips.toFixed(1)} pips
      </Row>
      <Row label="Alvo">
        {t.tp > 0 ? `${priceText(t.tp, digits)} · +${money(t.reward)}` : "—"}
      </Row>
      {t.targets.map((p, i) => (
        <Row key={p.price} label={`Parcial ${i + 1}`}>
          {priceText(p.price, digits)} · {lotText(p.volume)}
        </Row>
      ))}
      <Row label="Margem">
        {t.margin > 0 ? `${money(t.margin)} ${currency}` : "—"}
      </Row>
    </div>
  );
}

function LastCommand({
  account,
  id,
}: {
  account: string;
  id: Id<"eaCommands"> | null;
}) {
  const list = useQuery(api.eatrade.commands, id ? { account } : "skip");
  const c = list?.find((x) => x.id === id);
  if (!c) {
    return null;
  }
  let detail = "";
  if (c.result) {
    detail = c.result.ok
      ? `#${c.result.ticket} · ${lotText(c.result.volume)} a ${c.result.price}`
      : c.result.message;
  }
  return (
    <p aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs">
      <StatusText status={c.status} />
      {detail ? <span className="text-muted-foreground">{detail}</span> : null}
    </p>
  );
}

function sendLabel(side: Side, lot: number, symbol: string, confirm: boolean) {
  const buy = side === "buy";
  let verb = buy ? "Comprar" : "Vender";
  if (confirm) {
    verb = `Confirmar ${buy ? "compra" : "venda"} de`;
  }
  return `${verb} ${lotText(lot)} ${symbol}`;
}

export function OrderTicket({
  session,
  symbol,
  onSymbol,
  spec,
}: {
  session: Session;
  symbol: string;
  onSymbol: (s: string) => void;
  spec: SymbolSpec | undefined;
}) {
  const send = useMutation(api.eatrade.sendOrder);
  const linked = useLinked();
  const [prefs, setPrefs] = useLocal<TicketPrefs>("cb:trade:ticket", DEFAULTS);
  const set: SetPrefs = (p) => setPrefs((x) => ({ ...x, ...p }));
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [pendingPrice, setPendingPrice] = useState(0);
  const [slPrice, setSlPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastId, setLastId] = useState<Id<"eaCommands"> | null>(null);

  const quote = session.quotes.find((q) => q.symbol === symbol);
  const { info, limits } = session;
  const ticket = useMemo(
    () =>
      spec && quote
        ? computeTicket({
            prefs,
            side,
            type,
            pendingPrice,
            slPrice,
            tpPrice,
            spec,
            quote,
            balance: info.balance,
            limits,
          })
        : null,
    [
      spec,
      quote,
      prefs,
      side,
      type,
      pendingPrice,
      slPrice,
      tpPrice,
      info,
      limits,
    ]
  );
  const ready = ticket !== null && ticket.errors.length === 0;
  const lot = ticket?.lot.lot ?? 0;

  const submit = async () => {
    if (!(ticket && ready)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await send({
        account: session.account,
        symbol,
        side,
        orderType: type,
        volume: ticket.lot.lot,
        price:
          type === "market" ? undefined : roundPrice(ticket.entry, ticket.live),
        sl: ticket.sl,
        tp: ticket.tp,
        partials: ticket.targets.map((t) => ({
          price: t.price,
          volume: t.volume,
        })),
        breakeven: prefs.partialsOn && prefs.breakeven,
        comment: "Painel",
        riskPct: ticket.lot.riskPct,
      });
      setLastId(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <QuoteHeader
        onSymbol={onSymbol}
        quote={quote}
        spec={spec}
        symbol={symbol}
        symbols={session.symbols}
      />
      <SideToggle onSide={setSide} side={side} />
      <Chips
        format={(t) => TYPE_LABEL[t]}
        label="Tipo de ordem"
        onChange={setType}
        options={["market", "limit", "stop"] as OrderType[]}
        value={type}
      />
      {type === "market" ? null : (
        <NumberField
          label="Preço da ordem"
          onChange={setPendingPrice}
          value={pendingPrice}
        />
      )}
      <RiskPicker
        balance={info.balance}
        currency={info.currency}
        prefs={prefs}
        set={set}
      />
      <StopPicker
        onSlPrice={setSlPrice}
        prefs={prefs}
        set={set}
        slPrice={slPrice}
      />
      <TargetPicker
        onTpPrice={setTpPrice}
        prefs={prefs}
        set={set}
        tpPrice={tpPrice}
      />
      <PartialsBox prefs={prefs} set={set} />
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Comissão da corretora
        </summary>
        <NumberField
          className="mt-2"
          label="Ida e volta por lote (entra no cálculo do risco)"
          onChange={(commission) => set({ commission })}
          suffix={info.currency}
          value={prefs.commission}
        />
      </details>

      {ticket ? (
        <Summary
          currency={info.currency}
          digits={spec?.digits ?? 5}
          t={ticket}
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          {spec
            ? "Defina o preço da ordem para calcular o lote."
            : "À espera das especificações do ativo enviadas pelo EA…"}
        </p>
      )}
      {ticket?.errors.length ? (
        <ul className="flex flex-col gap-1 text-[var(--down)] text-xs">
          {ticket.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {prefs.partialsOn && ticket && ticket.targets.length === 0 && lot > 0 ? (
        <p className="text-muted-foreground text-xs">
          O lote é pequeno demais para dividir: sem parciais, o alvo fecha tudo.
        </p>
      ) : null}

      <ConfirmButton
        armedLabel={sendLabel(side, lot, symbol, true)}
        className="w-full"
        disabled={busy || !ready || !linked || !limits.allowTrading}
        onConfirm={submit}
        size="default"
        variant="default"
      >
        {busy ? "A enviar…" : sendLabel(side, lot, symbol, false)}
      </ConfirmButton>
      {linked ? null : (
        <p className="text-muted-foreground text-xs">
          A ligar ao EA em tempo real (até 15 s)…
        </p>
      )}
      {error ? (
        <p className="text-[var(--down)] text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <LastCommand account={session.account} id={lastId} />
    </div>
  );
}
