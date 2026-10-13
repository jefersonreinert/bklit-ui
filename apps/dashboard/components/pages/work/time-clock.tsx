"use client";

import { useState } from "react";
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
import {
  clockTime,
  dateKey,
  formatHours,
  fromKey,
  monthKey,
  monthReport,
  newId,
  openPunch,
  PLACE_COLORS,
  punchMinutes,
  reportCSV,
  reportText,
  shiftState,
  shiftsOn,
  type WorkPlace,
  type WorkPunch,
  type WorkShift,
  workStore,
} from "@/lib/work-schedule";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const dayLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function Dot({ places, id }: { places: WorkPlace[]; id: string }) {
  const i = places.findIndex((p) => p.id === id);
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full border border-foreground/20"
      style={{ background: PLACE_COLORS[i] ?? "var(--muted-foreground)" }}
    />
  );
}

/** Place of the shift running now or next today, else the first place. */
function suggestedPlace(
  shifts: WorkShift[],
  places: WorkPlace[],
  now: Date
): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = shiftsOn(shifts, dateKey(now)).filter(
    (s) => shiftState(s, minutes) !== "after"
  );
  return today[0]?.place ?? places[0]?.id ?? "p1";
}

const updatePunch = (id: string, patch: Partial<WorkPunch>) =>
  workStore.update((s) => ({
    ...s,
    punches: s.punches.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));

/* ------------------------------ clock in/out ----------------------------- */

export function ClockCard({
  now,
  places,
  shifts,
  punches,
}: {
  now: Date;
  places: WorkPlace[];
  shifts: WorkShift[];
  punches: WorkPunch[];
}) {
  const open = openPunch(punches);
  const [picked, setPicked] = useState("");
  const place = picked || suggestedPlace(shifts, places, now);
  const placeName = (id: string) =>
    places.find((p) => p.id === id)?.name ?? "Sem local";

  const clockIn = () =>
    workStore.update((s) => ({
      ...s,
      punches: [
        ...s.punches,
        {
          id: newId(),
          date: dateKey(new Date()),
          in: clockTime(new Date()),
          out: null,
          place,
        },
      ],
    }));
  const clockOut = () => {
    if (open) {
      updatePunch(open.id, { out: clockTime(new Date()) });
    }
  };

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-5" name="IconClock" />
          Ponto
        </CardTitle>
        <CardDescription>
          {open
            ? `Trabalhando desde as ${open.in} em ${placeName(open.place)} · ${formatHours(punchMinutes(open, now))}`
            : "Registre a entrada quando começar a trabalhar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 sm:flex-row">
        {open ? (
          <Button className="h-11 sm:flex-1" onClick={clockOut}>
            <Icon className="size-4" name="IconClock" />
            Registrar saída ({clockTime(now)})
          </Button>
        ) : (
          <>
            <select
              aria-label="Local"
              className={`${selectClass} h-11 sm:max-w-56`}
              onChange={(e) => setPicked(e.target.value)}
              value={place}
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button className="h-11 sm:flex-1" onClick={clockIn}>
              <Icon className="size-4" name="IconClock" />
              Registrar entrada ({clockTime(now)})
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------- monthly report ----------------------------- */

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function shareText(title: string, text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "Compartilhado.";
    } catch {
      // Cancelled: fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "Resumo copiado. Cole na mensagem ou no e-mail para a empresa.";
  } catch {
    return "Não foi possível copiar.";
  }
}

function PunchRow({
  punch,
  places,
}: {
  punch: WorkPunch;
  places: WorkPlace[];
}) {
  const [editing, setEditing] = useState(false);
  const place = places.find((p) => p.id === punch.place);
  if (editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="py-2" colSpan={5}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <Input
              aria-label="Data"
              onChange={(e) =>
                e.target.value &&
                updatePunch(punch.id, { date: e.target.value })
              }
              type="date"
              value={punch.date}
            />
            <select
              aria-label="Local"
              className={selectClass}
              onChange={(e) => updatePunch(punch.id, { place: e.target.value })}
              value={punch.place}
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="Entrada"
              onChange={(e) => updatePunch(punch.id, { in: e.target.value })}
              type="time"
              value={punch.in}
            />
            <Input
              aria-label="Saída"
              onChange={(e) => updatePunch(punch.id, { out: e.target.value })}
              type="time"
              value={punch.out ?? ""}
            />
            <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
              <Button
                aria-label="Apagar registro"
                onClick={() =>
                  workStore.update((s) => ({
                    ...s,
                    punches: s.punches.filter((p) => p.id !== punch.id),
                  }))
                }
                size="icon-sm"
                variant="ghost"
              >
                <Icon className="size-4" name="IconTrashCan" />
              </Button>
              <Button onClick={() => setEditing(false)} size="sm">
                OK
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr
      className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
      onClick={() => setEditing(true)}
    >
      <td className="py-2 first-letter:uppercase">
        {dayLabel.format(fromKey(punch.date))}
      </td>
      <td className="py-2">
        <span className="flex items-center gap-1.5">
          <Dot id={punch.place} places={places} />
          <span className="truncate">{place?.name ?? "Sem local"}</span>
        </span>
      </td>
      <td className="py-2 tabular-nums">{punch.in}</td>
      <td className="py-2 tabular-nums">{punch.out}</td>
      <td className="py-2 text-right tabular-nums">
        {formatHours(punchMinutes(punch))}
      </td>
    </tr>
  );
}

export function MonthReportCard({
  now,
  places,
  punches,
}: {
  now: Date;
  places: WorkPlace[];
  punches: WorkPunch[];
}) {
  const [month, setMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1)
  );
  const [message, setMessage] = useState<string | null>(null);
  const key = monthKey(month);
  const report = monthReport(punches, places, key);
  const title = `Horas trabalhadas · ${monthLabel.format(month)}`;
  const shift = (n: number) => {
    setMessage(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  };
  const addManual = () =>
    workStore.update((s) => ({
      ...s,
      punches: [
        ...s.punches,
        {
          id: newId(),
          date: key === monthKey(now) ? dateKey(now) : `${key}-01`,
          in: "09:00",
          out: "17:00",
          place: places[0]?.id ?? "p1",
        },
      ],
    }));

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <div>
          <CardTitle className="text-base first-letter:uppercase">
            Ponto de {monthLabel.format(month)}
          </CardTitle>
          <CardDescription>
            Toque num registro para corrigir ou apagar.
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <Button
            aria-label="Mês anterior"
            onClick={() => shift(-1)}
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronLeft" />
          </Button>
          <Button
            aria-label="Próximo mês"
            onClick={() => shift(1)}
            size="icon-sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconChevronRight" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {report.byPlace.map((t, i) => (
            <div className="rounded-lg border px-3 py-2" key={t.place.id}>
              <p className="flex items-center gap-1.5 truncate text-muted-foreground text-xs">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: PLACE_COLORS[i] }}
                />
                {t.place.name}
              </p>
              <p className="font-semibold tabular-nums">
                {formatHours(t.minutes)}
              </p>
              <p className="text-muted-foreground text-xs">
                {t.days} {t.days === 1 ? "dia" : "dias"}
              </p>
            </div>
          ))}
          <div className="rounded-lg border bg-accent px-3 py-2">
            <p className="text-muted-foreground text-xs">Total do mês</p>
            <p className="font-semibold tabular-nums">
              {formatHours(report.minutes)}
            </p>
            <p className="text-muted-foreground text-xs">
              {report.days} {report.days === 1 ? "dia" : "dias"}
            </p>
          </div>
        </div>

        {report.rows.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs">
                <th className="py-2 font-normal">Dia</th>
                <th className="py-2 font-normal">Local</th>
                <th className="py-2 font-normal">Entrada</th>
                <th className="py-2 font-normal">Saída</th>
                <th className="py-2 text-right font-normal">Horas</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((p) => (
                <PunchRow key={p.id} places={places} punch={p} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nenhum registro de ponto neste mês.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={addManual} size="sm" variant="outline">
            <Icon className="size-4" name="IconPlusSmall" />
            Adicionar registro
          </Button>
          <Button
            disabled={!report.rows.length}
            onClick={() =>
              download(`horas-${key}.csv`, reportCSV(report, places))
            }
            size="sm"
            variant="outline"
          >
            Baixar planilha (CSV)
          </Button>
          <Button
            disabled={!report.rows.length}
            onClick={async () =>
              setMessage(
                await shareText(title, reportText(report, places, title))
              )
            }
            size="sm"
          >
            Enviar resumo
          </Button>
        </div>
        {message ? (
          <output className="block text-muted-foreground text-xs">
            {message}
          </output>
        ) : null}
      </CardContent>
    </Card>
  );
}
