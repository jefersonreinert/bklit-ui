"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useMemo, useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import {
  type DayHours,
  DEFAULT_SETTINGS,
  SOURCES,
  type Source,
  STATUSES,
  type Status,
  type VenueSettings,
} from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../telegram/telegram-shared";
import { BookingSheet, type Reservation } from "./booking-sheet";
import {
  errText,
  localDay,
  prettyDay,
  SOURCE_META,
  STATUS_META,
  shiftDay,
  VENUE_KEYS,
  VENUE_NAMES,
  WEEKDAYS,
} from "./reservations-shared";

/**
 * Reservations of every venue and channel: the day at a glance, quick
 * status changes during service, new bookings, walk-ins and settings.
 */

export function ReservationsPage() {
  return (
    <TelegramProvider
      fallback={
        <Notice>
          As reservas usam o banco central do painel, indisponível agora.
        </Notice>
      }
    >
      <Reservations />
    </TelegramProvider>
  );
}

type Sheetstate =
  | { kind: "new" }
  | { kind: "walkin" }
  | { kind: "edit"; booking: Reservation }
  | { kind: "settings" }
  | null;

function Reservations() {
  const [company, setCompany] = useState("all");
  const [date, setDate] = useState(localDay);
  const [statusFilter, setStatusFilter] = useState<Status | "active" | "all">(
    "active"
  );
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Sheetstate>(null);
  const day = useQuery(api.reservations.day, { company, date });
  const found = useQuery(
    api.reservations.search,
    q.trim().length >= 2 ? { company, q } : "skip"
  );

  const list = useMemo(() => {
    const rows =
      q.trim().length >= 2 ? (found ?? []) : (day?.reservations ?? []);
    return rows.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) {
        return false;
      }
      if (statusFilter === "active") {
        return ["pending", "confirmed", "seated"].includes(r.status);
      }
      return statusFilter === "all" || r.status === statusFilter;
    });
  }, [day, found, q, statusFilter, sourceFilter]);

  if (day === null) {
    return <PanelUnlock what="gerenciar as reservas" />;
  }
  const all = day?.reservations ?? [];
  const live = all.filter((r) => !["cancelled", "no_show"].includes(r.status));
  const stats = [
    { label: "Reservas", value: live.length },
    { label: "Pessoas", value: live.reduce((a, r) => a + r.party, 0) },
    {
      label: "Pendentes",
      value: all.filter((r) => r.status === "pending").length,
    },
    {
      label: "Sentadas agora",
      value: all.filter((r) => r.status === "seated").length,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">Reservas</h2>
          <p className="text-muted-foreground text-sm capitalize">
            {prettyDay(date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheet({ kind: "new" })}>
            Nova reserva
          </Button>
          <Button
            onClick={() => setSheet({ kind: "walkin" })}
            variant="outline"
          >
            Walk-in
          </Button>
          {company === "all" ? null : (
            <Button
              onClick={() => setSheet({ kind: "settings" })}
              variant="ghost"
            >
              Configurações
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["all", ...VENUE_KEYS].map((k) => (
          <button
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              company === k
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted"
            )}
            key={k}
            onClick={() => setCompany(k)}
            type="button"
          >
            {k === "all" ? "Todos os bares" : VENUE_NAMES[k]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setDate(shiftDay(date, -1))}
          size="sm"
          variant="outline"
        >
          ‹
        </Button>
        <Input
          className="w-auto"
          onChange={(e) => e.target.value && setDate(e.target.value)}
          type="date"
          value={date}
        />
        <Button
          onClick={() => setDate(shiftDay(date, 1))}
          size="sm"
          variant="outline"
        >
          ›
        </Button>
        <Button onClick={() => setDate(localDay())} size="sm" variant="ghost">
          Hoje
        </Button>
        <Input
          className="ml-auto w-full sm:w-64"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome, telefone ou código…"
          value={q}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div className="rounded-2xl border bg-card p-3" key={s.label}>
            <p className="text-muted-foreground text-xs">{s.label}</p>
            <p className="font-semibold text-2xl tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <Filters
        setSource={setSourceFilter}
        setStatus={setStatusFilter}
        source={sourceFilter}
        status={statusFilter}
      />

      {day === undefined ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : null}
      {day && list.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
          Nenhuma reserva {q ? "encontrada" : "neste dia com esses filtros"}.
        </div>
      ) : null}
      <DayList
        company={company}
        list={list}
        onEdit={(b) => setSheet({ kind: "edit", booking: b })}
        tables={day?.tables ?? {}}
      />

      {sheet?.kind === "new" || sheet?.kind === "walkin" ? (
        <BookingSheet
          company={company}
          date={date}
          onClose={() => setSheet(null)}
          walkin={sheet.kind === "walkin"}
        />
      ) : null}
      {sheet?.kind === "edit" ? (
        <BookingSheet
          booking={sheet.booking}
          company={company}
          date={date}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "settings" ? (
        <SettingsSheet company={company} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}

function Filters({
  status,
  setStatus,
  source,
  setSource,
}: {
  status: Status | "active" | "all";
  setStatus: (s: Status | "active" | "all") => void;
  source: Source | "all";
  setSource: (s: Source | "all") => void;
}) {
  const chip = (on: boolean) =>
    cn(
      "shrink-0 rounded-full px-2.5 py-1 text-xs",
      on ? "bg-foreground text-background" : "bg-muted"
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto">
        <button
          className={chip(status === "active")}
          onClick={() => setStatus("active")}
          type="button"
        >
          Ativas
        </button>
        <button
          className={chip(status === "all")}
          onClick={() => setStatus("all")}
          type="button"
        >
          Todas
        </button>
        {STATUSES.map((s) => (
          <button
            className={chip(status === s)}
            key={s}
            onClick={() => setStatus(s)}
            type="button"
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        <button
          className={chip(source === "all")}
          onClick={() => setSource("all")}
          type="button"
        >
          Todas as origens
        </button>
        {SOURCES.map((s) => (
          <button
            className={chip(source === s)}
            key={s}
            onClick={() => setSource(s)}
            type="button"
          >
            <span
              className={cn(
                "mr-1.5 inline-block size-2 rounded-full",
                SOURCE_META[s].dot
              )}
            />
            {SOURCE_META[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DayList({
  list,
  tables,
  company,
  onEdit,
}: {
  list: Reservation[];
  tables: Record<string, { id: string; name: string }[]>;
  company: string;
  onEdit: (b: Reservation) => void;
}) {
  const hours = [...new Set(list.map((r) => r.time.slice(0, 2)))];
  return (
    <div className="flex flex-col gap-4">
      {hours.map((h) => (
        <section className="flex flex-col gap-2" key={h}>
          <p className="font-semibold text-muted-foreground text-xs tabular-nums">
            {h}:00
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {list
              .filter((r) => r.time.startsWith(h))
              .map((r) => (
                <BookingCard
                  b={r}
                  key={r.id}
                  onEdit={() => onEdit(r)}
                  showVenue={company === "all"}
                  tableNames={r.tables
                    .map(
                      (id) =>
                        tables[r.company]?.find((t) => t.id === id)?.name ?? "?"
                    )
                    .join(" + ")}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const NEXT: Partial<Record<Status, { to: Status; label: string }>> = {
  pending: { to: "confirmed", label: "Confirmar" },
  confirmed: { to: "seated", label: "Sentar" },
  seated: { to: "completed", label: "Concluir" },
};

function BookingCard({
  b,
  tableNames,
  showVenue,
  onEdit,
}: {
  b: Reservation;
  tableNames: string;
  showVenue: boolean;
  onEdit: () => void;
}) {
  const setStatus = useMutation(api.reservations.setStatus);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[b.status];
  const go = async (to: Status) => {
    setError(null);
    try {
      await setStatus({ id: b.id, status: to });
      setMore(false);
    } catch (err) {
      setError(errText(err, "Falhou."));
    }
  };
  const src = SOURCE_META[b.source];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-muted py-1.5">
          <span className="font-semibold tabular-nums">{b.time}</span>
          <span className="text-muted-foreground text-xs">{b.party} pax</span>
        </div>
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onEdit}
          type="button"
        >
          <p className="truncate font-medium">
            {b.vip ? "★ " : ""}
            {b.name}
            {b.event ? (
              <span className="ml-1.5 rounded-full bg-violet-500/15 px-1.5 text-violet-700 text-xs dark:text-violet-300">
                Evento
              </span>
            ) : null}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            <span
              className={cn("mr-1 inline-block size-2 rounded-full", src.dot)}
            />
            {src.label}
            {showVenue ? ` · ${VENUE_NAMES[b.company] ?? b.company}` : ""}
            {tableNames ? ` · Mesa ${tableNames}` : " · sem mesa"}
            {` · ${b.ref}`}
          </p>
          {b.requests || b.occasion ? (
            <p className="truncate text-xs">
              {[b.occasion, b.requests].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {b.notes ? (
            <p className="truncate text-muted-foreground text-xs italic">
              {b.notes}
            </p>
          ) : null}
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs",
            STATUS_META[b.status].tone
          )}
        >
          {STATUS_META[b.status].label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {next ? (
          <Button onClick={() => go(next.to)} size="sm">
            {next.label}
          </Button>
        ) : null}
        {b.phone ? (
          <a
            className="inline-flex h-8 items-center rounded-md border px-3 text-xs"
            href={`tel:${b.phone}`}
          >
            Ligar
          </a>
        ) : null}
        <Button onClick={() => setMore(!more)} size="sm" variant="ghost">
          {more ? "Fechar" : "Mais"}
        </Button>
        {more ? (
          <>
            {["pending", "confirmed"].includes(b.status) ? (
              <Button onClick={() => go("no_show")} size="sm" variant="outline">
                No-show
              </Button>
            ) : null}
            {["pending", "confirmed", "seated"].includes(b.status) ? (
              <Button
                onClick={() => go("cancelled")}
                size="sm"
                variant="destructive"
              >
                Cancelar reserva
              </Button>
            ) : (
              <Button
                onClick={() => go("confirmed")}
                size="sm"
                variant="outline"
              >
                Reativar
              </Button>
            )}
          </>
        ) : null}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {more ? (
        <ul className="border-t pt-2 text-muted-foreground text-xs">
          {b.log
            .slice()
            .reverse()
            .map((l) => (
              <li key={l.at}>
                {new Date(l.at).toLocaleString("pt-PT", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}{" "}
                · {l.what}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */

function SettingsSheet({
  company,
  onClose,
}: {
  company: string;
  onClose: () => void;
}) {
  const info = useQuery(api.reservations.venue, { company });
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Reservas · {VENUE_NAMES[company] ?? company}</SheetTitle>
          <SheetDescription>
            Horários, duração, grupos e capacidade
          </SheetDescription>
        </SheetHeader>
        {info ? (
          <SettingsForm
            company={company}
            initial={info.settings}
            onDone={onClose}
            tables={info.tables.length}
          />
        ) : (
          <p className="p-5 text-muted-foreground text-sm">Carregando…</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({
  company,
  initial,
  tables,
  onDone,
}: {
  company: string;
  initial: VenueSettings;
  tables: number;
  onDone: () => void;
}) {
  const save = useMutation(api.reservations.saveSettings);
  const [s, setS] = useState<VenueSettings>({
    ...DEFAULT_SETTINGS,
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const setHour = (i: number, patch: Partial<DayHours>) =>
    setS({
      ...s,
      hours: s.hours.map((h, k) => (k === i ? { ...h, ...patch } : h)),
    });
  const num = (k: keyof VenueSettings, label: string) => (
    <label className="flex flex-col gap-1" htmlFor={`rs-${k}`}>
      {label}
      <Input
        id={`rs-${k}`}
        inputMode="numeric"
        onChange={(e) => setS({ ...s, [k]: Number(e.target.value) || 0 })}
        value={String(s[k])}
      />
    </label>
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await save({ company, ...s });
      onDone();
    } catch (err) {
      setError(errText(err, "Não salvou."));
    }
  };
  return (
    <form className="flex flex-col gap-4 p-5 text-sm" onSubmit={submit}>
      <section className="flex flex-col gap-1.5">
        <p className="font-medium">Horário de funcionamento</p>
        {s.hours.map((h, i) => (
          <div className="flex items-center gap-2" key={WEEKDAYS[i]}>
            <span className="w-10 text-muted-foreground">{WEEKDAYS[i]}</span>
            <label className="flex items-center gap-1 text-xs">
              <input
                checked={!h.closed}
                onChange={(e) => setHour(i, { closed: !e.target.checked })}
                type="checkbox"
              />
              Aberto
            </label>
            {h.closed ? null : (
              <>
                <Input
                  className="w-28"
                  onChange={(e) => setHour(i, { open: e.target.value })}
                  type="time"
                  value={h.open}
                />
                <span>–</span>
                <Input
                  className="w-28"
                  onChange={(e) => setHour(i, { close: e.target.value })}
                  type="time"
                  value={h.close}
                />
              </>
            )}
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          Fechamento depois da meia-noite (ex.: 01:00) conta no mesmo dia.
        </p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1" htmlFor="rs-interval">
          Intervalo entre horários
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="rs-interval"
            onChange={(e) => setS({ ...s, interval: Number(e.target.value) })}
            value={s.interval}
          >
            {[10, 15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        </label>
        {num("duration", "Duração da reserva (min)")}
        {num("lastBooking", "Última reserva antes de fechar (min)")}
        {num("maxCovers", "Máx. pessoas ao mesmo tempo (0 = sem limite)")}
        {num("minParty", "Grupo mínimo")}
        {num("maxParty", "Grupo máximo (online)")}
      </div>
      <label className="flex items-center gap-2">
        <input
          checked={s.online}
          onChange={(e) => setS({ ...s, online: e.target.checked })}
          type="checkbox"
        />
        Aceitar reservas online (site, mensagens, Google)
      </label>
      <label className="flex items-center gap-2">
        <input
          checked={s.confirmOnline}
          onChange={(e) => setS({ ...s, confirmOnline: e.target.checked })}
          type="checkbox"
        />
        Reservas online ficam pendentes até a equipe confirmar
      </label>
      <label className="flex flex-col gap-1" htmlFor="rs-cond">
        Condições para o cliente
        <textarea
          className="min-h-20 rounded-md border bg-transparent p-2"
          id="rs-cond"
          onChange={(e) => setS({ ...s, conditions: e.target.value })}
          placeholder="Ex.: mesas no terraço sujeitas ao tempo; grupos acima de 10 pagam sinal."
          value={s.conditions}
        />
      </label>
      <p className="rounded-xl bg-muted p-3 text-muted-foreground text-xs">
        Mesas e áreas vêm do mapa do POS ({tables} mesas). Edite em POS → Mesas.
      </p>
      {error ? <p className="text-destructive">{error}</p> : null}
      <Button type="submit">Salvar</Button>
    </form>
  );
}
