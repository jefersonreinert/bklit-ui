"use client";

import { useRouter } from "next/navigation";
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
  addDays,
  dateKey,
  formatHours,
  fromKey,
  isDateKey,
  newId,
  PLACES,
  shiftMinutes,
  shiftsOn,
  type WorkShift,
  workStore,
} from "@/lib/work-schedule";
import { PlaceSelect } from "./place-ui";

const longDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Full page to edit one day's shifts (/escala/dia/YYYY-MM-DD). */
export function DayEditorPage({ dayKey }: { dayKey: string }) {
  const router = useRouter();
  const { shifts } = workStore.use();
  const places = PLACES;
  const valid = isDateKey(dayKey);
  const list = valid ? shiftsOn(shifts, dayKey) : [];
  const go = (key: string) => router.push(`/escala/dia/${key}`);

  const update = (id: string, patch: Partial<WorkShift>) =>
    workStore.update((s) => ({
      ...s,
      shifts: s.shifts.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const remove = (id: string) =>
    workStore.update((s) => ({
      ...s,
      shifts: s.shifts.filter((x) => x.id !== id),
    }));
  const add = () => {
    const last = list.at(-1);
    workStore.update((s) => ({
      ...s,
      shifts: [
        ...s.shifts,
        {
          id: newId(),
          date: dayKey,
          start: "09:00",
          end: "17:00",
          place: last?.place ?? places[0]?.id ?? "p1",
        },
      ],
    }));
  };
  const next = valid ? dateKey(addDays(fromKey(dayKey), 1)) : "";
  const prev = valid ? dateKey(addDays(fromKey(dayKey), -1)) : "";
  const copyToNextDay = () =>
    workStore.update((s) => ({
      ...s,
      shifts: [
        ...s.shifts.filter((x) => x.date !== next),
        ...list.map((x) => ({ ...x, id: newId(), date: next })),
      ],
    }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <Button
          onClick={() => router.push("/escala")}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar à escala
        </Button>
      </div>

      {valid ? (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base first-letter:uppercase">
                {longDate.format(fromKey(dayKey))}
              </CardTitle>
              <div className="flex shrink-0 gap-1">
                <Button
                  aria-label="Dia anterior"
                  onClick={() => go(prev)}
                  size="icon"
                  variant="outline"
                >
                  <Icon className="size-4" name="IconChevronLeft" />
                </Button>
                <Button
                  aria-label="Dia seguinte"
                  onClick={() => go(next)}
                  size="icon"
                  variant="outline"
                >
                  <Icon className="size-4" name="IconChevronRight" />
                </Button>
              </div>
            </div>
            <CardDescription>
              Horários e local de trabalho deste dia.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4">
            {list.length ? null : (
              <p className="text-muted-foreground text-sm">Folga.</p>
            )}
            {list.map((s) => (
              <div
                className="flex flex-col gap-3 rounded-lg border p-3"
                key={s.id}
              >
                <div className="flex flex-col gap-1 text-muted-foreground text-xs">
                  Local
                  <PlaceSelect
                    onChange={(id) => update(s.id, { place: id })}
                    places={places}
                    value={s.place}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex min-w-0 flex-col gap-1 text-muted-foreground text-xs">
                    Início
                    <Input
                      aria-label="Início"
                      className="w-full min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left"
                      onChange={(e) => update(s.id, { start: e.target.value })}
                      type="time"
                      value={s.start}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 text-muted-foreground text-xs">
                    Fim
                    <Input
                      aria-label="Fim"
                      className="w-full min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left"
                      onChange={(e) => update(s.id, { end: e.target.value })}
                      type="time"
                      value={s.end}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-muted-foreground text-xs">
                  Nota (opcional)
                  <Input
                    aria-label="Nota"
                    onChange={(e) => update(s.id, { note: e.target.value })}
                    placeholder="Ex.: abrir a loja"
                    value={s.note ?? ""}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    {formatHours(shiftMinutes(s))}
                  </span>
                  <Button
                    onClick={() => remove(s.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Icon className="size-4" name="IconTrashCan" />
                    Remover
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 sm:flex-1"
                onClick={add}
                variant="outline"
              >
                <Icon className="size-4" name="IconPlusSmall" />
                Adicionar turno
              </Button>
              {list.length ? (
                <Button
                  className="h-11 sm:flex-1"
                  onClick={copyToNextDay}
                  variant="ghost"
                >
                  Copiar para o dia seguinte
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">Data inválida.</p>
      )}
    </div>
  );
}
