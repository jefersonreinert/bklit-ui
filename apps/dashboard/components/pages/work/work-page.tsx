"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  addDays,
  DEFAULT_ALIASES,
  dateKey,
  formatHours,
  fromKey,
  monthGrid,
  nextShift,
  PLACE_COLORS,
  PLACES,
  shiftMinutes,
  shiftState,
  shiftsOn,
  type WorkPlace,
  type WorkShift,
  weekStart,
  workStore,
} from "@/lib/work-schedule";
import { PlaceMark } from "./place-ui";
import { ClockCard, MonthReportCard } from "./time-clock";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const longDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** Current time, refreshed every 30 s (null until mounted). */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function placeOf(places: WorkPlace[], id: string) {
  const i = places.findIndex((p) => p.id === id);
  return {
    name: places[i]?.name ?? "Sem local",
    short: places[i]?.short ?? "Sem local",
    color: PLACE_COLORS[i] ?? "var(--muted-foreground)",
  };
}

/* --------------------------------- today --------------------------------- */

function badgeText(state: ReturnType<typeof shiftState>, s: WorkShift) {
  if (state === "now") {
    return "Agora";
  }
  if (state === "after") {
    return "Terminado";
  }
  return formatHours(shiftMinutes(s));
}

function TodayCard({
  now,
  shifts,
  places,
  onOpen,
}: {
  now: Date;
  shifts: WorkShift[];
  places: WorkPlace[];
  onOpen: (key: string) => void;
}) {
  const key = dateKey(now);
  const today = shiftsOn(shifts, key);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const next = nextShift(shifts, now);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardDescription className="first-letter:uppercase">
          Hoje · {longDate.format(now)}
        </CardDescription>
        <CardTitle className="text-xl">
          {today.length ? "Você trabalha hoje" : "Folga hoje"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {today.map((s) => {
          const place = placeOf(places, s.place);
          const state = shiftState(s, minutes);
          return (
            <button
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
                state === "now" && "border-foreground/40 bg-accent",
                state === "after" && "opacity-60"
              )}
              key={s.id}
              onClick={() => onOpen(key)}
              type="button"
            >
              <Icon className="size-5 shrink-0" name="IconClock" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-lg tabular-nums">
                  {s.start} – {s.end}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <PlaceMark id={s.place} places={places} />
                  {place.name}
                  {s.note ? ` · ${s.note}` : ""}
                </p>
              </div>
              <Badge variant={state === "now" ? "default" : "outline"}>
                {badgeText(state, s)}
              </Badge>
            </button>
          );
        })}
        {next && next.date !== key ? (
          <p className="text-muted-foreground text-sm">
            Próximo turno:{" "}
            <span className="text-foreground first-letter:uppercase">
              {shortDate.format(fromKey(next.date))}
            </span>
            , {next.start} – {next.end} em {placeOf(places, next.place).name}
          </p>
        ) : null}
        {today.length || next ? null : (
          <p className="text-muted-foreground text-sm">
            Nenhum turno marcado. Toque num dia do calendário para adicionar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- calendar -------------------------------- */

function MonthCalendar({
  month,
  setMonth,
  todayKey,
  selected,
  shifts,
  places,
  onOpen,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  todayKey: string;
  selected: string;
  shifts: WorkShift[];
  places: WorkPlace[];
  onOpen: (key: string) => void;
}) {
  const days = monthGrid(month);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-base first-letter:uppercase">
          {monthLabel.format(month)}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            aria-label="Mês anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronLeft" />
          </Button>
          <Button
            onClick={() => setMonth(new Date())}
            size="sm"
            variant="outline"
          >
            Hoje
          </Button>
          <Button
            aria-label="Próximo mês"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronRight" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-2 md:px-4">
        <div className="grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = dateKey(d);
            const list = shiftsOn(shifts, key);
            const outside = d.getMonth() !== month.getMonth();
            return (
              <button
                className={cn(
                  "flex min-h-16 flex-col items-stretch gap-0.5 rounded-md border p-1 text-left md:min-h-24",
                  outside && "opacity-40",
                  key === selected && "border-foreground/50",
                  key === todayKey && "bg-accent"
                )}
                key={key}
                onClick={() => onOpen(key)}
                type="button"
              >
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    key === todayKey && "font-bold"
                  )}
                >
                  {d.getDate()}
                </span>
                {list.map((s) => {
                  const place = placeOf(places, s.place);
                  return (
                    <span
                      className="flex items-center gap-1 truncate text-[10px] leading-tight md:text-xs"
                      key={s.id}
                    >
                      <PlaceMark id={s.place} places={places} />
                      <span className="truncate tabular-nums">
                        {s.start}
                        <span className="hidden md:inline">
                          {" "}
                          · {place.short}
                        </span>
                      </span>
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 px-2 text-muted-foreground text-xs">
          {places.map((p) => (
            <span className="flex items-center gap-1.5" key={p.id}>
              <PlaceMark id={p.id} places={places} />
              {p.short}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------- week ---------------------------------- */

function WeekTable({
  start,
  setStart,
  shifts,
  places,
  todayKey,
  onOpen,
}: {
  start: Date;
  setStart: (d: Date) => void;
  shifts: WorkShift[];
  places: WorkPlace[];
  todayKey: string;
  onOpen: (key: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  let total = 0;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-base">
          Semana de {shortDate.format(start)}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            aria-label="Semana anterior"
            onClick={() => setStart(addDays(start, -7))}
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronLeft" />
          </Button>
          <Button
            aria-label="Próxima semana"
            onClick={() => setStart(addDays(start, 7))}
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronRight" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs">
              <th className="py-2 font-normal">Dia</th>
              <th className="py-2 font-normal">Horário</th>
              <th className="py-2 font-normal">Local</th>
              <th className="py-2 text-right font-normal">Horas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const key = dateKey(d);
              const list = shiftsOn(shifts, key);
              const label = (
                <span
                  className={cn(
                    "first-letter:uppercase",
                    key === todayKey && "font-semibold"
                  )}
                >
                  {shortDate.format(d)}
                </span>
              );
              if (!list.length) {
                return (
                  <tr
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                    key={key}
                    onClick={() => onOpen(key)}
                  >
                    <td className="py-2">{label}</td>
                    <td className="py-2 text-muted-foreground" colSpan={3}>
                      Folga
                    </td>
                  </tr>
                );
              }
              return list.map((s, i) => {
                const place = placeOf(places, s.place);
                const mins = shiftMinutes(s);
                total += mins;
                return (
                  <tr
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                    key={s.id}
                    onClick={() => onOpen(key)}
                  >
                    <td className="py-2">{i === 0 ? label : null}</td>
                    <td className="py-2 tabular-nums">
                      {s.start} – {s.end}
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-1.5">
                        <PlaceMark id={s.place} places={places} />
                        {place.short}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatHours(mins)}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="text-muted-foreground">
              <td className="pt-3" colSpan={3}>
                Total da semana
              </td>
              <td className="pt-3 text-right text-foreground tabular-nums">
                {formatHours(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function PlacesCard({
  places,
  aliases,
}: {
  places: WorkPlace[];
  aliases: string[];
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Empresas e nome</CardTitle>
        <CardDescription>
          Os 3 lugares onde você trabalha e como o seu nome aparece nas escalas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 md:grid-cols-3">
        {places.map((p) => (
          <div
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
            key={p.id}
          >
            <PlaceMark className="size-6" id={p.id} places={places} />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{p.name}</p>
              <p className="truncate text-muted-foreground text-xs">{p.area}</p>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1 text-muted-foreground text-xs md:col-span-3">
          Seu nome na escala (separe por vírgulas)
          <Input
            aria-label="Seu nome na escala"
            defaultValue={aliases.join(", ")}
            onBlur={(e) => {
              const list = e.target.value
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean);
              workStore.update((st) => ({
                ...st,
                aliases: list.length ? list : DEFAULT_ALIASES,
              }));
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------- page ---------------------------------- */

export function WorkPage() {
  const now = useNow();
  const { shifts, punches, aliases } = workStore.use();
  const places = PLACES;
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date());
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [selected, setSelected] = useState("");

  if (!now) {
    return null;
  }
  const todayKey = dateKey(now);
  const openDay = (key: string) => {
    setSelected(key);
    setWeek(weekStart(fromKey(key)));
    router.push(`/escala/dia/${key}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <TodayCard now={now} onOpen={openDay} places={places} shifts={shifts} />
      <ClockCard now={now} places={places} punches={punches} shifts={shifts} />
      <Button
        className="h-11"
        onClick={() => router.push("/escala/importar")}
        variant="outline"
      >
        <Icon className="size-4" name="IconSparklesSoft" />
        Importar escala da empresa (foto, PDF ou Excel)
      </Button>
      <MonthCalendar
        month={month}
        onOpen={openDay}
        places={places}
        selected={selected}
        setMonth={setMonth}
        shifts={shifts}
        todayKey={todayKey}
      />
      <WeekTable
        onOpen={openDay}
        places={places}
        setStart={setWeek}
        shifts={shifts}
        start={week}
        todayKey={todayKey}
      />
      <MonthReportCard now={now} places={places} punches={punches} />
      <PlacesCard aliases={aliases} places={places} />
    </div>
  );
}
