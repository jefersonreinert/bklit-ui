"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
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
  rowsToCSV,
  type WorkPlace,
  weekStart,
  workStore,
} from "@/lib/work-schedule";
import { PlaceSelect } from "./place-ui";

const dayLabel = new Intl.DateTimeFormat("pt-BR", {
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

/** Next week's Monday on Sundays (the rota arrives then), else this week's. */
const defaultWeek = () => dateKey(weekStart(addDays(new Date(), 1)));

export function TimetableImport({
  open,
  onClose,
  places,
  aliases,
}: {
  open: boolean;
  onClose: () => void;
  places: WorkPlace[];
  aliases: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [week, setWeek] = useState(defaultWeek);
  const [place, setPlace] = useState(places[0]?.id ?? "p1");
  const [closing, setClosing] = useState("23:00");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedTimetable | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const reset = () => {
    setFiles([]);
    setResult(null);
    setDrafts([]);
    setError(null);
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const uploads = (await Promise.all(files.map(toUpload))).flat();
      if (!uploads.length) {
        throw new Error("Nenhum conteúdo encontrado no arquivo.");
      }
      const out = await callExtract<ExtractedTimetable>(
        "timetable",
        uploads,
        JSON.stringify({
          aliases,
          weekStart: week,
          places: places.map((p) => `${p.name} (${p.area})`),
        })
      );
      const guessed = matchPlace(places, out.placeGuess);
      const placeId = guessed?.id ?? place;
      if (guessed) {
        setPlace(guessed.id);
      }
      setResult(out);
      setDrafts(
        out.shifts
          .filter((s) => isDateKey(s.date))
          .map((s) => {
            const start = cleanTime(s.start);
            return {
              id: newId(),
              include: start !== "",
              date: s.date,
              start,
              end: cleanTime(s.end),
              place: placeId,
              raw: s.raw,
              note: s.note,
            };
          })
      );
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
    const dates = new Set(chosen.map((d) => d.date));
    workStore.update((s) => ({
      ...s,
      shifts: [
        ...s.shifts.filter((x) => !(replace && dates.has(x.date))),
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
    onClose();
  };

  return (
    <Sheet
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent className="overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Importar escala</SheetTitle>
          <SheetDescription>
            Foto (até escrita à mão), PDF, Excel ou CSV. A IA encontra o seu
            nome ({aliases.join(", ")}) e os seus horários.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          <input
            accept="image/*,application/pdf,.pdf,.xlsx,.xlsm,.csv,.tsv,.txt"
            className="hidden"
            multiple
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setResult(null);
              setDrafts([]);
              e.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
          <Button
            className="h-11"
            onClick={() => inputRef.current?.click()}
            variant="outline"
          >
            <Icon className="size-4" name="IconPlusSmall" />
            {files.length ? "Trocar arquivo" : "Escolher foto ou arquivo"}
          </Button>
          {files.length ? (
            <ul className="text-muted-foreground text-xs">
              {files.map((f) => (
                <li className="truncate" key={f.name}>
                  {f.name}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 text-muted-foreground text-xs">
              Semana (segunda)
              <Input
                aria-label="Semana (segunda-feira)"
                onChange={(e) =>
                  e.target.value &&
                  setWeek(dateKey(weekStart(fromKey(e.target.value))))
                }
                type="date"
                value={week}
              />
            </div>
            <div className="flex flex-col gap-1 text-muted-foreground text-xs">
              Local
              <PlaceSelect
                onChange={(id) => {
                  setPlace(id);
                  setDrafts((list) => list.map((d) => ({ ...d, place: id })));
                }}
                places={places}
                value={place}
              />
            </div>
          </div>

          <Button disabled={!files.length || busy} onClick={read}>
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

          {result ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                {result.nameAsWritten
                  ? `Encontrei "${result.nameAsWritten}"`
                  : "Não encontrei o seu nome nesta escala."}
                {result.placeGuess ? ` · ${result.placeGuess}` : ""}
              </p>
              {result.notes ? (
                <p className="text-muted-foreground text-xs">{result.notes}</p>
              ) : null}

              {drafts.map((d) => (
                <div
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  key={d.id}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={d.include}
                      disabled={!d.start}
                      onChange={(e) =>
                        edit(d.id, { include: e.target.checked })
                      }
                      type="checkbox"
                    />
                    <span className="font-medium first-letter:uppercase">
                      {dayLabel.format(fromKey(d.date))}
                    </span>
                    <span className="ml-auto text-muted-foreground text-xs">
                      “{d.raw}”
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      aria-label="Início"
                      onChange={(e) =>
                        edit(d.id, {
                          start: e.target.value,
                          include: e.target.value !== "",
                        })
                      }
                      type="time"
                      value={d.start}
                    />
                    <Input
                      aria-label="Fim"
                      onChange={(e) => edit(d.id, { end: e.target.value })}
                      placeholder={closing}
                      type="time"
                      value={d.end}
                    />
                    <PlaceSelect
                      className="col-span-2"
                      onChange={(id) => edit(d.id, { place: id })}
                      places={places}
                      value={d.place}
                    />
                  </div>
                  {d.note ? (
                    <p className="text-muted-foreground text-xs">{d.note}</p>
                  ) : null}
                </div>
              ))}

              {drafts.some((d) => !d.end) ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="flex-1">
                    Sem horário de saída na escala (ex.: “17-”): usar
                  </span>
                  <Input
                    aria-label="Saída padrão"
                    className="w-28"
                    onChange={(e) => setClosing(e.target.value || "23:00")}
                    type="time"
                    value={closing}
                  />
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                  type="checkbox"
                />
                Substituir os turnos já marcados nesses dias
              </label>

              <Button disabled={!chosen.length} onClick={save}>
                Adicionar {chosen.length}{" "}
                {chosen.length === 1 ? "turno" : "turnos"} à escala
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
