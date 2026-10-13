"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type FerryTrip,
  maltaNow,
  nextTrip,
  ROUTES,
  timetableFor,
  toMinutes,
} from "@/lib/ferry";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Malta month and time, refreshed every 30 s (null until mounted). */
function useMaltaNow() {
  const [now, setNow] = useState<ReturnType<typeof maltaNow> | null>(null);
  useEffect(() => {
    const tick = () => setNow(maltaNow());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function waitLabel(minutes: number) {
  if (minutes < 1) {
    return "agora";
  }
  if (minutes < 60) {
    return `em ${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `em ${h} h ${m} min` : `em ${h} h`;
}

function RouteCard({
  from,
  to,
  trips,
  minutes,
}: {
  from: string;
  to: string;
  trips: FerryTrip[];
  minutes: number;
}) {
  const next = nextTrip(trips, minutes);
  const upcoming = trips[next];
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {from}
          <Icon
            className="size-4 text-muted-foreground"
            name="IconArrowRight"
          />
          {to}
        </CardTitle>
        <CardDescription>
          {upcoming
            ? `Próxima partida às ${upcoming.depart} (${waitLabel(
                toMinutes(upcoming.depart) - minutes
              )})`
            : `Sem mais partidas hoje. A primeira de amanhã é às ${trips[0]?.depart ?? "—"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="flex flex-col gap-1">
          {trips.map((t, i) => (
            <li
              className={cn(
                "grid grid-cols-[1fr_auto_1fr] items-center rounded-lg border px-3 py-2 tabular-nums",
                i === next && "border-foreground/40 bg-accent font-semibold",
                next !== -1 && i < next && "text-muted-foreground opacity-60",
                next === -1 && "text-muted-foreground opacity-60"
              )}
              key={t.depart}
            >
              <span>{t.depart}</span>
              <Icon
                className="size-4 text-muted-foreground"
                name="IconChevronRight"
              />
              <span className="text-right">{t.arrive}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function FerryPage() {
  const now = useMaltaNow();
  if (!now) {
    return null;
  }
  const table = timetableFor(now.month);
  const hh = String(Math.floor(now.minutes / 60)).padStart(2, "0");
  const mm = String(now.minutes % 60).padStart(2, "0");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon className="size-5" name="IconShip" />
        <span className="font-medium">Sliema ↔ Bugibba</span>
        <Badge variant="outline">
          Malta: {hh}:{mm} · {MONTHS[now.month - 1]}
        </Badge>
        {table ? (
          <Badge variant="secondary">Horário {table.label.toLowerCase()}</Badge>
        ) : null}
      </div>

      {table ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ROUTES.map((r) => (
            <RouteCard
              from={r.from}
              key={r.id}
              minutes={now.minutes}
              to={r.to}
              trips={table.trips[r.id]}
            />
          ))}
        </div>
      ) : (
        <Card className="py-6">
          <CardContent className="px-6 text-muted-foreground text-sm">
            Em {MONTHS[now.month - 1]} vale o horário de inverno (novembro a
            fevereiro), que ainda não foi cadastrado. Mande uma foto do horário
            de inverno para ele aparecer aqui.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
