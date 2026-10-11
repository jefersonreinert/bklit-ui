"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  blobToBase64,
  pagesToPdf,
  renderPage,
  SCAN_FILTERS,
  type ScanFilter,
  type ScanPage,
} from "@/lib/files/scan";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { scanToText } from "./file-viewer";
import { type FolderId, useUploader } from "./files-shared";

/**
 * Phone scanner: take one or more photos with the camera (or pick them),
 * rotate and clean them up like a scan, then save as PDF and/or turn the
 * text into an editable sheet (Claude reads the pages).
 */

const today = () => new Date().toLocaleDateString("pt-BR").replaceAll("/", "-");

function PagePreview({
  page,
  index,
  onChange,
  onRemove,
}: {
  page: ScanPage;
  index: number;
  onChange: (p: ScanPage) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    renderPage(page)
      .then((blob) => {
        if (live) {
          url = URL.createObjectURL(blob);
          setPreview(url);
        }
      })
      .catch(() => setPreview(page.src));
    return () => {
      live = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [page]);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-2">
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-muted/40">
        {preview ? (
          // biome-ignore lint/performance/noImgElement: local object URL preview
          <img
            alt={`Página ${index + 1}`}
            className="max-h-full max-w-full object-contain"
            height={400}
            src={preview}
            width={300}
          />
        ) : (
          <span className="text-muted-foreground text-xs">A processar…</span>
        )}
        <span className="absolute top-1 left-1 rounded-md bg-background/80 px-1.5 text-xs">
          {index + 1}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {SCAN_FILTERS.map((f) => (
          <button
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              page.filter === f.id && "bg-foreground text-background"
            )}
            key={f.id}
            onClick={() => onChange({ ...page, filter: f.id as ScanFilter })}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button
          onClick={() =>
            onChange({
              ...page,
              rotation: ((page.rotation + 90) % 360) as ScanPage["rotation"],
            })
          }
          size="xs"
          variant="ghost"
        >
          <Icon className="size-3.5" name="IconArrowRotateClockwise" />
          Rodar
        </Button>
        <Button onClick={onRemove} size="xs" variant="ghost">
          <Icon className="size-3.5" name="IconTrashCan" />
          Tirar
        </Button>
      </div>
    </div>
  );
}

export function Scanner({
  folderId,
  onClose,
  onOpenFile,
}: {
  folderId: FolderId | undefined;
  onClose: () => void;
  onOpenFile: (id: Id<"docFiles">) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [name, setName] = useState(`Digitalização ${today()}`);
  const [keepPdf, setKeepPdf] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { putBlob } = useUploader(folderId);
  const addFile = useMutation(api.files.addFile);
  const createSheet = useMutation(api.files.createSheet);
  const discard = useMutation(api.files.discardUploads);

  const live = useRef<ScanPage[]>([]);
  live.current = pages;
  // Revoke the photos when the scanner closes
  useEffect(
    () => () => {
      for (const p of live.current) {
        URL.revokeObjectURL(p.src);
      }
    },
    []
  );

  const addPhotos = (files: FileList | null) => {
    if (!files) {
      return;
    }
    const added = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .map(
        (f): ScanPage => ({
          id: crypto.randomUUID(),
          src: URL.createObjectURL(f),
          rotation: 0,
          filter: "document",
        })
      );
    setPages((p) => [...p, ...added]);
  };

  const rendered = async () => await Promise.all(pages.map(renderPage));

  const savePdf = async (blobs: Blob[]) => {
    const pdf = await pagesToPdf(blobs);
    const storageId = await putBlob(pdf);
    return await addFile({
      name: `${name.trim() || "Digitalização"}.pdf`,
      folderId,
      kind: "pdf",
      mimeType: "application/pdf",
      size: pdf.size,
      storageId,
    });
  };

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(null);
    }
  };

  const onPdf = () =>
    run("A gerar o PDF…", async () => {
      onOpenFile(await savePdf(await rendered()));
    });

  const onText = () =>
    run("A ler o texto das páginas…", async () => {
      const blobs = await rendered();
      const files = await Promise.all(
        blobs.map(async (b) => ({
          data: await blobToBase64(b),
          mimeType: "image/jpeg",
        }))
      );
      const out = await scanToText(files);
      const sourceIds = await Promise.all(blobs.map((b) => putBlob(b)));
      try {
        if (keepPdf) {
          await savePdf(blobs);
        }
        const id = await createSheet({
          name: name.trim() || out.title || "Digitalização",
          folderId,
          text: out.text,
          sourceIds,
        });
        onOpenFile(id);
      } catch (err) {
        await discard({ ids: sourceIds });
        throw err;
      }
    });

  return (
    <Sheet onOpenChange={(o) => (o || busy ? null : onClose())} open>
      <SheetContent className="w-full gap-3 overflow-y-auto p-4 data-[side=right]:w-full data-[side=right]:md:w-[760px] data-[side=right]:md:max-w-[760px]">
        <SheetHeader className="p-0 pr-8">
          <SheetTitle>Digitalizar documento</SheetTitle>
          <SheetDescription>
            Tire fotos das páginas, ajuste e guarde como PDF ou converta o texto
            numa folha editável.
          </SheetDescription>
        </SheetHeader>
        <input
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = "";
          }}
          ref={camera}
          type="file"
        />
        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = "";
          }}
          ref={gallery}
          type="file"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => camera.current?.click()} size="lg">
            <Icon className="size-5" name="IconCamera1" />
            {pages.length ? "Mais uma página" : "Tirar foto"}
          </Button>
          <Button
            onClick={() => gallery.current?.click()}
            size="lg"
            variant="outline"
          >
            <Icon className="size-5" name="IconImages1" />
            Da galeria
          </Button>
        </div>
        {pages.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
            Ponha a folha numa superfície escura, com boa luz, e enquadre-a
            inteira. Pode juntar várias páginas.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pages.map((p, i) => (
              <PagePreview
                index={i}
                key={p.id}
                onChange={(next) =>
                  setPages((all) => all.map((x) => (x.id === p.id ? next : x)))
                }
                onRemove={() => {
                  URL.revokeObjectURL(p.src);
                  setPages((all) => all.filter((x) => x.id !== p.id));
                }}
                page={p}
              />
            ))}
          </div>
        )}
        {pages.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border p-3">
            <Input
              aria-label="Nome do documento"
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
            <span className="flex items-center gap-2 text-sm">
              <Switch
                aria-label="Guardar também o PDF"
                checked={keepPdf}
                onCheckedChange={setKeepPdf}
              />
              Ao converter em texto, guardar também o PDF
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={Boolean(busy)} onClick={onText}>
                <Icon className="size-4" name="IconScanTextSparkle" />
                Converter em texto (folha)
              </Button>
              <Button
                disabled={Boolean(busy)}
                onClick={onPdf}
                variant="outline"
              >
                <Icon className="size-4" name="IconFilePdf" />
                Guardar só o PDF
              </Button>
            </div>
            {busy ? <p className="text-sm">{busy}</p> : null}
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <p className="text-muted-foreground text-xs">
              O texto é lido pela IA (Claude) a partir das fotos; confira
              números e nomes importantes.
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
