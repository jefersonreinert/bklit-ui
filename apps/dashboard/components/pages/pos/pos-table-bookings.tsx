"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { createOrder, sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import type { PosData } from "@/lib/pos/types";
import { toMin } from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";

/**
 * Reservations on the POS floor (own bookings and Tableo's, live): each
 * table shows its next booking, staff seat guests and open the check in
 * one tap; paying the check finishes the booking (convex/pos.ts).
 */

export type TableBooking = NonNullable<
  FunctionReturnType<typeof api.tableo.posDay>
>["reservations"][number];

/** Bookings before this hour belong to the previous service day. */
const DAY_STARTS = 5;

function serviceDay(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < DAY_STARTS) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Minutes from now until a service-day time (late times after midnight). */
function minutesUntil(time: string, now = new Date()) {
  let t = toMin(time);
  let n = now.getHours() * 60 + now.getMinutes();
  if (now.getHours() < DAY_STARTS) {
    n += 1440;
  }
  if (t < DAY_STARTS * 60) {
    t += 1440;
  }
  return t - n;
}

const LIVE = ["pending", "confirmed", "seated"];

/** Today's bookings and, per table, the one that matters now. */
export function useTableBookings() {
  const company = useCompany();
  const data = usePosQuery(api.tableo.posDay, { company, date: serviceDay() });
  const list = (data?.reservations ?? []).filter(
    (r) => !r.blocked || LIVE.includes(r.status)
  );
  const byTable = new Map<string, TableBooking>();
  for (const r of list) {
    if (!LIVE.includes(r.status)) {
      continue;
    }
    // Finished long ago: no longer holds the table
    if (r.status !== "seated" && minutesUntil(r.time) + r.duration < 0) {
      continue;
    }
    for (const t of r.tables) {
      const cur = byTable.get(t);
      if (
        !cur ||
        (r.status === "seated" && cur.status !== "seated") ||
        (cur.status !== "seated" && r.time < cur.time)
      ) {
        byTable.set(t, r);
      }
    }
  }
  return { list, byTable, tableo: Boolean(data?.tableo), company };
}

function badgeTone(status: string, soon: boolean) {
  if (status === "seated") {
    return "bg-emerald-600";
  }
  return soon ? "bg-amber-600" : "bg-violet-600";
}

function dotTone(status: string) {
  if (status === "seated") {
    return "bg-emerald-500";
  }
  return status === "pending" ? "bg-amber-500" : "bg-violet-500";
}

function seatLabel(seated: boolean, hasOrder: boolean) {
  if (seated) {
    return hasOrder ? "Ver conta" : "Abrir conta";
  }
  return hasOrder ? "Marcar como sentada" : "Sentar e abrir conta";
}

/** Small label on a table of the floor plan. */
export function TableBookingBadge({ b }: { b: TableBooking }) {
  const mins = minutesUntil(b.time);
  const soon = b.status !== "seated" && mins <= 30;
  return (
    <span
      className={cn(
        "absolute -top-2 left-1/2 flex max-w-[140%] -translate-x-1/2 items-center gap-1 truncate rounded-full px-1.5 py-0.5 font-medium text-[10px] text-white shadow-sm sm:text-[11px]",
        badgeTone(b.status, soon)
      )}
    >
      {b.blocked
        ? "Bloqueada"
        : `${b.time} · ${b.name.split(" ")[0]} · ${b.party}p`}
    </span>
  );
}

function tableNamesOf(data: PosData, ids: string[]) {
  const all = data.areas.flatMap((a) => a.tables);
  return ids.map((id) => all.find((t) => t.id === id)?.name ?? "?").join("+");
}

/** Booking details with seat / open check / no-show. */
export function BookingSheet({
  booking,
  data,
  tableId,
  hasOrder,
  onOpenOrder,
  onClose,
}: {
  booking: TableBooking;
  data: PosData;
  tableId?: string;
  hasOrder: boolean;
  onOpenOrder: (orderId: string) => void;
  onClose: () => void;
}) {
  const company = useCompany();
  const [busy, setBusy] = useState(false);
  const table = tableId ?? booking.tables[0];
  const late = minutesUntil(booking.time) < -15;
  const status = async (to: string) => {
    setBusy(true);
    const ok = await sendPos(api.tableo.posSetStatus, {
      company,
      id: booking.id,
      status: to,
    });
    setBusy(false);
    return ok !== undefined;
  };
  const seatAndOpen = async () => {
    if (booking.status !== "seated" && !(await status("seated"))) {
      return;
    }
    if (table && !hasOrder) {
      onOpenOrder(createOrder({ tableId: table, name: booking.name }).id);
    }
    onClose();
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            <Icon className="size-5" name="IconCalendarClock" />
            {booking.time} · {booking.name}
          </SheetTitle>
          <SheetDescription>
            {booking.party} pessoas
            {booking.tables.length
              ? ` · Mesa ${tableNamesOf(data, booking.tables)}`
              : " · sem mesa"}
            {booking.tableoRef
              ? ` · Tableo ${booking.tableoRef}`
              : ` · ${booking.ref}`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-5 text-sm">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {booking.vip ? <Chip tone="amber">★ VIP</Chip> : null}
            {booking.occasion ? (
              <Chip tone="violet">{booking.occasion}</Chip>
            ) : null}
            {booking.status === "seated" ? (
              <Chip tone="emerald">Sentada</Chip>
            ) : null}
            {booking.status === "pending" ? (
              <Chip tone="amber">Pendente</Chip>
            ) : null}
          </div>
          {booking.requests ? (
            <p className="rounded-xl bg-muted/60 p-3">{booking.requests}</p>
          ) : null}
          {booking.notes ? (
            <p className="text-muted-foreground text-xs italic">
              {booking.notes}
            </p>
          ) : null}
          {booking.phone ? (
            <a className="text-xs underline" href={`tel:${booking.phone}`}>
              {booking.phone}
            </a>
          ) : null}
          <div className="flex flex-col gap-2 pt-2">
            {booking.blocked ? null : (
              <Button disabled={busy || !table} onClick={seatAndOpen}>
                <Icon className="size-4" name="IconChair" />
                {seatLabel(booking.status === "seated", hasOrder)}
              </Button>
            )}
            {booking.status === "seated" ? (
              <Button
                disabled={busy}
                onClick={() => status("confirmed").then(onClose)}
                variant="ghost"
              >
                Desfazer chegada
              </Button>
            ) : null}
            {late && booking.status !== "seated" && !booking.blocked ? (
              <Button
                disabled={busy}
                onClick={() => status("no_show").then(onClose)}
                variant="outline"
              >
                Não veio (no-show)
              </Button>
            ) : null}
            {booking.tables.length ? null : (
              <p className="text-muted-foreground text-xs">
                Sem mesa: escolha a mesa na tela Reservas.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "amber" | "violet" | "emerald";
  children: React.ReactNode;
}) {
  const tones = {
    amber: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    violet: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
    emerald: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5", tones[tone])}>
      {children}
    </span>
  );
}

/** "Reservas de hoje" list under the floor's summary. */
export function BookingsToday({
  data,
  list,
  tableo,
  onPick,
}: {
  data: PosData;
  list: TableBooking[];
  tableo: boolean;
  onPick: (b: TableBooking) => void;
}) {
  const live = list.filter((r) => LIVE.includes(r.status) && !r.blocked);
  const covers = live.reduce((n, r) => n + r.party, 0);
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="flex items-center justify-between font-semibold">
        Reservas de hoje
        <span className="font-normal text-muted-foreground text-xs">
          {live.length} · {covers} pax{tableo ? " · Tableo ao vivo" : ""}
        </span>
      </p>
      {live.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nenhuma reserva ativa.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {live.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted/60"
                onClick={() => onPick(r)}
                type="button"
              >
                <span className="w-11 shrink-0 font-medium tabular-nums">
                  {r.time}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r.vip ? "★ " : ""}
                  {r.name}
                  <span className="text-muted-foreground"> · {r.party}p</span>
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {r.tables.length ? tableNamesOf(data, r.tables) : "—"}
                </span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    dotTone(r.status)
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="size-3 rounded-full bg-violet-600" /> reservada
        <span className="size-3 rounded-full bg-amber-600" /> chega em 30 min
        <span className="size-3 rounded-full bg-emerald-600" /> sentada
      </p>
    </div>
  );
}
