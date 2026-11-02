"use client";

import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Button } from "@/components/ui/button";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { loadFonts } from "@/lib/menu-canvas/fonts";
import {
  blankDesign,
  cloneElement,
  designFonts,
  newId,
  PAGE_SIZES,
} from "@/lib/menu-canvas/model";
import { removeDesign, saveDesign, useDesigns } from "@/lib/menu-canvas/store";
import type { Design } from "@/lib/menu-canvas/types";
import { AssetsProvider } from "./assets";
import { RecreateDesignSheet } from "./design-ai";
import { DesignEditor } from "./design-editor";
import { DesignStage } from "./design-stage";

/** Free-form designs: create, recreate from a photo, open, duplicate. */

const THUMB = 220;

function Thumb({ design }: { design: Design }) {
  const page = design.pages[0];
  if (!page) {
    return null;
  }
  const scale = Math.min(THUMB / design.width, THUMB / design.height);
  return (
    <div className="pointer-events-none flex h-[220px] items-center justify-center overflow-hidden rounded-lg bg-muted/50">
      <DesignStage
        design={design}
        editingId={null}
        onCommit={() => undefined}
        onEdit={() => undefined}
        onLive={() => undefined}
        onSelect={() => undefined}
        page={page}
        scale={scale}
        selected={[]}
      />
    </div>
  );
}

function duplicate(d: Design): Design {
  return {
    ...d,
    id: newId("ds"),
    name: `${d.name} (cópia)`,
    pages: d.pages.map((p) => ({
      ...p,
      id: newId("pg"),
      elements: p.elements.map((e) => cloneElement(e, 0)),
    })),
    updatedAt: Date.now(),
  };
}

function Gallery() {
  const { designs } = useDesigns();
  const [openId, setOpenId] = useState<string | null>(null);
  const [recreate, setRecreate] = useState(false);
  const [size, setSize] = useState("a4");

  useEffect(() => {
    loadFonts(designs.flatMap((d) => [...designFonts(d)]));
  }, [designs]);

  const open = designs.find((d) => d.id === openId);
  if (open) {
    return (
      <DesignEditor
        initial={open}
        key={open.id}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const create = (d: Design) => {
    saveDesign(d);
    setOpenId(d.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          onClick={() => setRecreate(true)}
          type="button"
        >
          <Icon className="size-5 text-primary" name="IconSparklesSoft" />
          <span className="font-medium">Recriar de uma foto com IA</span>
          <span className="text-muted-foreground text-xs">
            Fotografe o cardápio: a IA redesenha cada página com as fontes do
            Google mais parecidas, cores, linhas, logotipo e fotos — tudo
            editável, como no Canva.
          </span>
        </button>
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <Icon className="size-5" name="IconPlusMedium" />
          <span className="font-medium">Design em branco</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Tamanho"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              onChange={(e) => setSize(e.target.value)}
              value={size}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button onClick={() => create(blankDesign(size))} size="sm">
              Criar
            </Button>
          </div>
          <span className="text-muted-foreground text-xs">
            Textos, fontes do Google, cores, imagens, ícones, formas, camadas,
            várias páginas e assistente de IA por texto ou voz.
          </span>
        </div>
      </div>

      {designs.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {designs.map((d) => (
            <div
              className="flex flex-col gap-2 rounded-xl border bg-card p-3"
              key={d.id}
            >
              <button
                className="text-left"
                onClick={() => setOpenId(d.id)}
                type="button"
              >
                <Thumb design={d} />
                <span className="mt-2 block truncate font-medium text-sm">
                  {d.name}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {d.pages.length} {d.pages.length === 1 ? "página" : "páginas"}{" "}
                  · {new Date(d.updatedAt).toLocaleDateString(appLocale())}
                </span>
              </button>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  onClick={() => setOpenId(d.id)}
                  size="sm"
                  variant="outline"
                >
                  <Icon className="size-4" name="IconPencil" />
                  Editar
                </Button>
                <Button
                  onClick={() => saveDesign(duplicate(d))}
                  size="sm"
                  variant="ghost"
                >
                  Duplicar
                </Button>
                <ConfirmButton
                  confirmLabel="Apagar?"
                  onConfirm={() => removeDesign(d.id)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <RecreateDesignSheet
        onClose={() => setRecreate(false)}
        onCreated={(d) => {
          setRecreate(false);
          create(d);
        }}
        open={recreate}
      />
    </div>
  );
}

export function DesignGallery() {
  return (
    <AssetsProvider>
      <Gallery />
    </AssetsProvider>
  );
}
