"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import { menuFromExtracted, saveMenu } from "@/lib/menu-studio/store";
import type { ExtractedMenu, MenuDoc } from "@/lib/menu-studio/types";
import {
  callExtract,
  cropFraction,
  type PreparedFile,
  prepareFile,
} from "@/lib/upload";

async function cropLogo(x: ExtractedMenu, files: PreparedFile[]) {
  const photo = x.logo ? files[x.logo.pageIndex]?.preview : null;
  if (!(x.logo && photo)) {
    return "";
  }
  try {
    return await cropFraction(photo, x.logo);
  } catch {
    return "";
  }
}

/**
 * Photos or a PDF of an existing menu → Claude transcribes every section
 * and price, reads colors, fonts and layout, and finds the logo, which is
 * cut out of the photo. The result opens in the editor.
 */
export function RecreateSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: MenuDoc) => void;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    if (!list?.length) {
      return;
    }
    setBusy("Preparando arquivos…");
    setError(null);
    try {
      const prepared = await Promise.all([...list].map(prepareFile));
      setFiles((prev) => [...prev, ...prepared]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arquivo inválido.");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("A IA está lendo o cardápio… (pode levar 1–2 minutos)");
    setError(null);
    try {
      const x = await callExtract<ExtractedMenu>("menu", files, hint);
      const doc = menuFromExtracted(x, await cropLogo(x, files));
      saveMenu(doc);
      setFiles([]);
      setHint("");
      onCreated(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na leitura.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      onOpenChange={(o) => {
        if (!(o || busy)) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Recriar cardápio com IA</SheetTitle>
          <SheetDescription>
            Envie fotos ou o PDF do cardápio atual. A IA copia seções, pratos,
            preços, cores, fontes e o logotipo, e tudo fica editável.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <input
            accept="image/*,application/pdf"
            className="hidden"
            multiple
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={pickRef}
            type="file"
          />
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={cameraRef}
            type="file"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={Boolean(busy)}
              onClick={() => cameraRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCamera1" />
              Tirar foto
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => pickRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCloudUpload" />
              Fotos ou PDF
            </Button>
          </div>

          {files.length ? (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div
                  className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
                  key={`${f.name}-${i}`}
                >
                  {f.preview ? (
                    // biome-ignore lint/performance/noImgElement: local data URL
                    <img
                      alt={f.name}
                      className="size-full object-cover"
                      height={160}
                      src={f.preview}
                      width={120}
                    />
                  ) : (
                    <Icon className="size-6" name="IconFilePdf" />
                  )}
                  <button
                    aria-label="Remover"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    type="button"
                  >
                    <Icon className="size-3" name="IconCrossSmall" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              Uma foto por página, bem iluminada e reta. Até 12 páginas.
            </p>
          )}

          <Textarea
            onChange={(e) => setHint(e.target.value)}
            placeholder="Instruções opcionais (ex.: “só a página de vinhos”, “preços em euro”)"
            rows={2}
            value={hint}
          />
          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button disabled={!files.length || Boolean(busy)} onClick={run}>
            <Icon
              className="size-4"
              name={busy ? "IconLoader" : "IconSparklesSoft"}
            />
            {busy ?? "Recriar com IA"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
