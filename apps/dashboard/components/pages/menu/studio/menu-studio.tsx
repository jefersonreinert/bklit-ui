"use client";

import { useRef, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCellar } from "@/lib/cellar/store";
import type { CellarWine } from "@/lib/cellar/types";
import { Icon } from "@/lib/icons";
import {
  blankMenu,
  duplicateMenu,
  removeMenu,
  saveMenu,
  useMenus,
  wineListMenu,
} from "@/lib/menu-studio/store";
import { TEMPLATES } from "@/lib/menu-studio/templates";
import type { MenuDoc } from "@/lib/menu-studio/types";
import { ContentPanel } from "./content-panel";
import { downloadHtml, downloadJson, printPdf } from "./export";
import { MenuPreview } from "./menu-preview";
import { RecreateSheet } from "./recreate-sheet";
import { StylePanel } from "./style-panel";

function ExportButtons({ doc, wines }: { doc: MenuDoc; wines: CellarWine[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => printPdf(doc, wines)}>
        <Icon className="size-4" name="IconFilePdf" />
        PDF / imprimir
      </Button>
      <Button onClick={() => downloadHtml(doc, wines)} variant="outline">
        <Icon className="size-4" name="IconFileDownload" />
        HTML editável
      </Button>
      <Button onClick={() => downloadJson(doc)} variant="ghost">
        <Icon className="size-4" name="IconCode" />
        JSON
      </Button>
    </div>
  );
}

function MenuEditor({
  doc,
  wines,
  onBack,
}: {
  doc: MenuDoc;
  wines: CellarWine[];
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onBack} size="sm" variant="ghost">
          <Icon className="size-4" name="IconChevronLeft" />
          Cardápios
        </Button>
        <h3 className="flex-1 truncate font-semibold">{doc.name}</h3>
        <ExportButtons doc={doc} wines={wines} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <Tabs className="min-w-0" defaultValue="conteudo">
          <TabsList className="w-full">
            <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
            <TabsTrigger value="estilo">Estilo</TabsTrigger>
            <TabsTrigger className="lg:hidden" value="previa">
              Prévia
            </TabsTrigger>
          </TabsList>
          <TabsContent className="pt-3" value="conteudo">
            <ContentPanel doc={doc} onChange={saveMenu} />
          </TabsContent>
          <TabsContent className="pt-3" value="estilo">
            <StylePanel doc={doc} onChange={saveMenu} />
          </TabsContent>
          <TabsContent className="pt-3 lg:hidden" value="previa">
            <MenuPreview doc={doc} wines={wines} />
          </TabsContent>
        </Tabs>
        <div className="hidden min-w-0 lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-muted/40 p-4">
            <MenuPreview doc={doc} wines={wines} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuCard({
  doc,
  wines,
  onOpen,
}: {
  doc: MenuDoc;
  wines: CellarWine[];
  onOpen: () => void;
}) {
  const items = doc.sections.reduce((n, s) => n + s.items.length, 0);
  const auto = doc.sections.some((s) => s.wineSource);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <button
        className="flex items-center gap-3 text-left"
        onClick={onOpen}
        type="button"
      >
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-lg font-semibold text-lg"
          style={{
            background: doc.style.background,
            color: doc.style.accent,
            fontFamily: doc.style.headingFont,
          }}
        >
          {(doc.restaurantName || doc.name).slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{doc.name}</span>
          <span className="block text-muted-foreground text-xs">
            {doc.sections.length} seções · {items} itens
            {auto ? " · vinhos da Adega" : ""} ·{" "}
            {new Date(doc.updatedAt).toLocaleDateString("pt-BR")}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={onOpen} size="sm" variant="outline">
          <Icon className="size-4" name="IconPencil" />
          Editar
        </Button>
        <Button onClick={() => printPdf(doc, wines)} size="sm" variant="ghost">
          <Icon className="size-4" name="IconFilePdf" />
          PDF
        </Button>
        <Button
          onClick={() => downloadHtml(doc, wines)}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconFileDownload" />
          HTML
        </Button>
        <Button onClick={() => duplicateMenu(doc)} size="sm" variant="ghost">
          <Icon className="size-4" name="IconSquareBehindSquare1" />
          Duplicar
        </Button>
        <ConfirmButton
          confirmLabel="Apagar?"
          onConfirm={() => removeMenu(doc.id)}
        />
      </div>
    </div>
  );
}

const JSON_EXT = /\.json$/i;

/**
 * Menu editor: create menus from scratch, from a template, from the
 * cellar (live wine list) or by recreating a photographed menu with AI;
 * export as PDF or editable HTML.
 */
export function MenuStudio() {
  const { menus } = useMenus();
  const { wines } = useCellar();
  const [openId, setOpenId] = useState<string | null>(null);
  const [recreate, setRecreate] = useState(false);
  const [jsonError, setJsonError] = useState(false);
  const jsonRef = useRef<HTMLInputElement>(null);

  const open = menus.find((m) => m.id === openId);
  if (open) {
    return (
      <MenuEditor doc={open} onBack={() => setOpenId(null)} wines={wines} />
    );
  }

  const create = (doc: MenuDoc) => {
    saveMenu(doc);
    setOpenId(doc.id);
  };

  async function importJson(file: File | undefined) {
    if (!(file && JSON_EXT.test(file.name))) {
      return;
    }
    setJsonError(false);
    try {
      const doc = JSON.parse(await file.text()) as MenuDoc;
      if (doc?.style && Array.isArray(doc.sections)) {
        create({ ...doc, id: blankMenu().id });
        return;
      }
    } catch {
      // Falls through to the error below
    }
    setJsonError(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <button
          className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          onClick={() => setRecreate(true)}
          type="button"
        >
          <Icon className="size-5 text-primary" name="IconSparklesSoft" />
          <span className="font-medium">Recriar a partir de foto ou PDF</span>
          <span className="text-muted-foreground text-xs">
            A IA copia layout, estilo, logotipo, pratos e preços.
          </span>
        </button>
        <button
          className="flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50"
          onClick={() => create(wineListMenu("en"))}
          type="button"
        >
          <Icon className="size-5" name="IconGlass" />
          <span className="font-medium">Carta de vinhos da Adega</span>
          <span className="text-muted-foreground text-xs">
            {wines.length
              ? `${wines.length} vinhos por estilo, uva, país ou preço; atualiza sozinha.`
              : "Importe os vinhos do Notion em Bebidas → Adega primeiro."}
          </span>
        </button>
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <Icon className="size-5" name="IconPlusMedium" />
          <span className="font-medium">Novo cardápio em branco</span>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <Button
                key={t.id}
                onClick={() => create(blankMenu(t.id))}
                size="xs"
                variant="outline"
              >
                {t.name}
              </Button>
            ))}
            <Button
              onClick={() => jsonRef.current?.click()}
              size="xs"
              variant="ghost"
            >
              Importar JSON
            </Button>
            <input
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                importJson(e.target.files?.[0]);
                e.target.value = "";
              }}
              ref={jsonRef}
              type="file"
            />
          </div>
          {jsonError ? (
            <p className="text-destructive text-xs">
              Arquivo JSON de cardápio inválido.
            </p>
          ) : null}
        </div>
      </div>

      {menus.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {menus.map((m) => (
            <MenuCard
              doc={m}
              key={m.id}
              onOpen={() => setOpenId(m.id)}
              wines={wines}
            />
          ))}
        </div>
      ) : (
        <ChartCard
          description="Os cardápios criados aqui ficam salvos e sincronizados entre os dispositivos do painel."
          title="Nenhum cardápio ainda"
        >
          <p className="text-muted-foreground text-sm">
            Comece recriando o cardápio atual a partir de uma foto.
          </p>
        </ChartCard>
      )}

      <RecreateSheet
        onClose={() => setRecreate(false)}
        onCreated={(doc) => {
          setRecreate(false);
          setOpenId(doc.id);
        }}
        open={recreate}
      />
    </div>
  );
}
