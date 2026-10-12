"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { MARKET_LABEL } from "@/lib/journal/account";
import { macroOf } from "@/lib/journal/analytics";
import { formatDuration, type Trade } from "@/lib/journal/metrics";
import { suggestImpact } from "@/lib/journal/news";
import {
  NOTE_FIELD_LABEL,
  NOTE_FIELDS,
  type NoteField,
  type NoteOptions,
} from "@/lib/journal/note-fields";
import { useCalendar } from "@/lib/markets/calendar";
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

/* ----------------------------- extra columns ----------------------------- */

type Column =
  | "rr"
  | "r"
  | "riskPct"
  | "riskUsd"
  | "points"
  | "duration"
  | "market"
  | "outcome";

const OUTCOME_LABEL: Record<string, string> = {
  win: "Ganho",
  loss: "Perda",
  breakeven: "Empate",
};

const COLUMNS: { id: Column; label: string; value: (t: Trade) => string }[] = [
  {
    id: "rr",
    label: "R:R planejado",
    value: (t) => (t.rrPlanned === null ? "" : `1:${t.rrPlanned.toFixed(2)}`),
  },
  {
    id: "r",
    label: "R realizado",
    value: (t) => (t.r === null ? "" : `${t.r.toFixed(2)}R`),
  },
  {
    id: "riskPct",
    label: "Risco %",
    value: (t) =>
      t.riskPct === null ? "" : `${(t.riskPct * 100).toFixed(2)}%`,
  },
  {
    id: "riskUsd",
    label: "Risco $",
    value: (t) => (t.riskUsd === null ? "" : money(t.riskUsd)),
  },
  {
    id: "points",
    label: "Pontos",
    value: (t) =>
      t.profitPoints === null
        ? ""
        : `${t.profitPoints > 0 ? "+" : ""}${t.profitPoints} pts`,
  },
  {
    id: "duration",
    label: "Duração",
    value: (t) =>
      t.closeTime === null ? "" : formatDuration(t.closeTime - t.openTime),
  },
  {
    id: "market",
    label: "Mercado",
    value: (t) => MARKET_LABEL[t.market] ?? t.market,
  },
  {
    id: "outcome",
    label: "Outcome",
    value: (t) => (t.outcome ? (OUTCOME_LABEL[t.outcome] ?? t.outcome) : ""),
  },
];

const COLUMNS_KEY = "journal.tradeColumns";
const DEFAULT_COLUMNS: Column[] = ["rr", "riskPct", "riskUsd", "points"];

/** Visible extra columns, remembered per browser. */
function useColumns() {
  const [cols, setCols] = useState<Column[]>(DEFAULT_COLUMNS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null");
      if (Array.isArray(saved)) {
        setCols(saved as Column[]);
      }
    } catch {
      // private mode or bad JSON: keep the defaults
    }
  }, []);
  const toggle = (c: Column) =>
    setCols((list) => {
      const next = list.includes(c)
        ? list.filter((x) => x !== c)
        : [...list, c];
      try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // not persisted
      }
      return next;
    });
  return { cols, toggle };
}

function ColumnPicker({
  cols,
  toggle,
}: {
  cols: Column[];
  toggle: (c: Column) => void;
}) {
  return (
    <fieldset
      aria-label="Colunas extra"
      className="flex flex-wrap items-center gap-1 text-xs"
    >
      <span className="mr-1 text-muted-foreground">Colunas:</span>
      {COLUMNS.map((c) => (
        <button
          aria-pressed={cols.includes(c.id)}
          className={cn(
            "border px-2 py-0.5",
            cols.includes(c.id)
              ? "bg-muted font-medium"
              : "text-muted-foreground"
          )}
          key={c.id}
          onClick={() => toggle(c.id)}
          type="button"
        >
          {c.label}
        </button>
      ))}
    </fieldset>
  );
}

/* --------------------------------- notes --------------------------------- */

type Fields = Record<NoteField, string>;

const fieldsOf = (note: Note | undefined): Fields =>
  Object.fromEntries(NOTE_FIELDS.map((f) => [f, note?.[f] ?? ""])) as Fields;

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** News Impact suggested from the economic calendar of the entry day. */
function NewsHint({
  trade,
  onPick,
}: {
  trade: Trade;
  onPick: (impact: string) => void;
}) {
  const day = new Date(trade.openTime);
  const { events } = useCalendar(day, day);
  const hint = events
    ? suggestImpact(trade.symbol, trade.openTime, events)
    : null;
  if (!hint) {
    return null;
  }
  return (
    <button
      className="self-start border border-dashed px-2 py-1 text-left text-xs hover:bg-muted"
      onClick={() => onPick(hint.impact)}
      type="button"
    >
      Calendário: {hint.event.currency} {hint.event.title} às{" "}
      {hm(hint.event.time)} → usar <b>{hint.impact}</b>
    </button>
  );
}

function StructuredFields({
  trade,
  options,
  fields,
  onChange,
}: {
  trade: Trade;
  options: NoteOptions;
  fields: Fields;
  onChange: (f: NoteField, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {NOTE_FIELDS.map((f) => {
        const list = options[f];
        const current = fields[f];
        return (
          <label className="flex flex-col gap-0.5 text-xs" key={f}>
            <span className="text-muted-foreground">{NOTE_FIELD_LABEL[f]}</span>
            <select
              className="h-8 border bg-background px-1.5 text-sm"
              onChange={(e) => onChange(f, e.target.value)}
              value={current}
            >
              <option value="">
                {f === "macro" ? `Auto · ${macroOf(trade.openTime)}` : "—"}
              </option>
              {current && !list.includes(current) ? (
                <option>{current}</option>
              ) : null}
              {list.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function NoteForm({
  trade,
  note,
  options,
}: {
  trade: Trade;
  note: Note | undefined;
  options: NoteOptions;
}) {
  const save = useMutation(api.journal.saveNote);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(note));
  const setField = (f: NoteField, value: string) =>
    setFields((x) => ({ ...x, [f]: value }));
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
          ...fields,
        });
        setSaved(true);
      }}
    >
      <StructuredFields
        fields={fields}
        onChange={setField}
        options={options}
        trade={trade}
      />
      {fields.newsImpact ? null : (
        <NewsHint onPick={(v) => setField("newsImpact", v)} trade={trade} />
      )}
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

interface DetailProps {
  trade: Trade;
  note: Note | undefined;
  signals: SignalRow[];
  options: NoteOptions;
}

function EaFacts({ trade }: { trade: Trade }) {
  const facts = COLUMNS.map((c) => [c.label, c.value(trade)] as const).filter(
    ([, v]) => v
  );
  const exit = [...trade.deals]
    .reverse()
    .find((d) => d.balanceAt !== undefined);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {facts.map(([label, value]) => (
        <span key={label}>
          <span className="text-muted-foreground">{label}</span> {value}
        </span>
      ))}
      {exit ? (
        <span className="text-muted-foreground">
          Snapshot no envio: saldo {money(exit.balanceAt ?? 0)} · equity{" "}
          {money(exit.equityAt ?? 0)}
        </span>
      ) : null}
    </div>
  );
}

function Detail({ trade, note, signals, options }: DetailProps) {
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
      <EaFacts trade={trade} />
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
      <NoteForm key={trade.key} note={note} options={options} trade={trade} />
    </div>
  );
}

function ExtraCells({
  columns,
  trade,
}: {
  columns: typeof COLUMNS;
  trade: Trade;
}) {
  const cells = columns
    .map((c) => ({ id: c.id, label: c.label, value: c.value(trade) }))
    .filter((c) => c.value);
  if (cells.length === 0) {
    return null;
  }
  return (
    <span className="col-span-full flex flex-wrap gap-1 text-[11px] tabular-nums">
      {cells.map((c) => (
        <span
          className="border px-1.5 text-muted-foreground"
          key={c.id}
          title={c.label}
        >
          {c.value}
        </span>
      ))}
    </span>
  );
}

function TradeRow({
  trade: t,
  note,
  open,
  onToggle,
  columns,
  signals,
  options,
}: {
  trade: Trade;
  note: Note | undefined;
  open: boolean;
  onToggle: () => void;
  columns: typeof COLUMNS;
  signals: SignalRow[];
  options: NoteOptions;
}) {
  return (
    <li>
      <button
        className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-muted/40 sm:grid-cols-[8rem_4rem_1fr_6rem_6rem]"
        onClick={onToggle}
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
          {t.closeTime ? ` · ${formatDuration(t.closeTime - t.openTime)}` : ""}
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
        <ExtraCells columns={columns} trade={t} />
      </button>
      {open ? (
        <Detail note={note} options={options} signals={signals} trade={t} />
      ) : null}
    </li>
  );
}

export function JournalTrades({
  trades,
  notes,
  signals,
  options,
}: {
  trades: Trade[];
  notes: Note[];
  signals: SignalRow[];
  options: NoteOptions;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { cols, toggle } = useColumns();
  const shown = COLUMNS.filter((c) => cols.includes(c.id));
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
    <div className="flex flex-col gap-2">
      <ColumnPicker cols={cols} toggle={toggle} />
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {trades.map((t) => (
          <TradeRow
            columns={shown}
            key={t.key}
            note={noteOf.get(t.key)}
            onToggle={() => setOpenKey(openKey === t.key ? null : t.key)}
            open={openKey === t.key}
            options={options}
            signals={signals}
            trade={t}
          />
        ))}
      </ul>
    </div>
  );
}
