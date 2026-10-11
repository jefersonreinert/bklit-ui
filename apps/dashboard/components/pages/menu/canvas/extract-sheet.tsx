"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import type { Box } from "@/lib/menu-canvas/components";
import { cutout, openSource, type Source } from "@/lib/menu-canvas/extract";
import {
  addAssets,
  type LibraryAsset,
  removeAsset,
  useLibrary,
} from "@/lib/menu-canvas/library";
import { imageElement, newId } from "@/lib/menu-canvas/model";
import type { DesignElement } from "@/lib/menu-canvas/types";
import { callExtract } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useUploadImage } from "./assets";

/**
 * "Extrair elementos": open a menu PDF or photo, see every drawing found
 * (icons, ornaments, illustrations, dividers), pick the ones to keep or
 * draw a box around anything else, and save them as transparent images
 * in the reusable library ("Meus elementos").
 */

interface Item {
  id: string;
  box: Box;
  name: string;
  kind: string;
  selected: boolean;
}

interface Named {
  named: { index: number; name: string; kind: string; isDecoration: boolean }[];
  extra: {
    name: string;
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
}

const KIND_LABEL: Record<string, string> = {
  icon: "Ícone",
  ornament: "Ornamento",
  illustration: "Ilustração",
  divider: "Divisória",
  logo: "Logotipo",
  frame: "Moldura",
  text: "Texto",
  other: "Elemento",
};

const MIN_DRAW = 0.01;

const itemsFor = (boxes: Box[]): Item[] =>
  boxes.map((box, i) => ({
    id: newId("it"),
    box,
    name: `Elemento ${i + 1}`,
    kind: "other",
    selected: true,
  }));

/** Page preview with the boxes drawn and numbered, for the AI to name. */
async function annotated(preview: string, items: Item[]) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = preview;
  });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível.");
  }
  ctx.drawImage(img, 0, 0);
  ctx.lineWidth = 3;
  ctx.font = "bold 22px sans-serif";
  items.forEach((it, i) => {
    const x = it.box.x * c.width;
    const y = it.box.y * c.height;
    ctx.strokeStyle = "#e11d48";
    ctx.strokeRect(x, y, it.box.w * c.width, it.box.h * c.height);
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(x - 2, y - 26, 30 + String(i + 1).length * 8, 24);
    ctx.fillStyle = "#fff";
    ctx.fillText(String(i + 1), x + 4, y - 7);
  });
  return c.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
}

function PageView({
  preview,
  items,
  onToggle,
  onDraw,
}: {
  preview: string;
  items: Item[];
  onToggle: (id: string) => void;
  onDraw: (box: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  const point = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div
      className="relative touch-none select-none"
      onPointerDown={(e) => {
        if (
          e.target !== e.currentTarget &&
          !(e.target instanceof HTMLImageElement)
        ) {
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = point(e);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) {
          return;
        }
        const p = point(e);
        setDraft({
          x: Math.min(s.x, p.x),
          y: Math.min(s.y, p.y),
          w: Math.abs(p.x - s.x),
          h: Math.abs(p.y - s.y),
        });
      }}
      onPointerUp={() => {
        if (draft && draft.w > MIN_DRAW && draft.h > MIN_DRAW) {
          onDraw(draft);
        }
        start.current = null;
        setDraft(null);
      }}
      ref={ref}
    >
      {/* biome-ignore lint/performance/noImgElement: rendered page data URL */}
      <img
        alt="Página"
        className="block w-full"
        draggable={false}
        height={1400}
        src={preview}
        width={1000}
      />
      {items.map((it, i) => (
        <button
          aria-label={`${it.name} (${it.selected ? "selecionado" : "não selecionado"})`}
          className={cn(
            "absolute border-2 transition-colors",
            it.selected
              ? "border-[#8b5cf6] bg-[#8b5cf6]/10"
              : "border-black/30 border-dashed bg-transparent"
          )}
          key={it.id}
          onClick={() => onToggle(it.id)}
          style={{
            left: `${it.box.x * 100}%`,
            top: `${it.box.y * 100}%`,
            width: `${it.box.w * 100}%`,
            height: `${it.box.h * 100}%`,
          }}
          type="button"
        >
          <span
            className={cn(
              "absolute -top-4 left-0 rounded px-1 font-semibold text-[10px] text-white",
              it.selected ? "bg-[#8b5cf6]" : "bg-black/40"
            )}
          >
            {i + 1}
          </span>
        </button>
      ))}
      {draft ? (
        <span
          className="pointer-events-none absolute border-2 border-[#ec4899] bg-[#ec4899]/10"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}

export function ExtractSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const upload = useUploadImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [items, setItems] = useState<Item[][]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const page = source?.pages[pageIndex];
  const pageItems = items[pageIndex] ?? [];
  const selectedCount = items.flat().filter((i) => i.selected).length;

  const setPageItems = (fn: (list: Item[]) => Item[]) =>
    setItems((all) =>
      all.map((list, i) => (i === pageIndex ? fn(list) : list))
    );

  async function load(file: File | undefined) {
    if (!file) {
      return;
    }
    setError("");
    setMessage("");
    setBusy("Abrindo o arquivo…");
    try {
      const s = await openSource(file, (n, of) =>
        setBusy(`Lendo página ${n} de ${of} e separando os desenhos…`)
      );
      setSource(s);
      setPageIndex(0);
      setItems(
        s.pages.map((p) =>
          itemsFor(p.boxes).map((it) => ({ ...it, selected: false }))
        )
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir o arquivo."
      );
    } finally {
      setBusy(null);
    }
  }

  async function nameWithAi() {
    if (!page) {
      return;
    }
    setBusy("A IA está identificando os desenhos desta página…");
    setError("");
    try {
      const data = await annotated(page.preview, pageItems);
      const res = await callExtract<Named>(
        "elements",
        [{ data, mimeType: "image/jpeg" }],
        `There are ${pageItems.length} numbered boxes.`
      );
      setPageItems((list) => {
        const next = list.map((it, i) => {
          const n = res.named.find((x) => x.index === i + 1);
          return n
            ? {
                ...it,
                name: n.name || it.name,
                kind: n.kind,
                selected: n.isDecoration,
              }
            : it;
        });
        for (const x of res.extra) {
          next.push({
            id: newId("it"),
            box: { x: x.x, y: x.y, w: x.w, h: x.h },
            name: x.name,
            kind: x.kind,
            selected: true,
          });
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha da IA.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!source) {
      return;
    }
    setError("");
    const saved: LibraryAsset[] = [];
    let done = 0;
    for (const [pi, list] of items.entries()) {
      const chosen = list.filter((i) => i.selected);
      if (chosen.length === 0) {
        continue;
      }
      setBusy(`Recortando em alta resolução… ${done}/${selectedCount}`);
      const hires = await source.pages[pi]?.hires();
      if (!hires) {
        continue;
      }
      for (const it of chosen) {
        try {
          const cut = cutout(hires, it.box);
          saved.push({
            id: newId("as"),
            name: it.name,
            kind: it.kind,
            src: await upload(cut.src),
            width: cut.width,
            height: cut.height,
            monochrome: cut.monochrome,
            source: source.name,
            createdAt: Date.now(),
          });
        } catch {
          // Empty area: skip
        }
        done += 1;
        setBusy(`Recortando em alta resolução… ${done}/${selectedCount}`);
      }
    }
    addAssets(saved);
    setBusy(null);
    setMessage(`${saved.length} elementos salvos em “Meus elementos”.`);
    setItems((all) =>
      all.map((list) => list.map((i) => ({ ...i, selected: false })))
    );
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
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-5xl!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Extrair elementos de um cardápio</SheetTitle>
          <SheetDescription>
            Envie o PDF ou uma foto. Cada desenho (ícones de copos, ornamentos,
            ilustrações, divisórias, logotipos) é separado automaticamente, sem
            o texto e com fundo transparente. Toque para escolher, arraste na
            página para recortar qualquer outra área, e salve na sua biblioteca.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <input
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              load(e.target.files?.[0]);
              e.target.value = "";
            }}
            ref={fileRef}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={Boolean(busy)}
              onClick={() => fileRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCloudUpload" />
              {source ? "Outro arquivo" : "Escolher PDF ou foto"}
            </Button>
            {source ? (
              <>
                <Button
                  disabled={Boolean(busy)}
                  onClick={nameWithAi}
                  size="sm"
                  variant="ghost"
                >
                  <Icon className="size-4" name="IconSparklesSoft" />
                  Identificar com IA
                </Button>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    setPageItems((l) =>
                      l.map((i) => ({ ...i, selected: true }))
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  Selecionar todos
                </Button>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    setPageItems((l) =>
                      l.map((i) => ({ ...i, selected: false }))
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  Limpar seleção
                </Button>
              </>
            ) : null}
          </div>
          {busy ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Icon className="size-4 animate-spin" name="IconLoader" />
              {busy}
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {message ? (
            <p className="text-muted-foreground text-sm">✓ {message}</p>
          ) : null}

          {source && page ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col gap-2">
                {source.pages.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {source.pages.map((p, i) => (
                      <button
                        className={cn(
                          "h-7 min-w-7 rounded-md border px-1.5 text-xs tabular-nums",
                          i === pageIndex &&
                            "border-primary bg-primary/10 font-semibold"
                        )}
                        key={p.preview.slice(-24) + String(i)}
                        onClick={() => setPageIndex(i)}
                        type="button"
                      >
                        {i + 1}
                        {(items[i] ?? []).some((x) => x.selected) ? "•" : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="overflow-hidden rounded-lg border bg-white">
                  <PageView
                    items={pageItems}
                    onDraw={(box) =>
                      setPageItems((l) => [
                        ...l,
                        {
                          id: newId("it"),
                          box,
                          name: `Recorte ${l.length + 1}`,
                          kind: "other",
                          selected: true,
                        },
                      ])
                    }
                    onToggle={(id) =>
                      setPageItems((l) =>
                        l.map((i) =>
                          i.id === id ? { ...i, selected: !i.selected } : i
                        )
                      )
                    }
                    preview={page.preview}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-medium text-sm">
                  {pageItems.length} desenhos nesta página
                </p>
                <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                  {pageItems.map((it, i) => (
                    <li className="flex items-center gap-2" key={it.id}>
                      <input
                        aria-label={`Selecionar ${it.name}`}
                        checked={it.selected}
                        onChange={() =>
                          setPageItems((l) =>
                            l.map((x) =>
                              x.id === it.id
                                ? { ...x, selected: !x.selected }
                                : x
                            )
                          )
                        }
                        type="checkbox"
                      />
                      <span className="w-5 text-muted-foreground text-xs tabular-nums">
                        {i + 1}
                      </span>
                      <Input
                        aria-label="Nome"
                        className="h-7 text-xs"
                        onChange={(e) =>
                          setPageItems((l) =>
                            l.map((x) =>
                              x.id === it.id
                                ? { ...x, name: e.target.value }
                                : x
                            )
                          )
                        }
                        value={it.name}
                      />
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {KIND_LABEL[it.kind] ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={Boolean(busy) || selectedCount === 0}
                  onClick={save}
                >
                  <Icon className="size-4" name="IconImport" />
                  Salvar {selectedCount} na biblioteca
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "Meus elementos" in the insert panel. */
export function LibrarySection({
  onAdd,
  center,
}: {
  onAdd: (el: DesignElement) => void;
  center: (w: number, h: number) => { x: number; y: number };
}) {
  const { assets } = useLibrary();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          <Icon className="size-4" name="IconScanTextSparkle" />
          Extrair de um cardápio
        </Button>
        {assets.length ? (
          <Button
            onClick={() => setEditing((e) => !e)}
            size="sm"
            variant="ghost"
          >
            {editing ? "Pronto" : "Gerir"}
          </Button>
        ) : null}
      </div>
      {assets.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {assets.map((a) => (
            <div className="relative" key={a.id}>
              <button
                className="flex aspect-square w-full items-center justify-center rounded-md border bg-[length:12px_12px] bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] p-1.5 hover:bg-muted"
                onClick={() => {
                  const long = Math.max(a.width, a.height);
                  const scale = Math.min(1, 240 / long);
                  const w = Math.max(16, Math.round(a.width * scale));
                  const h = Math.max(16, Math.round(a.height * scale));
                  onAdd(
                    imageElement({
                      name: a.name,
                      src: a.src,
                      fit: "contain",
                      w,
                      h,
                      ...center(w, h),
                    })
                  );
                }}
                title={a.name}
                type="button"
              >
                {/* biome-ignore lint/performance/noImgElement: library thumbnail */}
                <img
                  alt={a.name}
                  className="max-h-full max-w-full object-contain"
                  height={80}
                  src={a.src}
                  width={80}
                />
              </button>
              {editing ? (
                <div className="absolute top-0.5 right-0.5">
                  <ConfirmButton
                    confirmLabel="Apagar?"
                    onConfirm={() => removeAsset(a.id)}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Extraia ícones, ornamentos e ilustrações dos seus cardápios (PDF ou
          foto) para reutilizar e recolorir em qualquer design.
        </p>
      )}
      <ExtractSheet onClose={() => setOpen(false)} open={open} />
    </>
  );
}
