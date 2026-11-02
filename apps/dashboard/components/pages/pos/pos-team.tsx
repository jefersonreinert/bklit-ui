"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import {
  dayKey,
  money,
  sendPos,
  useCompanies,
  useCompany,
  usePos,
  usePosQuery,
} from "@/lib/pos/store";
import { cn } from "@/lib/utils";

/**
 * Team of the current business: weekly rota, time clock, who is working
 * now and the cost of the hours against the week's sales.
 */

type Week = NonNullable<typeof api.team.week._returnType>;
type Shift = Week["shifts"][number];
type Person = Week["staff"][number];

const HOUR = 3_600_000;

/** Monday of the week of a local date. */
function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const plusDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Shift length in hours (an end before the start goes past midnight). */
export function shiftHours(start: string, end: string) {
  let span = minutes(end) - minutes(start);
  if (span <= 0) {
    span += 24 * 60;
  }
  return span / 60;
}

const punchHours = (p: { in: number; out: number | null }, now: number) =>
  ((p.out ?? now) - p.in) / HOUR;

function hoursText(h: number) {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, "0")}` : `${whole}h`;
}

const clockTime = (ms: number, locale: string) =>
  new Date(ms).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/* ------------------------------- time clock ------------------------------ */

function ClockCard() {
  const t = useT();
  const locale = useLocale();
  const company = useCompany();
  const companies = useCompanies() ?? [];
  const open = usePosQuery(api.team.clock, {});
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const elsewhere =
    open && open.company !== company
      ? companies.find((c) => c.key === open.company)?.name
      : null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-5" name="IconClock" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {open
            ? t("No ponto desde {time}", { time: clockTime(open.in, locale) })
            : t("Você não está no ponto")}
        </p>
        <p className="text-muted-foreground text-sm">
          {open
            ? `${hoursText(punchHours({ in: open.in, out: null }, now))}${elsewhere ? ` · ${elsewhere}` : ""}`
            : t("Registre a entrada quando começar o turno.")}
        </p>
      </div>
      <button
        className={cn(
          "h-11 rounded-full px-6 font-medium text-sm disabled:opacity-50",
          open ? "bg-destructive text-white" : "bg-foreground text-background"
        )}
        disabled={busy || open === undefined}
        onClick={() =>
          run(() =>
            open
              ? sendPos(api.team.clockOut, {})
              : sendPos(api.team.clockIn, {
                  company,
                  date: dayKey(new Date()),
                  device: navigator.userAgent.slice(0, 80),
                })
          )
        }
        type="button"
      >
        {open ? t("Registrar saída") : t("Registrar entrada")}
      </button>
    </div>
  );
}

/* ---------------------------------- rota --------------------------------- */

const PRESETS = [
  ["10:00", "18:00"],
  ["12:00", "16:00"],
  ["17:00", "23:00"],
  ["18:00", "23:30"],
  ["18:00", "02:00"],
] as const;

interface Editing {
  person: Person;
  date: string;
  shift: Shift | null;
}

function ShiftSheet({
  editing,
  onClose,
}: {
  editing: Editing | null;
  onClose: () => void;
}) {
  const t = useT();
  const company = useCompany();
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("23:30");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setStart(editing?.shift?.start ?? "18:00");
    setEnd(editing?.shift?.end ?? "23:30");
    setNote(editing?.shift?.note ?? "");
  }, [editing]);
  if (!editing) {
    return null;
  }
  const save = async () => {
    setBusy(true);
    const ok = await sendPos(api.team.saveShift, {
      company,
      id: editing.shift?.id,
      userId: editing.person.id,
      date: editing.date,
      start,
      end,
      note: note || undefined,
    });
    setBusy(false);
    if (ok) {
      onClose();
    }
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic gap-0 rounded-t-3xl bg-popover sm:mx-auto sm:max-w-md"
        side="bottom"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle>{editing.person.name}</SheetTitle>
          <p className="text-muted-foreground text-sm">
            {new Date(`${editing.date}T12:00:00`).toLocaleDateString(
              undefined,
              { weekday: "long", day: "numeric", month: "long" }
            )}
          </p>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(([a, b]) => (
              <button
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm",
                  start === a && end === b
                    ? "bg-foreground text-background"
                    : "bg-muted"
                )}
                key={`${a}-${b}`}
                onClick={() => {
                  setStart(a);
                  setEnd(b);
                }}
                type="button"
              >
                {a}–{b}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="sh-start">
              {t("Entrada")}
              <Input
                id="sh-start"
                onChange={(e) => setStart(e.target.value)}
                type="time"
                value={start}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="sh-end">
              {t("Saída")}
              <Input
                id="sh-end"
                onChange={(e) => setEnd(e.target.value)}
                type="time"
                value={end}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="sh-note">
            {t("Observação")}
            <Input
              id="sh-note"
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Ex.: bar, cozinha, abertura")}
              value={note}
            />
          </label>
          <p className="text-muted-foreground text-sm">
            {hoursText(shiftHours(start, end))}
          </p>
          <div className="flex gap-2">
            {editing.shift ? (
              <button
                className="rounded-full px-4 py-2 text-destructive text-sm hover:bg-destructive/10"
                onClick={async () => {
                  if (editing.shift) {
                    await sendPos(api.team.deleteShift, {
                      id: editing.shift.id,
                    });
                    onClose();
                  }
                }}
                type="button"
              >
                {t("Apagar turno")}
              </button>
            ) : null}
            <button
              className="ml-auto rounded-full bg-foreground px-5 py-2 text-background text-sm disabled:opacity-50"
              disabled={busy}
              onClick={save}
              type="button"
            >
              {t("Salvar")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------------- view --------------------------------- */

export function TeamView() {
  const t = useT();
  const locale = useLocale();
  const company = useCompany();
  const { settings } = usePos();
  const now = useNow();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => plusDays(monday, i)),
    [monday]
  );
  const from = dayKey(monday);
  const to = dayKey(plusDays(monday, 6));
  const week = usePosQuery(api.team.week, { company, from, to }) as
    | Week
    | null
    | undefined;
  const today = dayKey(new Date());

  const stats = useMemo(() => {
    if (!week) {
      return null;
    }
    const planned = new Map<string, number>();
    for (const s of week.shifts) {
      planned.set(
        s.userId,
        (planned.get(s.userId) ?? 0) + shiftHours(s.start, s.end)
      );
    }
    const worked = new Map<string, number>();
    for (const p of week.punches) {
      worked.set(p.userId, (worked.get(p.userId) ?? 0) + punchHours(p, now));
    }
    const rate = new Map<string, number>(
      week.staff.map((s) => [s.id, s.hourlyRate ?? 0])
    );
    const sum = (m: Map<string, number>) =>
      [...m.values()].reduce((a, b) => a + b, 0);
    const cost = [...planned.keys(), ...worked.keys()]
      .filter((id, i, all) => all.indexOf(id) === i)
      .reduce(
        (a, id) =>
          a + (worked.get(id) ?? planned.get(id) ?? 0) * (rate.get(id) ?? 0),
        0
      );
    const sales = week.sales.reduce((a, d) => a + d.sales, 0);
    return {
      planned,
      worked,
      totalPlanned: sum(planned),
      totalWorked: sum(worked),
      cost,
      sales,
      share: sales > 0 ? (cost / sales) * 100 : null,
    };
  }, [week, now]);

  if (week === undefined) {
    return (
      <p className="p-8 text-center text-muted-foreground text-sm">
        {t("Carregando…")}
      </p>
    );
  }
  if (week === null) {
    return (
      <p className="p-8 text-center text-muted-foreground text-sm">
        {t("Sem acesso à equipe desta empresa.")}
      </p>
    );
  }
  const working = week.punches.filter((p) => p.out === null);
  const byId = new Map(week.staff.map((s) => [s.id, s]));
  const fmtDay = (d: Date) =>
    d.toLocaleDateString(locale, { weekday: "short", day: "numeric" });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      <ClockCard />

      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label={t("Semana anterior")}
          className="flex size-9 items-center justify-center rounded-full bg-muted"
          onClick={() => setMonday(plusDays(monday, -7))}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
        </button>
        <p className="min-w-40 text-center font-medium">
          {monday.toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
          })}
          {" – "}
          {plusDays(monday, 6).toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
          })}
        </p>
        <button
          aria-label={t("Próxima semana")}
          className="flex size-9 items-center justify-center rounded-full bg-muted"
          onClick={() => setMonday(plusDays(monday, 7))}
          type="button"
        >
          <Icon className="size-4" name="IconChevronRightSmall" />
        </button>
        <button
          className="rounded-full px-3 py-1.5 text-sm hover:bg-muted"
          onClick={() => setMonday(mondayOf(new Date()))}
          type="button"
        >
          {t("Hoje")}
        </button>
        {week.manager ? (
          <button
            className="ml-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm"
            onClick={() =>
              sendPos(api.team.copyWeek, {
                company,
                from: dayKey(plusDays(monday, -7)),
                to: from,
              })
            }
            type="button"
          >
            <Icon className="size-4" name="IconSquareBehindSquare1" />
            {t("Copiar semana anterior")}
          </button>
        ) : null}
      </div>

      {week.manager && stats ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            [t("Horas planejadas"), hoursText(stats.totalPlanned)],
            [t("Horas trabalhadas"), hoursText(stats.totalWorked)],
            [t("Custo de pessoal"), money(stats.cost, settings.currency)],
            [t("Vendas da semana"), money(stats.sales, settings.currency)],
            [
              t("Pessoal / vendas"),
              stats.share === null ? "—" : `${stats.share.toFixed(1)}%`,
            ],
          ].map(([label, value]) => (
            <div className="rounded-2xl border bg-card p-3" key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="mt-1 font-medium text-lg tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {week.manager && working.length > 0 ? (
        <div className="rounded-2xl border bg-card p-3">
          <p className="mb-2 font-medium text-sm">
            {t("Trabalhando agora")} ({working.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {working.map((p) => {
              const person = byId.get(p.userId);
              return (
                <span
                  className="flex items-center gap-2 rounded-full bg-muted py-1 pr-1 pl-3 text-sm"
                  key={p.id}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-success"
                  />
                  {person?.name ?? "—"} · {clockTime(p.in, locale)} (
                  {hoursText(punchHours(p, now))})
                  <button
                    className="rounded-full bg-background px-2 py-0.5 text-xs"
                    onClick={() =>
                      sendPos(api.team.fixPunch, {
                        id: p.id,
                        in: p.in,
                        out: Date.now(),
                      })
                    }
                    title={t("Encerrar o ponto desta pessoa")}
                    type="button"
                  >
                    {t("Encerrar")}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="w-48 px-3 py-2 text-left font-normal">
                {t("Equipe")} ({week.staff.length})
              </th>
              {days.map((d) => (
                <th
                  className={cn(
                    "px-2 py-2 text-left font-normal capitalize",
                    dayKey(d) === today && "text-foreground"
                  )}
                  key={dayKey(d)}
                >
                  {fmtDay(d)}
                </th>
              ))}
              <th className="w-24 px-3 py-2 text-right font-normal">
                {t("Horas")}
              </th>
            </tr>
          </thead>
          <tbody>
            {week.staff.map((person) => (
              <tr className="border-b align-top last:border-0" key={person.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-white text-xs"
                      style={{ background: person.color }}
                    >
                      {person.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate font-medium",
                          person.id === week.me && "text-brand"
                        )}
                      >
                        {person.name}
                      </p>
                      {person.jobTitle ? (
                        <p className="truncate text-muted-foreground text-xs">
                          {person.jobTitle}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const date = dayKey(d);
                  const shifts = week.shifts.filter(
                    (s) => s.userId === person.id && s.date === date
                  );
                  return (
                    <td
                      className={cn(
                        "px-1.5 py-1.5",
                        date === today && "bg-muted/40"
                      )}
                      key={date}
                    >
                      <div className="flex min-h-9 flex-col gap-1">
                        {shifts.map((s) => (
                          <button
                            className="rounded-lg border-l-4 bg-background px-2 py-1 text-left text-xs tabular-nums disabled:cursor-default"
                            disabled={!week.manager}
                            key={s.id}
                            onClick={() =>
                              setEditing({ person, date, shift: s })
                            }
                            style={{ borderLeftColor: person.color }}
                            title={s.note ?? undefined}
                            type="button"
                          >
                            {s.start}–{s.end}
                            {s.note ? (
                              <span className="block truncate text-muted-foreground">
                                {s.note}
                              </span>
                            ) : null}
                          </button>
                        ))}
                        {week.manager ? (
                          <button
                            aria-label={t("Adicionar turno")}
                            className="flex h-7 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                            onClick={() =>
                              setEditing({ person, date, shift: null })
                            }
                            type="button"
                          >
                            <Icon className="size-4" name="IconPlusSmall" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  <p>{hoursText(stats?.planned.get(person.id) ?? 0)}</p>
                  {week.manager ? (
                    <p className="text-muted-foreground">
                      {hoursText(stats?.worked.get(person.id) ?? 0)}{" "}
                      {t("feitas")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {week.staff.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t(
              "Ninguém trabalha nesta empresa ainda. Cadastre em Ajustes → Usuários."
            )}
          </p>
        ) : null}
      </div>
      <ShiftSheet editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
