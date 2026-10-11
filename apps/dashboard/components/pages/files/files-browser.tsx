"use client";

import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FOLDER_COLORS, formatBytes } from "@/lib/files/kinds";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FileViewer } from "./file-viewer";
import {
  downloadUrl,
  type FileItem,
  FileThumb,
  FolderGlyph,
  type FolderId,
  type FolderItem,
  KIND_LABEL,
  useUploader,
} from "./files-shared";
import { Scanner } from "./scanner";

/**
 * Documentos → Arquivos: folder widgets and file cards, with create,
 * rename, color, move, delete, upload (any type), phone scan and sheets.
 */

type Ask =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; folder: FolderItem }
  | { kind: "rename-file"; file: FileItem }
  | { kind: "move-file"; file: FileItem }
  | { kind: "move-folder"; folder: FolderItem }
  | { kind: "new-sheet" }
  | { kind: "delete-folder"; folder: FolderItem }
  | { kind: "delete-file"; file: FileItem };

function NameSheet({
  title,
  initial,
  confirm,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  confirm: string;
  onSave: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="mx-auto max-w-md rounded-t-2xl p-4"
        side="bottom"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await onSave(name);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Falhou.");
            }
          }}
        >
          <Input
            aria-label="Nome"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            value={name}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button disabled={!name.trim()} type="submit">
              {confirm}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MoveSheet({
  title,
  exclude,
  onMove,
  onClose,
}: {
  title: string;
  exclude?: string;
  onMove: (target: FolderId | null) => Promise<unknown>;
  onClose: () => void;
}) {
  const folders = useQuery(api.files.allFolders, {});
  const [error, setError] = useState<string | null>(null);
  const go = async (target: FolderId | null) => {
    try {
      await onMove(target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    }
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="mx-auto max-h-[70dvh] max-w-md rounded-t-2xl p-4"
        side="bottom"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Escolha a pasta
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col overflow-y-auto">
          <li>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
              onClick={() => go(null)}
              type="button"
            >
              <Icon className="size-4" name="IconFolders" />
              Início (raiz)
            </button>
          </li>
          {(folders ?? [])
            .filter((f) => f.id !== exclude)
            .map((f) => (
              <li key={f.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => go(f.id)}
                  type="button"
                >
                  <Icon className="size-4" name="IconFolder1" />
                  {f.label}
                </button>
              </li>
            ))}
        </ul>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemMenu({ children, label }: { children: ReactNode; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={label}
            className="absolute top-1 right-1 bg-background/80 backdrop-blur"
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" name="IconDotGrid1x3Horizontal" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderCard({
  folder,
  onOpen,
  onAsk,
}: {
  folder: FolderItem;
  onOpen: () => void;
  onAsk: (a: Ask) => void;
}) {
  const update = useMutation(api.files.updateFolder);
  return (
    <div className="group relative">
      <button
        className="flex w-full flex-col items-center gap-1 rounded-2xl p-2 text-center hover:bg-muted/60"
        onClick={onOpen}
        type="button"
      >
        <FolderGlyph className="size-16" color={folder.color} />
        <span className="line-clamp-2 w-full break-words font-medium text-sm">
          {folder.name}
        </span>
        <span className="text-muted-foreground text-xs">
          {folder.count} {folder.count === 1 ? "item" : "itens"}
        </span>
      </button>
      <ItemMenu label={`Opções da pasta ${folder.name}`}>
        <DropdownMenuItem onClick={onOpen}>Abrir</DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onAsk({ kind: "rename-folder", folder })}
        >
          Renomear
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onAsk({ kind: "move-folder", folder })}
        >
          Mover para…
        </DropdownMenuItem>
        <div className="flex gap-1 px-2 py-1.5">
          {FOLDER_COLORS.map((c) => (
            <button
              aria-label={`Cor ${c}`}
              className={cn(
                "size-5 rounded-full ring-offset-1",
                folder.color === c && "ring-2 ring-foreground"
              )}
              key={c}
              onClick={() => update({ id: folder.id, color: c })}
              style={{ background: c }}
              type="button"
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onAsk({ kind: "delete-folder", folder })}
          variant="destructive"
        >
          Apagar pasta
        </DropdownMenuItem>
      </ItemMenu>
    </div>
  );
}

function FileCard({
  file,
  onOpen,
  onAsk,
}: {
  file: FileItem;
  onOpen: () => void;
  onAsk: (a: Ask) => void;
}) {
  return (
    <div className="relative">
      <button
        className="flex w-full flex-col gap-1 rounded-2xl p-1.5 text-left hover:bg-muted/60"
        onClick={onOpen}
        type="button"
      >
        <FileThumb file={file} />
        <span className="line-clamp-2 break-all font-medium text-xs">
          {file.name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {KIND_LABEL[file.kind]} · {formatBytes(file.size)}
        </span>
      </button>
      <ItemMenu label={`Opções de ${file.name}`}>
        <DropdownMenuItem onClick={onOpen}>Abrir</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAsk({ kind: "rename-file", file })}>
          Renomear
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAsk({ kind: "move-file", file })}>
          Mover para…
        </DropdownMenuItem>
        {file.url ? (
          <DropdownMenuItem
            onClick={() => file.url && downloadUrl(file.url, file.name)}
          >
            Baixar
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onAsk({ kind: "delete-file", file })}
          variant="destructive"
        >
          Apagar
        </DropdownMenuItem>
      </ItemMenu>
    </div>
  );
}

function Toolbar({
  onNewFolder,
  onUpload,
  onScan,
  onNewSheet,
}: {
  onNewFolder: () => void;
  onUpload: () => void;
  onScan: () => void;
  onNewSheet: () => void;
}) {
  const actions = [
    {
      label: "Nova pasta",
      icon: "IconFolderAddRight" as const,
      onClick: onNewFolder,
    },
    { label: "Carregar", icon: "IconFolderUpload" as const, onClick: onUpload },
    { label: "Digitalizar", icon: "IconCamera1" as const, onClick: onScan },
    {
      label: "Nova folha",
      icon: "IconPageTextAdd" as const,
      onClick: onNewSheet,
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
      {actions.map((a) => (
        <button
          className="flex flex-col items-center gap-1 rounded-2xl border bg-background px-3 py-2.5 text-xs hover:bg-muted sm:flex-row sm:gap-2 sm:text-sm"
          key={a.label}
          onClick={a.onClick}
          type="button"
        >
          <Icon className="size-5" name={a.icon} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

function Breadcrumb({
  path,
  onGo,
}: {
  path: { id: FolderId; name: string }[];
  onGo: (id: FolderId | undefined) => void;
}) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <button
        className={cn(
          "rounded-md px-1.5 py-0.5 hover:bg-muted",
          path.length === 0 && "font-semibold"
        )}
        onClick={() => onGo(undefined)}
        type="button"
      >
        Arquivos
      </button>
      {path.map((p, i) => (
        <span className="flex items-center gap-1" key={p.id}>
          <Icon
            className="size-3.5 text-muted-foreground"
            name="IconChevronRight"
          />
          <button
            className={cn(
              "max-w-40 truncate rounded-md px-1.5 py-0.5 hover:bg-muted",
              i === path.length - 1 && "font-semibold"
            )}
            onClick={() => onGo(p.id)}
            type="button"
          >
            {p.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function ConfirmSheet({
  title,
  detail,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="mx-auto max-w-md rounded-t-2xl p-4"
        side="bottom"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{detail}</SheetDescription>
        </SheetHeader>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              onClose();
            }}
            variant="destructive"
          >
            {busy ? "A apagar…" : "Apagar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Asks({
  ask,
  folderId,
  onClose,
  onOpenFile,
}: {
  ask: Ask | null;
  folderId: FolderId | undefined;
  onClose: () => void;
  onOpenFile: (id: Id<"docFiles">) => void;
}) {
  const createFolder = useMutation(api.files.createFolder);
  const updateFolder = useMutation(api.files.updateFolder);
  const updateFile = useMutation(api.files.updateFile);
  const createSheet = useMutation(api.files.createSheet);
  const deleteFolder = useMutation(api.files.deleteFolder);
  const deleteFile = useMutation(api.files.deleteFile);
  if (!ask) {
    return null;
  }
  switch (ask.kind) {
    case "new-folder":
      return (
        <NameSheet
          confirm="Criar"
          initial="Nova pasta"
          onClose={onClose}
          onSave={(name) =>
            createFolder({
              name,
              parentId: folderId,
              color: FOLDER_COLORS[0],
            })
          }
          title="Nova pasta"
        />
      );
    case "new-sheet":
      return (
        <NameSheet
          confirm="Criar"
          initial="Nova folha"
          onClose={onClose}
          onSave={async (name) =>
            onOpenFile(await createSheet({ name, folderId, text: "" }))
          }
          title="Nova folha"
        />
      );
    case "rename-folder":
      return (
        <NameSheet
          confirm="Salvar"
          initial={ask.folder.name}
          onClose={onClose}
          onSave={(name) => updateFolder({ id: ask.folder.id, name })}
          title="Renomear pasta"
        />
      );
    case "rename-file":
      return (
        <NameSheet
          confirm="Salvar"
          initial={ask.file.name}
          onClose={onClose}
          onSave={(name) => updateFile({ id: ask.file.id, name })}
          title="Renomear"
        />
      );
    case "move-file":
      return (
        <MoveSheet
          onClose={onClose}
          onMove={(target) => updateFile({ id: ask.file.id, folderId: target })}
          title={`Mover "${ask.file.name}"`}
        />
      );
    case "move-folder":
      return (
        <MoveSheet
          exclude={ask.folder.id}
          onClose={onClose}
          onMove={(target) =>
            updateFolder({ id: ask.folder.id, parentId: target })
          }
          title={`Mover a pasta "${ask.folder.name}"`}
        />
      );
    case "delete-folder":
      return (
        <ConfirmSheet
          detail={`Apaga também tudo o que está dentro (${ask.folder.count} ${ask.folder.count === 1 ? "item" : "itens"}). Não dá para desfazer.`}
          onClose={onClose}
          onConfirm={() => deleteFolder({ id: ask.folder.id })}
          title={`Apagar a pasta "${ask.folder.name}"?`}
        />
      );
    case "delete-file":
      return (
        <ConfirmSheet
          detail="Não dá para desfazer."
          onClose={onClose}
          onConfirm={() => deleteFile({ id: ask.file.id })}
          title={`Apagar "${ask.file.name}"?`}
        />
      );
    default:
      return null;
  }
}

function SearchResults({
  q,
  onOpen,
}: {
  q: string;
  onOpen: (id: Id<"docFiles">) => void;
}) {
  const hits = useQuery(api.files.search, { q });
  if (!hits) {
    return <p className="text-muted-foreground text-sm">A procurar…</p>;
  }
  if (hits.length === 0) {
    return <p className="text-muted-foreground text-sm">Nada encontrado.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
      {hits.map((f) => (
        <button
          className="flex flex-col gap-1 rounded-2xl p-1.5 text-left hover:bg-muted/60"
          key={f.id}
          onClick={() => onOpen(f.id)}
          type="button"
        >
          <FileThumb file={f} />
          <span className="line-clamp-2 break-all text-xs">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

export function FilesBrowser() {
  const [folderId, setFolderId] = useState<FolderId | undefined>();
  const listing = useQuery(api.files.list, { folderId });
  const { upload, progress, error, clearError } = useUploader(folderId);
  const input = useRef<HTMLInputElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [openId, setOpenId] = useState<Id<"docFiles"> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [q, setQ] = useState("");

  // Files dragged from the desktop (the Carregar button is the main path)
  const dropZone = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = dropZone.current;
    if (!el) {
      return;
    }
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files.length) {
        upload(e.dataTransfer.files);
      }
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  });

  // The open folder was deleted (here or elsewhere): back to the root
  useEffect(() => {
    if (listing?.missing) {
      setFolderId(undefined);
    }
  }, [listing?.missing]);

  if (listing === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (listing === null) {
    return null;
  }
  const empty = listing.folders.length === 0 && listing.files.length === 0;

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl",
        dragging && "outline-dashed outline-2 outline-primary"
      )}
      ref={dropZone}
    >
      <Toolbar
        onNewFolder={() => setAsk({ kind: "new-folder" })}
        onNewSheet={() => setAsk({ kind: "new-sheet" })}
        onScan={() => setScanning(true)}
        onUpload={() => input.current?.click()}
      />
      <input
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            upload(e.target.files);
          }
          e.target.value = "";
        }}
        ref={input}
        type="file"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb onGo={setFolderId} path={listing.path} />
        <Input
          aria-label="Procurar arquivos"
          className="h-8 w-full sm:w-56"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar nome ou texto…"
          value={q}
        />
      </div>
      {progress ? (
        <p className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
          A enviar {progress.done + 1} de {progress.total}…
        </p>
      ) : null}
      {error ? (
        <button
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-left text-destructive text-sm"
          onClick={clearError}
          type="button"
        >
          {error}
        </button>
      ) : null}
      {q.trim().length >= 2 ? (
        <SearchResults onOpen={setOpenId} q={q} />
      ) : (
        <>
          {listing.folders.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {listing.folders.map((f) => (
                <FolderCard
                  folder={f}
                  key={f.id}
                  onAsk={setAsk}
                  onOpen={() => setFolderId(f.id)}
                />
              ))}
            </div>
          ) : null}
          {listing.files.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {listing.files.map((f) => (
                <FileCard
                  file={f}
                  key={f.id}
                  onAsk={setAsk}
                  onOpen={() => setOpenId(f.id)}
                />
              ))}
            </div>
          ) : null}
          {empty ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-muted-foreground text-sm">
              <FolderGlyph className="size-14 opacity-60" color={null} />
              Pasta vazia. Crie pastas, carregue fotos, vídeos e PDFs, ou
              digitalize um documento com a câmara.
              <span className="hidden text-xs sm:block">
                Também pode arrastar arquivos para aqui.
              </span>
            </div>
          ) : null}
        </>
      )}
      <Asks
        ask={ask}
        folderId={folderId}
        onClose={() => setAsk(null)}
        onOpenFile={setOpenId}
      />
      {openId ? (
        <FileViewer id={openId} onClose={() => setOpenId(null)} />
      ) : null}
      {scanning ? (
        <Scanner
          folderId={folderId}
          onClose={() => setScanning(false)}
          onOpenFile={(id) => {
            setScanning(false);
            setOpenId(id);
          }}
        />
      ) : null}
    </section>
  );
}
