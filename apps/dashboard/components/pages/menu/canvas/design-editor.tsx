"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/lib/icons";
import iconData from "@/lib/icons/icon-data.json";
import { loadFonts } from "@/lib/menu-canvas/fonts";
import {
  blankPage,
  cloneElement,
  clonePage,
  designFonts,
  renderDesignHtml,
} from "@/lib/menu-canvas/model";
import { saveDesign } from "@/lib/menu-canvas/store";
import type {
  Design,
  DesignElement,
  DesignPage,
} from "@/lib/menu-canvas/types";
import { cn } from "@/lib/utils";
import { AiAssistant } from "./design-ai";
import { InsertPanel, LayersPanel, PropertiesPanel } from "./design-panels";
import { DesignStage } from "./design-stage";

/**
 * Canva-like editor for one design: insert panel, the page, properties
 * and layers, the AI assistant, pages, zoom, undo/redo and export.
 */

const ICONS = iconData as Record<string, string>;
const MAX_HISTORY = 100;
const SAVE_DELAY = 500;
const UNSAFE_NAME = /[^\w\- ]+/g;

type Action =
  | "duplicate"
  | "delete"
  | "front"
  | "back"
  | "forward"
  | "backward"
  | "lock"
  | "center";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fileName = (d: Design, ext: string) =>
  `${d.name.replace(UNSAFE_NAME, "").trim() || "cardapio"}.${ext}`;

/** Prints the design (Save as PDF keeps vector text and real fonts). */
function printDesign(d: Design) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  frame.srcdoc = renderDesignHtml(d, ICONS);
  frame.onload = async () => {
    const win = frame.contentWindow;
    if (!win) {
      return;
    }
    try {
      await win.document.fonts.ready;
    } catch {
      // Print with fallback fonts
    }
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

function reorder(page: DesignPage, ids: string[], action: Action): DesignPage {
  const els = [...page.elements];
  const picked = els.filter((e) => ids.includes(e.id));
  const rest = els.filter((e) => !ids.includes(e.id));
  if (action === "front") {
    return { ...page, elements: [...rest, ...picked] };
  }
  if (action === "back") {
    return { ...page, elements: [...picked, ...rest] };
  }
  const dir = action === "forward" ? 1 : -1;
  const order = dir === 1 ? [...ids].reverse() : ids;
  for (const id of order) {
    const i = els.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < els.length) {
      [els[i], els[j]] = [els[j] as DesignElement, els[i] as DesignElement];
    }
  }
  return { ...page, elements: els };
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function DesignEditor({
  initial,
  onBack,
}: {
  initial: Design;
  onBack: () => void;
}) {
  const [design, setDesign] = useState(initial);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [boxWidth, setBoxWidth] = useState(800);
  const undo = useRef<Design[]>([]);
  const redo = useRef<Design[]>([]);
  const clipboard = useRef<DesignElement[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  const page = design.pages[
    Math.min(pageIndex, design.pages.length - 1)
  ] as DesignPage;
  const selection = useMemo(
    () => page.elements.filter((e) => selected.includes(e.id)),
    [page, selected]
  );

  useEffect(() => {
    loadFonts(designFonts(design));
  }, [design]);

  // Debounced save to the synced store
  useEffect(() => {
    const t = setTimeout(() => saveDesign(design), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [design]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setBoxWidth(entry.contentRect.width);
      }
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const fit = Math.min(1, (boxWidth - 32) / design.width);
  const scale = Math.max(0.05, fit * zoom);

  /** Records `before` in the history and applies `next`. */
  const commitDesign = useCallback((next: Design, before: Design) => {
    undo.current = [...undo.current, before].slice(-MAX_HISTORY);
    redo.current = [];
    setDesign(next);
    force((n) => n + 1);
  }, []);

  const withPage = (d: Design, p: DesignPage): Design => ({
    ...d,
    pages: d.pages.map((x) => (x.id === p.id ? p : x)),
  });

  const commitPage = (next: DesignPage, before?: DesignPage) => {
    const prev = before ? withPage(design, before) : design;
    commitDesign(withPage(design, next), prev);
  };

  const patch = (ids: string[], p: Partial<DesignElement>) =>
    commitPage({
      ...page,
      elements: page.elements.map((e) =>
        ids.includes(e.id) ? ({ ...e, ...p } as DesignElement) : e
      ),
    });

  const add = (el: DesignElement) => {
    // Cascade new elements so they don't land on top of each other
    const step = (page.elements.length % 8) * 24;
    const placed = {
      ...el,
      x: Math.max(0, Math.min(design.width - el.w, el.x + step)),
      y: Math.max(0, Math.min(design.height - 20, el.y + step)),
    };
    commitPage({ ...page, elements: [...page.elements, placed] });
    setSelected([placed.id]);
  };

  const act = (action: Action, ids = selected) => {
    if (ids.length === 0) {
      return;
    }
    if (action === "delete") {
      commitPage({
        ...page,
        elements: page.elements.filter((e) => !ids.includes(e.id)),
      });
      setSelected([]);
      return;
    }
    if (action === "duplicate") {
      const copies = page.elements
        .filter((e) => ids.includes(e.id))
        .map((e) => cloneElement(e));
      commitPage({ ...page, elements: [...page.elements, ...copies] });
      setSelected(copies.map((c) => c.id));
      return;
    }
    if (action === "lock") {
      const lock = !page.elements.find((e) => e.id === ids[0])?.locked;
      patch(ids, { locked: lock });
      return;
    }
    if (action === "center") {
      commitPage({
        ...page,
        elements: page.elements.map((e) =>
          ids.includes(e.id)
            ? { ...e, x: Math.round((design.width - e.w) / 2) }
            : e
        ),
      });
      return;
    }
    commitPage(reorder(page, ids, action));
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (prev) {
      redo.current.push(design);
      setDesign(prev);
      force((n) => n + 1);
    }
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (next) {
      undo.current.push(design);
      setDesign(next);
      force((n) => n + 1);
    }
  };

  // Keyboard shortcuts (Canva-like)
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  const paste = () => {
    if (clipboard.current.length === 0) {
      return;
    }
    const copies = clipboard.current.map((c) => cloneElement(c, 24));
    commitPage({ ...page, elements: [...page.elements, ...copies] });
    setSelected(copies.map((c) => c.id));
  };

  /** Ctrl/Cmd shortcuts; true when the key was handled. */
  const modShortcut = (k: string, shift: boolean) => {
    const map: Record<string, () => void> = {
      z: shift ? doRedo : doUndo,
      y: doRedo,
      d: () => act("duplicate"),
      c: () => {
        clipboard.current = selection;
      },
      v: paste,
      a: () =>
        setSelected(page.elements.filter((x) => !x.locked).map((x) => x.id)),
    };
    const run = map[k];
    run?.();
    return Boolean(run);
  };

  const nudge = (dx: number, dy: number) =>
    commitPage({
      ...page,
      elements: page.elements.map((x) =>
        selected.includes(x.id) && !x.locked
          ? { ...x, x: x.x + dx, y: x.y + dy }
          : x
      ),
    });

  keys.current = (e: KeyboardEvent) => {
    if (isTyping(e.target)) {
      return;
    }
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && modShortcut(k, e.shiftKey)) {
      if (k !== "c") {
        e.preventDefault();
      }
      return;
    }
    if (k === "escape") {
      setSelected([]);
      return;
    }
    if (selected.length === 0) {
      return;
    }
    if (k === "delete" || k === "backspace") {
      e.preventDefault();
      act("delete");
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = {
      arrowleft: [-step, 0],
      arrowright: [step, 0],
      arrowup: [0, -step],
      arrowdown: [0, step],
    };
    const d = arrows[k];
    if (d) {
      e.preventDefault();
      nudge(d[0], d[1]);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setPages = (pages: DesignPage[], index: number) => {
    commitDesign({ ...design, pages }, design);
    setPageIndex(index);
    setSelected([]);
  };

  const sidePanel = (
    <Tabs className="min-w-0" defaultValue="edit">
      <TabsList className="w-full">
        <TabsTrigger value="edit">Editar</TabsTrigger>
        <TabsTrigger value="layers">Camadas</TabsTrigger>
        <TabsTrigger value="ai">
          <Icon className="size-3.5" name="IconSparklesSoft" />
          IA
        </TabsTrigger>
      </TabsList>
      <TabsContent className="pt-3" value="edit">
        <PropertiesPanel
          design={design}
          onAction={act}
          onDesign={(p) => commitDesign({ ...design, ...p }, design)}
          onPage={(p) => commitPage({ ...page, ...p })}
          onPatch={patch}
          page={page}
          selection={selection}
        />
      </TabsContent>
      <TabsContent className="pt-3" value="layers">
        <LayersPanel
          onMove={(id, dir) => act(dir === 1 ? "forward" : "backward", [id])}
          onPatch={patch}
          onSelect={setSelected}
          page={page}
          selected={selected}
        />
      </TabsContent>
      <TabsContent className="pt-3" value="ai">
        <AiAssistant
          design={design}
          onApply={(next) => {
            commitPage(next);
            setSelected([]);
          }}
          page={page}
        />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onBack} size="sm" variant="ghost">
          <Icon className="size-4" name="IconChevronLeft" />
          Designs
        </Button>
        <Input
          aria-label="Nome do design"
          className="h-8 w-auto min-w-0 flex-1 font-medium sm:max-w-64"
          onChange={(e) => setDesign({ ...design, name: e.target.value })}
          value={design.name}
        />
        <div className="flex items-center gap-1">
          <Button
            aria-label="Desfazer"
            disabled={!undo.current.length}
            onClick={doUndo}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowUndoUp" />
          </Button>
          <Button
            aria-label="Refazer"
            disabled={!redo.current.length}
            onClick={doRedo}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4 -scale-x-100" name="IconArrowUndoUp" />
          </Button>
          <Button
            aria-label="Diminuir zoom"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconMinusSmall" />
          </Button>
          <button
            className="w-12 text-center text-xs tabular-nums"
            onClick={() => setZoom(1)}
            title="Ajustar à tela"
            type="button"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button
            aria-label="Aumentar zoom"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconPlusSmall" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => printDesign(design)} size="sm">
            <Icon className="size-4" name="IconFilePdf" />
            PDF
          </Button>
          <Button
            onClick={() =>
              download(
                new Blob([renderDesignHtml(design, ICONS)], {
                  type: "text/html",
                }),
                fileName(design, "html")
              )
            }
            size="sm"
            variant="outline"
          >
            HTML
          </Button>
          <Button
            onClick={() =>
              download(
                new Blob([JSON.stringify(design, null, 2)], {
                  type: "application/json",
                }),
                fileName(design, "json")
              )
            }
            size="sm"
            variant="ghost"
          >
            JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="order-3 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-xl border p-3 lg:order-1">
          <InsertPanel design={design} onAdd={add} />
        </aside>

        <div className="order-1 flex min-w-0 flex-col gap-2 lg:order-2">
          <div
            className="flex max-h-[calc(100vh-10rem)] min-h-[320px] justify-center overflow-auto rounded-xl bg-muted/50 p-4"
            ref={boxRef}
          >
            <DesignStage
              design={design}
              editingId={editingId}
              onCommit={(next, before) => commitPage(next, before)}
              onEdit={setEditingId}
              onLive={(next) => setDesign((d) => withPage(d, next))}
              onSelect={setSelected}
              page={page}
              scale={scale}
              selected={selected}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {design.pages.map((p, i) => (
              <button
                className={cn(
                  "h-8 min-w-8 rounded-md border px-2 text-xs tabular-nums",
                  i === pageIndex &&
                    "border-primary bg-primary/10 font-semibold"
                )}
                key={p.id}
                onClick={() => {
                  setPageIndex(i);
                  setSelected([]);
                }}
                type="button"
              >
                {i + 1}
              </button>
            ))}
            <Button
              onClick={() =>
                setPages(
                  [...design.pages, blankPage(page.background)],
                  design.pages.length
                )
              }
              size="sm"
              variant="ghost"
            >
              <Icon className="size-4" name="IconPlusSmall" />
              Página
            </Button>
            <Button
              onClick={() => {
                const pages = [...design.pages];
                pages.splice(pageIndex + 1, 0, clonePage(page));
                setPages(pages, pageIndex + 1);
              }}
              size="sm"
              variant="ghost"
            >
              <Icon className="size-4" name="IconSquareBehindSquare1" />
              Duplicar
            </Button>
            {design.pages.length > 1 ? (
              <Button
                onClick={() =>
                  setPages(
                    design.pages.filter((_, i) => i !== pageIndex),
                    Math.max(0, pageIndex - 1)
                  )
                }
                size="sm"
                variant="ghost"
              >
                <Icon className="size-4" name="IconTrashCan" />
                Apagar página
              </Button>
            ) : null}
          </div>
        </div>

        <aside className="order-2 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-xl border p-3 lg:order-3">
          {sidePanel}
        </aside>
      </div>
    </div>
  );
}
