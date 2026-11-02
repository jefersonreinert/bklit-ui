"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { baseName, formatBytes } from "@/lib/files/kinds";
import { blobToBase64 } from "@/lib/files/scan";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { callExtract } from "@/lib/upload";
import { Markdown } from "../ai/markdown";
import { downloadText, downloadUrl, KIND_LABEL } from "./files-shared";

/** Opens a file: photo, video, audio, PDF, or the sheet editor. */

const SAVE_DELAY = 800;
const OCR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

type Doc = NonNullable<ReturnType<typeof useDocFile>>;

function useDocFile(id: Id<"docFiles">) {
  return useQuery(api.files.getFile, { id });
}

/** Text of a stored photo/PDF via /api/extract/scan, saved as a sheet. */
export async function scanToText(files: { data: string; mimeType: string }[]) {
  const body = await callExtract<{ title?: string; text?: string }>(
    "scan",
    files
  );
  return { title: body.title ?? "", text: body.text ?? "" };
}

async function sheetPdf(name: string, text: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight() - margin;
  pdf.setFontSize(11);
  let y = margin;
  for (const line of pdf.splitTextToSize(text || " ", width) as string[]) {
    if (y > height) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 15;
  }
  pdf.save(`${name}.pdf`);
}

function SheetEditor({ file }: { file: Doc }) {
  const update = useMutation(api.files.updateFile);
  const [text, setText] = useState(file.text);
  const [mode, setMode] = useState<"edit" | "view">(
    file.text ? "view" : "edit"
  );
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const onChange = (value: string) => {
    setText(value);
    setSaved(false);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(async () => {
      await update({ id: file.id, text: value });
      setSaved(true);
    }, SAVE_DELAY);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["edit", "Editar"],
              ["view", "Ver"],
            ] as const
          ).map(([m, label]) => (
            <button
              className={`rounded-md px-3 py-1 ${mode === m ? "bg-muted font-semibold" : ""}`}
              key={m}
              onClick={() => setMode(m)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">
          {saved ? "Salvo" : "A salvar…"}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            onClick={() => navigator.clipboard.writeText(text)}
            size="sm"
            variant="ghost"
          >
            Copiar
          </Button>
          <Button
            onClick={() => downloadText(text, `${baseName(file.name)}.md`)}
            size="sm"
            variant="ghost"
          >
            .md
          </Button>
          <Button
            onClick={() =>
              downloadText(text, `${baseName(file.name)}.txt`, "text/plain")
            }
            size="sm"
            variant="ghost"
          >
            .txt
          </Button>
          <Button
            onClick={() => sheetPdf(baseName(file.name), text)}
            size="sm"
            variant="ghost"
          >
            PDF
          </Button>
        </div>
      </div>
      {mode === "edit" ? (
        <Textarea
          aria-label="Texto da folha"
          className="min-h-[50dvh] flex-1 font-mono text-sm"
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escreva aqui. Use # para títulos, - para listas, | para tabelas."
          value={text}
        />
      ) : (
        <div className="min-h-[50dvh] flex-1 overflow-y-auto rounded-xl border bg-background p-4 text-sm">
          {text ? (
            <Markdown text={text} />
          ) : (
            <p className="text-muted-foreground">Folha vazia.</p>
          )}
        </div>
      )}
      {file.sources.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Digitalização original ({file.sources.length})
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {file.sources.map((src, i) => (
              <a href={src} key={src} rel="noreferrer" target="_blank">
                {/* biome-ignore lint/performance/noImgElement: scan pages from Convex storage */}
                <img
                  alt={`Página ${i + 1}`}
                  className="w-full rounded-lg border"
                  height={300}
                  src={src}
                  width={220}
                />
              </a>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function MediaView({ file }: { file: Doc }) {
  if (!file.url) {
    return null;
  }
  if (file.kind === "image") {
    return (
      <a
        className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-muted/30"
        href={file.url}
        rel="noreferrer"
        target="_blank"
      >
        {/* biome-ignore lint/performance/noImgElement: user upload, any size */}
        <img
          alt={file.name}
          className="max-h-[70dvh] w-auto max-w-full object-contain"
          height={800}
          src={file.url}
          width={800}
        />
      </a>
    );
  }
  if (file.kind === "video") {
    return (
      <video
        className="max-h-[70dvh] w-full rounded-xl bg-black"
        controls
        playsInline
        src={file.url}
      >
        <track kind="captions" />
      </video>
    );
  }
  if (file.kind === "audio") {
    return (
      <audio className="w-full" controls src={file.url}>
        <track kind="captions" />
      </audio>
    );
  }
  if (file.kind === "pdf") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <object
          className="min-h-[65dvh] w-full flex-1 rounded-xl border"
          data={file.url}
          type="application/pdf"
        >
          <p className="p-4 text-sm">
            O navegador não mostra PDFs aqui.{" "}
            <a
              className="underline"
              href={file.url}
              rel="noreferrer"
              target="_blank"
            >
              Abrir o PDF
            </a>
          </p>
        </object>
      </div>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      Sem pré-visualização para este tipo de arquivo. Use “Baixar”.
    </p>
  );
}

function ToTextButton({
  file,
  onDone,
}: {
  file: Doc;
  onDone: (id: Id<"docFiles">) => void;
}) {
  const createSheet = useMutation(api.files.createSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!(file.url && OCR_TYPES.has(file.mimeType))) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const blob = await (await fetch(file.url as string)).blob();
            const out = await scanToText([
              { data: await blobToBase64(blob), mimeType: file.mimeType },
            ]);
            onDone(
              await createSheet({
                name: out.title || `${baseName(file.name)} (texto)`,
                folderId: file.folderId ?? undefined,
                text: out.text,
              })
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falhou.");
          } finally {
            setBusy(false);
          }
        }}
        size="sm"
        variant="outline"
      >
        <Icon className="size-4" name="IconScanTextSparkle" />
        {busy ? "A ler o texto…" : "Converter em texto (folha)"}
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function FileViewer({
  id,
  onClose,
}: {
  id: Id<"docFiles">;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(id);
  const file = useDocFile(current);
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent className="w-full gap-3 overflow-y-auto p-4 data-[side=right]:w-full data-[side=right]:md:w-[760px] data-[side=right]:md:max-w-[760px]">
        <SheetHeader className="p-0 pr-8">
          <SheetTitle className="break-all">{file?.name ?? "…"}</SheetTitle>
          <SheetDescription>
            {file
              ? `${KIND_LABEL[file.kind]} · ${formatBytes(file.size)} · ${new Date(file.updatedAt).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </SheetDescription>
        </SheetHeader>
        {file === null ? (
          <p className="text-muted-foreground text-sm">
            Arquivo não encontrado.
          </p>
        ) : null}
        {file && file.kind === "sheet" ? (
          <SheetEditor file={file} key={file.id} />
        ) : null}
        {file && file.kind !== "sheet" ? (
          <>
            <MediaView file={file} />
            <div className="flex flex-wrap gap-2">
              {file.url ? (
                <Button
                  onClick={() => file.url && downloadUrl(file.url, file.name)}
                  size="sm"
                >
                  <Icon className="size-4" name="IconArrowDown" />
                  Baixar
                </Button>
              ) : null}
              <ToTextButton file={file} onDone={setCurrent} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
