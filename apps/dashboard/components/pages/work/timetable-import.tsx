"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import type { ExtractedTimetable } from "@/lib/server/extract";
import { callExtract, prepareFile, type UploadFile } from "@/lib/upload";
import {
  addDays,
  cleanTime,
  dateKey,
  fromKey,
  isDateKey,
  matchPlace,
  newId,
  PLACES,
  rowsToCSV,
  type WorkPlace,
  weekStart,
  workStore,
} from "@/lib/work-schedule";
import { PlaceMark, PlaceSelect } from "./place-ui";

const dayLabel = new Intl.DateTimeFormat(appLocale(), {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const SHEET = /\.(xlsx|xlsm)$/i;
const CSV = /\.(csv|tsv|txt)$/i;

const utf8Base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
};

/** Photos/PDFs as the AI reader expects; spreadsheets as CSV text. */
async function toUpload(file: File): Promise<UploadFile[]> {
  if (SHEET.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets
      .map((s) => rowsToCSV(s.data as unknown[][]))
      .filter(Boolean)
      .map((csv) => ({ data: utf8Base64(csv), mimeType: "text/csv" }));
  }
  if (CSV.test(file.name) || file.type.startsWith("text/")) {
    return [{ data: utf8Base64(await file.text()), mimeType: "text/csv" }];
  }
  const prepared = await prepareFile(file);
  return [{ data: prepared.data, mimeType: prepared.mimeType }];
}

interface Draft {
  id: string;
  include: boolean;
  date: string;
  start: string;
  end: string;
  place: string;
  raw: string;
  note: string;
}

/** A chosen file and the company its rota belongs to. */
interface Pick {
  id: string;
  file: File;
  place: string;
  /** The user picked the company: don't replace it with the AI's guess. */
  chosen: boolean;
}

interface FileResult {
  pick: string;
  place: string;
  name: string;
  notes: string;
}

/** Reads one file with the AI; its days go to the file's company. */
async function readPick(
  pick: Pick,
  opts: { aliases: string[]; week: string; places: WorkPlace[] }
): Promise<{ result: FileResult; days: Draft[] } | null> {
  const uploads = await toUpload(pick.file);
  if (!uploads.length) {
    return null;
  }
  const out = await callExtract<ExtractedTimetable>(
    "timetable",
    uploads,
    JSON.stringify({
      aliases: opts.aliases,
      weekStart: opts.week,
      places: opts.places.map((p) => `${p.name} (${p.area})`),
    })
  );
  const guessed = pick.chosen ? null : matchPlace(opts.places, out.placeGuess);
  const place = guessed?.id ?? pick.place;
  const days = out.shifts
    .filter((x) => isDateKey(x.date))
    .map((x) => {
      const start = cleanTime(x.start);
      return {
        id: `${pick.id}:${newId()}`,
        include: start !== "",
        date: x.date,
        start,
        end: cleanTime(x.end),
        place,
        raw: x.raw,
        note: x.note,
      };
    });
  return {
    result: { pick: pick.id, place, name: out.nameAsWritten, notes: out.notes },
    days,
  };
}

/** Next week's Monday on Sundays (the rota arrives then), else this week's. */
const defaultWeek = () => dateKey(weekStart(addDays(new Date(), 1)));

/* Native date/time inputs on iOS have a wide intrinsic size: let them shrink. */
const fieldClass =
  "min-w-0 w-full appearance-none [&::-webkit-date-and-time-value]:text-left";

/** Dedicated page (/escala/importar): read the company's rota with the AI. */
export function TimetableImportPage() {
  const router = useRouter();
  const { aliases } = workStore.use();
  const places = PLACES;
  const inputRef = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [week, setWeek] = useState(defaultWeek);
  const [closing, setClosing] = useState("23:00");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const reset = () => {
    setPicks([]);
    setResults([]);
    setDrafts([]);
    setError(null);
  };

  const addFiles = (list: File[]) => {
    const fallback = places[0]?.id ?? "p1";
    setPicks((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: newId(),
        file,
        // Guess from the file name ("vinomad.jpg"), else the first company
        place: matchPlace(places, file.name)?.id ?? fallback,
        chosen: false,
      })),
    ]);
    setResults([]);
    setDrafts([]);
  };

  /** Changing a file's company also moves its days already read. */
  const setPickPlace = (id: string, place: string) => {
    setPicks((list) =>
      list.map((p) => (p.id === id ? { ...p, place, chosen: true } : p))
    );
    setResults((list) =>
      list.map((r) => (r.pick === id ? { ...r, place } : r))
    );
    setDrafts((list) =>
      list.map((d) => (d.id.startsWith(`${id}:`) ? { ...d, place } : d))
    );
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const found: FileResult[] = [];
      const days: Draft[] = [];
      // One request per file: each file belongs to its own company
      for (const pick of picks) {
        const out = await readPick(pick, { aliases, week, places });
        if (!out) {
          continue;
        }
        if (out.result.place !== pick.place) {
          setPicks((list) =>
            list.map((p) =>
              p.id === pick.id ? { ...p, place: out.result.place } : p
            )
          );
        }
        found.push(out.result);
        days.push(...out.days);
      }
      if (!found.length) {
        throw new Error("Nenhum conteúdo encontrado nos arquivos.");
      }
      days.sort(
        (x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)
      );
      setResults(found);
      setDrafts(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na leitura.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (id: string, patch: Partial<Draft>) =>
    setDrafts((list) =>
      list.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );

  const chosen = drafts.filter((d) => d.include && d.start);
  const save = () => {
    const days = new Set(chosen.map((d) => d.date));
    workStore.update((s) => ({
      ...s,
      shifts: [
        ...s.shifts.filter((x) => !(replace && days.has(x.date))),
        ...chosen.map((d) => ({
          id: newId(),
          date: d.date,
          start: d.start,
          end: d.end || closing,
          place: d.place,
          note: d.note || (d.end ? "" : "Saída não informada na escala"),
        })),
      ],
    }));
    reset();
    router.push("/escala");
  };

  const placeShort = (id: string) =>
    places.find((p) => p.id === id)?.short ?? "Sem local";

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

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">
            Importar escala da empresa
          </CardTitle>
          <CardDescription>
            Foto (até escrita à mão), PDF, Excel ou CSV. Escolha a empresa de
            cada arquivo; a IA encontra o seu nome ({aliases.join(", ")}) e os
            seus horários.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4">
          <input
            accept="image/*,application/pdf,.pdf,.xlsx,.xlsm,.csv,.tsv,.txt"
            className="hidden"
            multiple
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />

          {picks.length ? (
            <ul className="flex flex-col gap-2">
              {picks.map((p) => (
                <li
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  key={p.id}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      name="IconFolder1"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.file.name}
                    </span>
                    <Button
                      aria-label={`Remover ${p.file.name}`}
                      onClick={() => {
                        setPicks((list) => list.filter((x) => x.id !== p.id));
                        setResults((list) =>
                          list.filter((r) => r.pick !== p.id)
                        );
                        setDrafts((list) =>
                          list.filter((d) => !d.id.startsWith(`${p.id}:`))
                        );
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Icon className="size-4" name="IconTrashCan" />
                    </Button>
                  </div>
                  <PlaceSelect
                    label={`Empresa de ${p.file.name}`}
                    onChange={(id) => setPickPlace(p.id, id)}
                    places={places}
                    value={p.place}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          <Button
            className="h-11"
            onClick={() => inputRef.current?.click()}
            variant="outline"
          >
            <Icon className="size-4" name="IconPlusSmall" />
            {picks.length
              ? "Adicionar outro arquivo"
              : "Escolher foto ou arquivo"}
          </Button>

          <div className="flex flex-col gap-1 text-muted-foreground text-xs">
            Semana (segunda-feira), se a escala não tiver datas
            <Input
              aria-label="Semana (segunda-feira)"
              className={fieldClass}
              onChange={(e) =>
                e.target.value &&
                setWeek(dateKey(weekStart(fromKey(e.target.value))))
              }
              type="date"
              value={week}
            />
          </div>

          <Button disabled={!picks.length || busy} onClick={read}>
            {busy ? (
              <Spinner />
            ) : (
              <Icon className="size-4" name="IconSparklesSoft" />
            )}
            {busy ? "Lendo a escala…" : "Ler escala com IA"}
          </Button>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {results.length ? (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Revisar turnos</CardTitle>
            <CardDescription>
              Confira e ajuste antes de adicionar à escala.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4">
            {results.map((r) => (
              <div className="flex flex-col gap-1 text-sm" key={r.pick}>
                <p className="flex items-center gap-2">
                  <PlaceMark id={r.place} places={places} />
                  <span className="font-medium">{placeShort(r.place)}</span>
                  <span className="text-muted-foreground">
                    {r.name
                      ? `· encontrei "${r.name}"`
                      : "· seu nome não está nesta escala"}
                  </span>
                </p>
                {r.notes ? (
                  <p className="text-muted-foreground text-xs">{r.notes}</p>
                ) : null}
              </div>
            ))}

            {drafts.map((d) => (
              <div
                className="flex flex-col gap-2 rounded-lg border p-3"
                key={d.id}
              >
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    aria-label={`Importar ${dayLabel.format(fromKey(d.date))}`}
                    checked={d.include}
                    disabled={!d.start}
                    onCheckedChange={(v) => edit(d.id, { include: v })}
                  />
                  <span className="font-medium first-letter:uppercase">
                    {dayLabel.format(fromKey(d.date))}
                  </span>
                  <PlaceMark id={d.place} places={places} />
                  <span className="ml-auto truncate text-muted-foreground text-xs">
                    “{d.raw}”
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex min-w-0 flex-col gap-1 text-muted-foreground text-xs">
                    Entrada
                    <Input
                      aria-label="Entrada"
                      className={fieldClass}
                      onChange={(e) =>
                        edit(d.id, {
                          start: e.target.value,
                          include: e.target.value !== "",
                        })
                      }
                      type="time"
                      value={d.start}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 text-muted-foreground text-xs">
                    Saída
                    <Input
                      aria-label="Saída"
                      className={fieldClass}
                      onChange={(e) => edit(d.id, { end: e.target.value })}
                      type="time"
                      value={d.end}
                    />
                  </div>
                </div>
                {d.note ? (
                  <p className="text-muted-foreground text-xs">{d.note}</p>
                ) : null}
              </div>
            ))}

            {drafts.some((d) => !d.end) ? (
              <div className="flex items-center gap-3 text-muted-foreground text-xs">
                <span className="flex-1">
                  Dias sem saída na escala (ex.: “18-”) terminam às
                </span>
                <Input
                  aria-label="Saída padrão"
                  className={`${fieldClass} w-32 shrink-0`}
                  onChange={(e) => setClosing(e.target.value || "23:00")}
                  type="time"
                  value={closing}
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3 text-sm">
              <Switch
                aria-label="Substituir os turnos já marcados nesses dias"
                checked={replace}
                onCheckedChange={setReplace}
              />
              Substituir os turnos já marcados nesses dias
            </div>

            <Button disabled={!chosen.length} onClick={save}>
              Adicionar {chosen.length}{" "}
              {chosen.length === 1 ? "turno" : "turnos"} à escala
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
