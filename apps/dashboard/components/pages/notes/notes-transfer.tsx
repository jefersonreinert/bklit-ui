"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import { downloadBlob, exportNotion } from "@/lib/notes/notion/export";
import {
  type ImportProgress,
  type ImportResult,
  importNotion,
} from "@/lib/notes/notion/import";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const ACCEPT = ".zip,.md,.markdown,.html,.htm,.csv,.txt";

const stamp = () => new Date().toISOString().slice(0, 10);

type Status =
  | { kind: "idle" }
  | { kind: "busy"; progress: ImportProgress }
  | { kind: "done"; result: ImportResult }
  | { kind: "error"; message: string };

function ImportCard({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const run = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setStatus({
      kind: "busy",
      progress: { done: 0, total: 1, label: "Lendo o arquivo…" },
    });
    try {
      const result = await importNotion(files, (progress) =>
        setStatus({ kind: "busy", progress })
      );
      setStatus({ kind: "done", result });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Não foi possível importar.",
      });
    }
  };
  const busy = status.kind === "busy";
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">Importar do Notion</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-sm">
        <li>
          No Notion, abra a página (ou Configurações → Exportar todo o
          workspace) e toque em <b>•••</b> → <b>Exportar</b>.
        </li>
        <li>
          Formato <b>Markdown e CSV</b> (ou <b>HTML</b> para trazer também
          ícones e capas), com <b>Incluir subpáginas</b> e “Tudo”.
        </li>
        <li>Envie aqui o .zip baixado, sem descompactar.</li>
      </ol>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: file drop zone; the input inside is the accessible control */}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          over && "border-[#d97757] bg-[#d97757]/5",
          busy && "pointer-events-none opacity-60"
        )}
        onDragLeave={() => setOver(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          run([...e.dataTransfer.files]);
        }}
      >
        <Icon className="size-7 text-muted-foreground" name="IconImport" />
        <span className="font-medium text-sm">Escolher o .zip do Notion</span>
        <span className="text-muted-foreground text-xs">
          Também aceita arquivos .md, .html e .csv soltos
        </span>
        <input
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          multiple
          onChange={(e) => {
            run([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
          type="file"
        />
      </label>
      <ImportStatus onOpen={onOpen} status={status} />
    </section>
  );
}

function ImportStatus({
  status,
  onOpen,
}: {
  status: Status;
  onOpen: (id: string) => void;
}) {
  if (status.kind === "busy") {
    const { done, total, label } = status.progress;
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="text-muted-foreground tabular-nums">
            {done}/{total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-[#d97757] transition-[width]"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <p className="rounded-2xl bg-destructive/10 p-3 text-destructive text-sm">
        {status.message}
      </p>
    );
  }
  if (status.kind === "done") {
    const { created, updated, files, rootId } = status.result;
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
        <Icon className="size-5 text-green-600" name="IconCheckmark1" />
        <span className="flex-1">
          {created} páginas novas
          {updated ? `, ${updated} atualizadas` : ""}
          {files ? ` e ${files} arquivos` : ""}.
        </span>
        {rootId ? (
          <Button onClick={() => onOpen(rootId)} size="sm">
            Abrir
          </Button>
        ) : null}
      </div>
    );
  }
  return null;
}

function ExportCard({
  notes,
  current,
}: {
  notes: Note[];
  current: Note | null;
}) {
  const [busy, setBusy] = useState<"all" | "page" | null>(null);
  const run = async (which: "all" | "page") => {
    setBusy(which);
    try {
      const { blob } = await exportNotion(
        notes,
        which === "page" && current ? [current.id] : undefined
      );
      const name =
        which === "page" && current ? current.title || "pagina" : "Notas";
      downloadBlob(blob, `${name} ${stamp()}.zip`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">Exportar para o Notion</h3>
      <p className="text-muted-foreground text-sm">
        Gera um .zip com as páginas em Markdown, subpáginas em pastas e as
        imagens e arquivos. No Notion:{" "}
        <b>Configurações → Importar → Texto e Markdown</b> e escolha o .zip.
        Também abre no Obsidian.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => run("all")}>
          {busy === "all" ? <Spinner className="size-4" /> : null}
          Exportar todas ({notes.length})
        </Button>
        {current ? (
          <Button
            disabled={busy !== null}
            onClick={() => run("page")}
            variant="outline"
          >
            {busy === "page" ? <Spinner className="size-4" /> : null}
            Só “{current.title}” e subpáginas
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** Notion import/export (also plain Markdown, HTML and CSV files). */
export function TransferSheet({
  open,
  onClose,
  notes,
  current,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  current: Note | null;
  onOpen: (id: string) => void;
}) {
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>Importar e exportar</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <ImportCard
            onOpen={(id) => {
              onOpen(id);
              onClose();
            }}
          />
          <hr className="border-border" />
          <ExportCard current={current} notes={notes} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
