"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useState } from "react";
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
import type { Id } from "@/convex/_generated/dataModel";
import {
  SOURCES,
  type Source,
  type TableInfo,
} from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";
import {
  errText,
  localDay,
  SOURCE_META,
  VENUE_KEYS,
  VENUE_NAMES,
} from "./reservations-shared";

/**
 * Create or edit a booking: party and date first, then the free start
 * times (with the suggested table), guest details, tables and notes.
 */

export type Reservation = NonNullable<
  FunctionReturnType<typeof api.reservations.day>
>["reservations"][number];

interface Props {
  company: string;
  date: string;
  /** Existing booking to edit. */
  booking?: Reservation;
  /** Start as a walk-in (now, seated). */
  walkin?: boolean;
  /** Time and tables picked on the floor plan. */
  preset?: { time: string; tables: string[] };
  onClose: () => void;
}

const nowTime = () => {
  const d = new Date();
  const m = Math.floor(d.getMinutes() / 15) * 15;
  return `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

interface Form {
  date: string;
  time: string;
  party: number;
  name: string;
  phone: string;
  email: string;
  source: Source;
  occasion: string;
  requests: string;
  notes: string;
  vip: boolean;
  event: boolean;
  tables: string[];
  override: boolean;
}

function initial(
  date: string,
  booking?: Reservation,
  walkin?: boolean,
  preset?: { time: string; tables: string[] }
): Form {
  if (booking) {
    return {
      date: booking.date,
      time: booking.time,
      party: booking.party,
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      source: booking.source,
      occasion: booking.occasion,
      requests: booking.requests,
      notes: booking.notes,
      vip: booking.vip,
      event: booking.event,
      tables: booking.tables,
      override: false,
    };
  }
  return {
    date: walkin ? localDay() : date,
    time: preset?.time ?? (walkin ? nowTime() : ""),
    party: 2,
    name: walkin ? "Walk-in" : "",
    phone: "",
    email: "",
    source: walkin ? "walkin" : "phone",
    occasion: "",
    requests: "",
    notes: "",
    vip: false,
    event: false,
    tables: preset?.tables ?? [],
    override: false,
  };
}

function sheetTitle(booking?: Reservation, walkin?: boolean) {
  if (booking) {
    return `Reserva ${booking.ref}`;
  }
  return walkin ? "Walk-in" : "Nova reserva";
}

function submitLabel(busy: boolean, booking?: Reservation, walkin?: boolean) {
  if (busy) {
    return "Salvando…";
  }
  if (booking) {
    return "Salvar alterações";
  }
  return walkin ? "Sentar walk-in" : "Criar reserva";
}

type Setter = <K extends keyof Form>(k: K, v: Form[K]) => void;

export function BookingSheet({
  company,
  date,
  booking,
  walkin,
  preset,
  onClose,
}: Props) {
  const create = useMutation(api.reservations.create);
  const update = useMutation(api.reservations.update);
  const [venue, setVenue] = useState(
    booking?.company ?? (company === "all" ? "the-brew" : company)
  );
  const [f, setF] = useState<Form>(() =>
    initial(date, booking, walkin, preset)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set: Setter = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  const info = useQuery(api.reservations.venue, { company: venue });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.time) {
      setError("Escolha um horário.");
      return;
    }
    setBusy(true);
    const common = {
      name: f.name,
      phone: f.phone || undefined,
      email: f.email || undefined,
      date: f.date,
      time: f.time,
      party: f.party,
      tables: f.tables,
      requests: f.requests || undefined,
      notes: f.notes || undefined,
      occasion: f.occasion || undefined,
      vip: f.vip,
      event: f.event,
      override: f.override,
      autoTable: f.tables.length === 0,
    };
    try {
      if (booking) {
        await update({ id: booking.id, ...common });
      } else {
        await create({ company: venue, source: f.source, ...common });
      }
      onClose();
    } catch (err) {
      setError(errText(err, "Não salvou."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-xl!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{sheetTitle(booking, walkin)}</SheetTitle>
          <SheetDescription>{VENUE_NAMES[venue] ?? venue}</SheetDescription>
        </SheetHeader>
        <form className="flex flex-col gap-5 p-5 text-sm" onSubmit={submit}>
          {booking ? null : (
            <VenuePicker
              onPick={(k) => {
                setVenue(k);
                set("tables", []);
              }}
              venue={venue}
            />
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 flex flex-col gap-1" htmlFor="bk-date">
              Data
              <Input
                id="bk-date"
                onChange={(e) => setF({ ...f, date: e.target.value, time: "" })}
                type="date"
                value={f.date}
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor="bk-party">
              Pessoas
              <Input
                id="bk-party"
                inputMode="numeric"
                onChange={(e) =>
                  set("party", Math.max(1, Number(e.target.value) || 1))
                }
                value={String(f.party)}
              />
            </label>
          </div>
          <SlotPicker
            bookingId={booking?.id}
            f={f}
            set={set}
            setF={setF}
            venue={venue}
          />
          {info?.tables.length ? (
            <TablePicker f={f} set={set} tables={info.tables} />
          ) : null}
          {booking ? null : <GuestHint f={f} setF={setF} />}
          <GuestFields editing={Boolean(booking)} f={f} set={set} />
          {error ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-destructive">
              {error}
            </p>
          ) : null}
          <Button disabled={busy} type="submit">
            {submitLabel(busy, booking, walkin)}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function VenuePicker({
  venue,
  onPick,
}: {
  venue: string;
  onPick: (k: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VENUE_KEYS.map((k) => (
        <button
          className={cn(
            "rounded-full border px-3 py-1",
            venue === k
              ? "border-foreground bg-foreground text-background"
              : "hover:bg-muted"
          )}
          key={k}
          onClick={() => onPick(k)}
          type="button"
        >
          {VENUE_NAMES[k]}
        </button>
      ))}
    </div>
  );
}

function SlotPicker({
  venue,
  f,
  set,
  setF,
  bookingId,
}: {
  venue: string;
  f: Form;
  set: Setter;
  setF: (f: Form) => void;
  bookingId?: Id<"reservations">;
}) {
  const slots = useQuery(api.reservations.availability, {
    company: venue,
    date: f.date,
    party: Math.max(1, f.party),
    excludeId: bookingId,
  });
  const slotClass = (ok: boolean, picked: boolean) =>
    cn(
      "rounded-lg border px-2 py-1.5 text-xs tabular-nums",
      picked && "border-foreground bg-foreground text-background",
      !picked && ok && "hover:bg-muted",
      !ok && "cursor-not-allowed line-through opacity-35"
    );
  return (
    <section className="flex flex-col gap-2">
      <p className="font-medium">Horário {f.time ? `· ${f.time}` : ""}</p>
      {slots === undefined ? (
        <p className="text-muted-foreground">Calculando…</p>
      ) : null}
      {slots?.length === 0 ? (
        <p className="rounded-xl bg-muted p-3 text-muted-foreground">
          Fechado neste dia.
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {(slots ?? []).map((s) => (
          <button
            className={slotClass(s.ok, f.time === s.time)}
            disabled={!(s.ok || f.override)}
            key={s.time}
            onClick={() =>
              setF({
                ...f,
                time: s.time,
                tables: f.tables.length ? f.tables : s.tables,
              })
            }
            type="button"
          >
            {s.time}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-muted-foreground text-xs">
        <input
          checked={f.override}
          onChange={(e) => set("override", e.target.checked)}
          type="checkbox"
        />
        Ignorar horário, limite de grupo e capacidade (grupos grandes, eventos).
        Mesa ocupada nunca é liberada.
      </label>
      {f.override ? (
        <Input
          aria-label="Hora"
          onChange={(e) => set("time", e.target.value)}
          type="time"
          value={f.time}
        />
      ) : null}
    </section>
  );
}

function TablePicker({
  f,
  set,
  tables,
}: {
  f: Form;
  set: Setter;
  tables: TableInfo[];
}) {
  const areas = [...new Set(tables.map((t) => t.area))];
  const seats = f.tables.reduce(
    (a, id) => a + (tables.find((t) => t.id === id)?.seats ?? 0),
    0
  );
  const toggle = (id: string) =>
    set(
      "tables",
      f.tables.includes(id)
        ? f.tables.filter((t) => t !== id)
        : [...f.tables, id]
    );
  return (
    <section className="flex flex-col gap-2">
      <p className="font-medium">
        Mesas {f.tables.length ? `· ${seats} lugares` : "· automático"}
      </p>
      {areas.map((a) => (
        <div className="flex flex-wrap items-center gap-1.5" key={a}>
          <span className="w-20 shrink-0 text-muted-foreground text-xs">
            {a}
          </span>
          {tables
            .filter((t) => t.area === a)
            .map((t) => (
              <button
                className={cn(
                  "rounded-lg border px-2 py-1 text-xs",
                  f.tables.includes(t.id)
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted"
                )}
                key={t.id}
                onClick={() => toggle(t.id)}
                type="button"
              >
                {t.name}
                <span className="opacity-60"> · {t.seats}</span>
              </button>
            ))}
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        Toque em mais de uma para juntar mesas. Sem escolha, o sistema escolhe a
        melhor livre.
      </p>
    </section>
  );
}

function GuestFields({
  f,
  set,
  editing,
}: {
  f: Form;
  set: Setter;
  editing: boolean;
}) {
  const field = (
    k: keyof Form,
    id: string,
    label: string,
    ph = "",
    wide = false,
    mode?: "tel" | "email"
  ) => (
    <label
      className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}
      htmlFor={id}
    >
      {label}
      <Input
        id={id}
        inputMode={mode}
        onChange={(e) => set(k, e.target.value as never)}
        placeholder={ph}
        value={String(f[k])}
      />
    </label>
  );
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-2">
        {field("name", "bk-name", "Nome do cliente", "", true)}
        {field("phone", "bk-phone", "Telefone", "+356…", false, "tel")}
        {field("email", "bk-email", "E-mail", "", false, "email")}
        {editing ? null : (
          <label className="flex flex-col gap-1" htmlFor="bk-source">
            Origem
            <select
              className="h-9 rounded-md border bg-transparent px-2"
              id="bk-source"
              onChange={(e) => set("source", e.target.value as Source)}
              value={f.source}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_META[s].label}
                </option>
              ))}
            </select>
          </label>
        )}
        {field("occasion", "bk-occasion", "Ocasião", "Aniversário, negócios…")}
        {field(
          "requests",
          "bk-req",
          "Pedidos do cliente",
          "Alergia a nozes, cadeira de bebê, terraço…",
          true
        )}
        {field(
          "notes",
          "bk-notes",
          "Notas internas (só a equipe vê)",
          "",
          true
        )}
      </section>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            checked={f.vip}
            onChange={(e) => set("vip", e.target.checked)}
            type="checkbox"
          />
          VIP
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={f.event}
            onChange={(e) => set("event", e.target.checked)}
            type="checkbox"
          />
          Evento privado / grupo grande
        </label>
      </div>
    </>
  );
}

const PHONE_JUNK = /[^\d+]/g;

/** Recognises a returning guest from the phone or e-mail typed. */
function GuestHint({ f, setF }: { f: Form; setF: (f: Form) => void }) {
  const phone = f.phone.replace(PHONE_JUNK, "");
  const ready = phone.length >= 6 || f.email.includes("@");
  const g = useQuery(
    api.guests.byContact,
    ready ? { phone: phone || undefined, email: f.email || undefined } : "skip"
  );
  if (!g) {
    return null;
  }
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-3",
        g.noShows >= 2
          ? "border-destructive/40 bg-destructive/5"
          : "bg-muted/50"
      )}
    >
      <p className="font-medium">
        {g.vip ? "★ " : ""}Cliente conhecido: {g.name}
      </p>
      <p className="text-muted-foreground text-xs">
        {[
          s(g.visits, "visita"),
          s(g.bookings, "reserva"),
          g.noShows ? s(g.noShows, "no-show") : null,
          g.lastVisit ? `última ${g.lastVisit}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {g.preferences ? (
        <p className="text-xs">Preferências: {g.preferences}</p>
      ) : null}
      {g.occasions ? <p className="text-xs">Ocasiões: {g.occasions}</p> : null}
      <Button
        className="self-start"
        onClick={() =>
          setF({
            ...f,
            name: g.name,
            email: f.email || g.email,
            phone: f.phone || g.phone,
            vip: f.vip || g.vip,
            requests: f.requests || g.preferences,
          })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        Usar dados do cliente
      </Button>
    </div>
  );
}
