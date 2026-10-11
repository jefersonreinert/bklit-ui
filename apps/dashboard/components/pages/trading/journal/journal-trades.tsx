"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { formatDuration, type Trade } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import { money, tone } from "./journal-summary";

/** Trades table with notes, tags, rating and the TradingView signals near the entry. */

export type Note = NonNullable<
  FunctionReturnType<typeof api.journal.notes>
>[number];
export type SignalRow = NonNullable<
  FunctionReturnType<typeof api.journal.signals>
>[number];

const MATCH_MS = 10 * 60_000;
const COMMA = /\s*,\s*/;

const when = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const EXCHANGE_PREFIX = /^.*:/;
const NON_LETTERS = /[^A-Z]/gi;
const TRAILING_ZEROS = /0+$/;
const px = (n: number) => n.toFixed(5).replace(TRAILING_ZEROS, "");

/** "OANDA:EURUSD" ↔ "EURUSD.m": compare letters only. */
const bare = (s: string) =>
  s.replace(EXCHANGE_PREFIX, "").replace(NON_LETTERS, "").toUpperCase();

export function signalsFor(trade: Trade, signals: SignalRow[]) {
  const sym = bare(trade.symbol);
  return signals.filter(
    (s) =>
      s.ticker &&
      (bare(s.ticker).includes(sym) || sym.includes(bare(s.ticker))) &&
      Math.abs(s.time - trade.openTime) <= MATCH_MS
  );
}

function NoteForm({ trade, note }: { trade: Trade; note: Note | undefined }) {
  const save = useMutation(api.journal.saveNote);
  const [setup, setSetup] = useState(note?.setup ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [rating, setRating] = useState(note?.rating ?? 0);
  const [text, setText] = useState(note?.notes ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await save({
          key: trade.key,
          setup,
          tags: tags.split(COMMA).filter(Boolean),
          rating,
          notes: text,
        });
        setSaved(true);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Setup"
          onChange={(e) => setSetup(e.target.value)}
          placeholder="Setup (ex.: rompimento, FVG, OB)"
          value={setup}
        />
        <Input
          aria-label="Tags"
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags separadas por vírgula"
          value={tags}
        />
      </div>
      <div className="flex items-center gap-1 text-sm">
        <span className="mr-1 text-muted-foreground text-xs">Execução</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            aria-label={`Nota ${n}`}
            className={cn(
              "text-lg",
              n <= rating ? "text-amber-500" : "text-muted-foreground/40"
            )}
            key={n}
            onClick={() => setRating(n === rating ? 0 : n)}
            type="button"
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        aria-label="Notas"
        onChange={(e) => setText(e.target.value)}
        placeholder="O que viu, porque entrou, emoções, o que faria diferente…"
        rows={3}
        value={text}
      />
      <div className="flex items-center justify-end gap-2">
        {saved ? (
          <span className="text-muted-foreground text-xs">Guardado</span>
        ) : null}
        <Button size="sm" type="submit">
          Guardar notas
        </Button>
      </div>
    </form>
  );
}

function Detail({
  trade,
  note,
  signals,
}: {
  trade: Trade;
  note: Note | undefined;
  signals: SignalRow[];
}) {
  const near = signalsFor(trade, signals);
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 p-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <span>Posição #{trade.position}</span>
        <span>Conta {trade.account}</span>
        <span>
          SL {trade.sl || "—"} · TP {trade.tp || "—"}
        </span>
        <span>
          Bruto {money(trade.profit, true)} · custos{" "}
          {money(trade.commission + trade.swap + trade.fee)}
        </span>
        {trade.magic ? <span>Magic {trade.magic}</span> : null}
        {trade.comment ? (
          <span className="col-span-2">“{trade.comment}”</span>
        ) : null}
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground text-xs">
          {trade.deals.length} negócios
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
          {trade.deals.map((d) => (
            <li key={d.ticket}>
              {when(d.time)} · #{d.ticket} {d.entry} {d.side} {d.volume} @{" "}
              {d.price} {d.profit ? money(d.profit, true) : ""}
            </li>
          ))}
        </ul>
      </details>
      {near.length > 0 ? (
        <div className="rounded-lg border p-2 text-xs">
          <p className="mb-1 font-medium">
            Sinais do TradingView perto da entrada
          </p>
          {near.map((s) => (
            <p key={s.id}>
              {when(s.time)} · {s.ticker} {s.action} {s.price ?? ""}{" "}
              <span className="text-muted-foreground">
                {s.strategy || s.message}
              </span>
            </p>
          ))}
        </div>
      ) : null}
      <NoteForm key={trade.key} note={note} trade={trade} />
    </div>
  );
}

export function JournalTrades({
  trades,
  notes,
  signals,
}: {
  trades: Trade[];
  notes: Note[];
  signals: SignalRow[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const noteOf = new Map(notes.map((n) => [n.key, n]));
  if (trades.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        Ainda não há operações. Ligue o EA no MT5 (aba Conector) e elas aparecem
        aqui sozinhas.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {trades.map((t) => {
        const note = noteOf.get(t.key);
        const open = openKey === t.key;
        return (
          <li key={t.key}>
            <button
              className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-muted/40 sm:grid-cols-[8rem_4rem_1fr_6rem_6rem]"
              onClick={() => setOpenKey(open ? null : t.key)}
              type="button"
            >
              <span className="font-semibold">{t.symbol}</span>
              <span
                className={cn(
                  "justify-self-end font-medium text-xs uppercase sm:self-center sm:justify-self-start",
                  t.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"
                )}
              >
                {t.side === "buy" ? "Compra" : "Venda"} {t.volume}
              </span>
              <span className="text-muted-foreground text-xs sm:self-center">
                {when(t.openTime)}
                {t.closeTime ? ` → ${when(t.closeTime)}` : " · aberta"} ·{" "}
                {px(t.openPrice)}
                {t.closePrice === null ? "" : ` → ${px(t.closePrice)}`}
                {t.closeTime
                  ? ` · ${formatDuration(t.closeTime - t.openTime)}`
                  : ""}
                {note?.setup ? ` · ${note.setup}` : ""}
              </span>
              <span
                className={cn(
                  "justify-self-end font-semibold tabular-nums",
                  tone(t.net)
                )}
              >
                {t.closeTime ? money(t.net, true) : "—"}
              </span>
              <span className="justify-self-end text-muted-foreground text-xs tabular-nums sm:self-center">
                {t.r === null ? "" : `${t.r.toFixed(2)}R`}
                {note?.rating ? ` · ${"★".repeat(note.rating)}` : ""}
              </span>
            </button>
            {open ? <Detail note={note} signals={signals} trade={t} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
