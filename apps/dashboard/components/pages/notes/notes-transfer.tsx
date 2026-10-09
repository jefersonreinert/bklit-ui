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
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
  importNotion,
} from "@/lib/notes/notion/import";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { AssetPicker } from "./note-assets";
import { CoverPreview, NoteIcon } from "./note-hero";

const ACCEPT =
  ".zip,.md,.markdown,.html,.htm,.csv,.txt,image/*,video/*,audio/*,.pdf";
const OPTS_KEY = "cb:notes:import-opts";

function readOpts(): ImportOptions {
  try {
    return JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}") as ImportOptions;
  } catch {
    return {};
  }
}

function writeOpts(o: ImportOptions) {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {
    // private mode: choices last this session
  }
}

/** Icon + cover pickers for one group of pages. */
function LooksRow({
  label,
  icon,
  cover,
  onIcon,
  onCover,
}: {
  label: string;
  icon?: string;
  cover?: string;
  onIcon: (v: string | undefined) => void;
  onCover: (v: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <AssetPicker hasValue={Boolean(icon)} mode="icon" onPick={onIcon}>
        <button
          aria-label={`Ícone: ${label}`}
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-card text-3xl"
          type="button"
        >
          {icon ? (
            <NoteIcon icon={icon} />
          ) : (
            <Icon
              className="size-5 text-muted-foreground"
              name="IconEmojiGrinning"
            />
          )}
        </button>
      </AssetPicker>
      <AssetPicker hasValue={Boolean(cover)} mode="cover" onPick={onCover}>
        <button
          aria-label={`Capa: ${label}`}
          className="h-14 min-w-0 flex-1 overflow-hidden rounded-2xl border"
          type="button"
        >
          <CoverPreview
            className="flex size-full items-center justify-center"
            cover={cover}
          >
            {cover ? null : (
              <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Icon className="size-4" name="IconImages1" />
                Escolher capa
              </span>
            )}
          </CoverPreview>
        </button>
      </AssetPicker>
    </div>
  );
}

const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title);

/** Default icon/cover, database rows, and where the import goes. */
function ImportOptionsForm({
  opts,
  onChange,
  notes,
}: {
  opts: ImportOptions;
  onChange: (o: ImportOptions) => void;
  notes: Note[];
}) {
  const [rows, setRows] = useState(Boolean(opts.rowIcon || opts.rowCover));
  const set = (patch: Partial<ImportOptions>) =>
    onChange({ ...opts, ...patch });
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3">
      <p className="font-medium text-sm">Aparência das páginas criadas</p>
      <LooksRow
        cover={opts.cover}
        icon={opts.icon}
        label="todas as páginas"
        onCover={(cover) => set({ cover })}
        onIcon={(icon) => set({ icon })}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={rows}
          className="size-4 accent-[#d97757]"
          onChange={(e) => {
            setRows(e.target.checked);
            if (!e.target.checked) {
              set({ rowIcon: undefined, rowCover: undefined });
            }
          }}
          type="checkbox"
        />
        Ícone e capa próprios para itens de banco de dados
      </label>
      {rows ? (
        <LooksRow
          cover={opts.rowCover}
          icon={opts.rowIcon}
          label="itens de banco de dados"
          onCover={(rowCover) => set({ rowCover })}
          onIcon={(rowIcon) => set({ rowIcon })}
        />
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={Boolean(opts.override)}
          className="size-4 accent-[#d97757]"
          onChange={(e) => set({ override: e.target.checked })}
          type="checkbox"
        />
        Substituir também os ícones e capas que vieram do Notion
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Importar dentro de</span>
        <select
          className="h-10 rounded-xl border bg-card px-3"
          onChange={(e) => set({ parentId: e.target.value || null })}
          value={opts.parentId ?? ""}
        >
          <option value="">Início (páginas no topo)</option>
          {[...notes].sort(byTitle).map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const stamp = () => new Date().toISOString().slice(0, 10);

type Status =
  | { kind: "idle" }
  | { kind: "busy"; progress: ImportProgress }
  | { kind: "done"; result: ImportResult }
  | { kind: "error"; message: string };

function ImportCard({
  onOpen,
  notes,
}: {
  onOpen: (id: string) => void;
  notes: Note[];
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [opts, setOpts] = useState<ImportOptions>(readOpts);
  const changeOpts = (o: ImportOptions) => {
    setOpts(o);
    writeOpts(o);
  };
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
      const parentOk = notes.some((n) => n.id === opts.parentId);
      const result = await importNotion(
        files,
        (progress) => setStatus({ kind: "busy", progress }),
        { ...opts, parentId: parentOk ? opts.parentId : null }
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
      <ImportOptionsForm notes={notes} onChange={changeOpts} opts={opts} />
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
          Também aceita .md, .html, .csv (banco de dados), imagens, vídeos,
          áudios e PDFs soltos — cada um vira uma página
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
            notes={notes}
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
