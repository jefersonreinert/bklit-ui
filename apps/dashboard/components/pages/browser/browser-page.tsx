"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  APP_COLORS,
  addApp,
  addHistory,
  hostOf,
  moveApp,
  removeApp,
  toUrl,
  updateBrowser,
  useBrowser,
  type WebApp,
} from "@/lib/browser/store";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { WIDGETS, Widget } from "./browser-widgets";
import { UnlockCard } from "./unlock-card";

/**
 * A browser inside the panel: a home screen of site icons (like the
 * iPhone's) with widgets, favorites and history. Sites that allow it open
 * inside the app; the others (most big sites forbid being shown inside
 * another app) open in Safari.
 */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;

interface Page {
  url: string;
  title: string;
  embeddable: boolean | null;
}

function AppIcon({
  app,
  size = 60,
}: {
  app: Pick<WebApp, "url" | "title" | "color">;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const host = hostOf(app.url);
  return (
    <span
      className="flex items-center justify-center overflow-hidden rounded-[22%] shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${app.color}, color-mix(in oklab, ${app.color} 70%, black))`,
      }}
    >
      {broken ? (
        <span
          className="font-semibold text-white"
          style={{ fontSize: size * 0.42 }}
        >
          {app.title.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <span
          className="flex items-center justify-center rounded-[24%] bg-white"
          style={{ width: size * 0.62, height: size * 0.62 }}
        >
          {/* biome-ignore lint/performance/noImgElement: remote favicon */}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: image fallback */}
          <img
            alt=""
            height={64}
            onError={() => setBroken(true)}
            src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`}
            style={{ width: size * 0.42, height: size * 0.42 }}
            width={64}
          />
        </span>
      )}
    </span>
  );
}

function AddAppSheet({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial?: { title: string; url: string };
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [color, setColor] = useState(APP_COLORS[0] ?? "#c96442");
  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setUrl(initial?.url ?? "");
    }
  }, [open, initial]);
  const full = toUrl(url);
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="acrylic gap-4 rounded-t-3xl bg-popover p-5 sm:mx-auto sm:max-w-md"
        side="bottom"
      >
        <SheetHeader className="p-0">
          <SheetTitle>Adicionar à tela inicial</SheetTitle>
        </SheetHeader>
        <div className="flex items-center gap-4">
          <AppIcon
            app={{
              title: title || "?",
              url: full ?? "https://example.com",
              color,
            }}
            size={64}
          />
          <div className="flex flex-1 flex-col gap-2">
            <Input
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome"
              value={title}
            />
            <Input
              autoCapitalize="off"
              inputMode="url"
              onChange={(e) => setUrl(e.target.value)}
              placeholder="site.com"
              value={url}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {APP_COLORS.map((c) => (
            <button
              aria-label={`Cor ${c}`}
              className={cn(
                "size-8 rounded-full border-2",
                color === c ? "border-foreground" : "border-transparent"
              )}
              key={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              type="button"
            />
          ))}
        </div>
        <Button
          className="h-11 rounded-full"
          disabled={!full}
          onClick={() => {
            if (full) {
              addApp(title.trim() || hostOf(full), full, color);
              onClose();
            }
          }}
        >
          Adicionar
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function HistorySheet({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (url: string) => void;
}) {
  const { history } = useBrowser();
  const [q, setQ] = useState("");
  const list = history.filter(
    (h) =>
      !q || h.title.toLowerCase().includes(q.toLowerCase()) || h.url.includes(q)
  );
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Histórico</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4">
          <Input
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar no histórico"
            value={q}
          />
          <ul className="divide-y">
            {list.map((h) => (
              <li key={`${h.url}${h.at}`}>
                <button
                  className="flex w-full flex-col py-2 text-left"
                  onClick={() => {
                    onOpen(h.url);
                    onClose();
                  }}
                  type="button"
                >
                  <span className="truncate text-sm">
                    {h.title || hostOf(h.url)}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {hostOf(h.url)} ·{" "}
                    {new Date(h.at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {history.length ? (
            <Button
              onClick={() => updateBrowser((d) => ({ ...d, history: [] }))}
              variant="ghost"
            >
              Limpar histórico
            </Button>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              Nada por aqui ainda.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Long list of icons with drag to reorder while editing. */
function AppGrid({
  editing,
  onOpen,
}: {
  editing: boolean;
  onOpen: (url: string) => void;
}) {
  const { apps } = useBrowser();
  const drag = useRef<number | null>(null);
  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null) {
      return;
    }
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-app-index]");
    const to = el ? Number(el.getAttribute("data-app-index")) : -1;
    if (to >= 0 && to !== drag.current) {
      moveApp(drag.current, to);
      drag.current = to;
    }
  };
  return (
    <div
      className="grid touch-pan-y grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6 lg:grid-cols-8"
      onPointerCancel={() => {
        drag.current = null;
      }}
      onPointerMove={onMove}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {apps.map((a, i) => (
        <div
          className="relative flex flex-col items-center gap-1.5"
          data-app-index={i}
          key={a.id}
        >
          <button
            aria-label={a.title}
            className={cn(
              "transition-transform active:scale-90",
              editing && "animate-[jiggle_0.3s_ease-in-out_infinite] touch-none"
            )}
            onClick={() => (editing ? null : onOpen(a.url))}
            onPointerDown={(e) => {
              if (editing) {
                drag.current = i;
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
              }
            }}
            style={
              editing ? { animationDelay: `${(i % 4) * 0.07}s` } : undefined
            }
            type="button"
          >
            <AppIcon app={a} />
          </button>
          {editing ? (
            <button
              aria-label={`Remover ${a.title}`}
              className="absolute -top-1.5 left-1/2 flex size-6 -translate-x-[34px] items-center justify-center rounded-full bg-muted-foreground/80 text-white shadow"
              onClick={() => removeApp(a.id)}
              type="button"
            >
              <Icon className="size-3.5" name="IconMinusSmall" />
            </button>
          ) : null}
          <span className="w-full truncate text-center text-xs">{a.title}</span>
        </div>
      ))}
    </div>
  );
}

function Viewer({
  page,
  onHome,
  onReload,
  onSave,
}: {
  page: Page;
  onHome: () => void;
  onReload: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border bg-card">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          aria-label="Início"
          onClick={onHome}
          size="icon"
          variant="ghost"
        >
          <Icon className="size-5" name="IconChevronLeft" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm">
          {page.title || hostOf(page.url)}
        </span>
        <Button
          aria-label="Recarregar"
          onClick={onReload}
          size="icon"
          variant="ghost"
        >
          <Icon className="size-4" name="IconArrowsRepeat" />
        </Button>
        <Button
          aria-label="Adicionar à tela inicial"
          onClick={onSave}
          size="icon"
          variant="ghost"
        >
          <Icon className="size-4" name="IconStar" />
        </Button>
        <a
          aria-label="Abrir no Safari"
          className="flex size-9 items-center justify-center rounded-md hover:bg-muted"
          href={page.url}
          rel="noopener"
          target="_blank"
        >
          <Icon className="size-4" name="IconArrowUpRight" />
        </a>
      </div>
      {page.embeddable === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : null}
      {page.embeddable ? (
        <iframe
          className="min-h-0 w-full flex-1 bg-white"
          key={page.url}
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          src={page.url}
          title={page.title || page.url}
        />
      ) : null}
      {page.embeddable === false ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Icon className="size-10 text-muted-foreground" name="IconSafari" />
          <p className="font-semibold">
            {hostOf(page.url)} não abre dentro de outros apps
          </p>
          <p className="max-w-sm text-muted-foreground text-sm">
            Sites como Google, Instagram e bancos bloqueiam ser exibidos dentro
            de outro aplicativo por segurança. Abra no Safari: ele fica salvo no
            seu histórico aqui.
          </p>
          <a
            className="flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-background"
            href={page.url}
            rel="noopener"
            target="_blank"
          >
            Abrir no Safari
            <Icon className="size-4" name="IconArrowUpRight" />
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function BrowserPage() {
  const data = useBrowser();
  const params = useSearchParams();
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [locked, setLocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ title: string; url: string } | null>(
    null
  );
  const [history, setHistory] = useState(false);

  const open = async (raw: string) => {
    const url = toUrl(raw);
    if (!url) {
      return;
    }
    setPage({ url, title: "", embeddable: null });
    setAddress("");
    try {
      const res = await fetch(
        `${API}/web/check/?url=${encodeURIComponent(url)}`
      );
      if (res.status === 401) {
        setLocked(true);
        setPage(null);
        return;
      }
      const info = (await res.json()) as {
        url?: string;
        title?: string;
        embeddable?: boolean;
      };
      const final = info.url ?? url;
      setPage({
        url: final,
        title: info.title ?? "",
        embeddable: Boolean(info.embeddable),
      });
      addHistory(final, info.title ?? "");
    } catch {
      setPage({ url, title: "", embeddable: false });
      addHistory(url, "");
    }
  };

  const fromLink = params.get("url");
  useEffect(() => {
    if (fromLink) {
      open(fromLink);
      router.replace("/navegador/");
    }
  }, [fromLink]);

  if (locked) {
    return <UnlockCard onDone={() => setLocked(false)} />;
  }

  const suggestions = address.trim()
    ? [
        ...data.apps.map((a) => ({ url: a.url, title: a.title })),
        ...data.history,
      ]
        .filter(
          (s) =>
            s.title.toLowerCase().includes(address.toLowerCase()) ||
            s.url.toLowerCase().includes(address.toLowerCase())
        )
        .slice(0, 5)
    : [];

  return (
    <div className="-mx-1 flex h-[calc(100dvh-var(--header-h)-3rem)] flex-col gap-4">
      <form
        className="relative mx-auto w-full max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          open(address);
        }}
      >
        <Icon
          className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          name="IconGlobe"
        />
        <Input
          autoCapitalize="off"
          className="h-12 rounded-full bg-card pr-24 pl-10 shadow-sm"
          inputMode="url"
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Pesquisar ou digitar endereço"
          value={address}
        />
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-1">
          <Button
            aria-label="Histórico"
            onClick={() => setHistory(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon className="size-4" name="IconHistory" />
          </Button>
        </div>
        {suggestions.length ? (
          <ul className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.url}>
                <button
                  className="flex w-full flex-col px-4 py-2 text-left hover:bg-muted"
                  onClick={() => open(s.url)}
                  type="button"
                >
                  <span className="truncate text-sm">
                    {s.title || hostOf(s.url)}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {hostOf(s.url)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {page ? (
        <Viewer
          onHome={() => setPage(null)}
          onReload={() => open(page.url)}
          onSave={() =>
            setAdding({ title: page.title || hostOf(page.url), url: page.url })
          }
          page={page}
        />
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 overflow-y-auto pb-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.widgets.map((w) => (
              <div
                className={cn(
                  "relative",
                  WIDGETS.find((x) => x.id === w)?.wide && "col-span-2"
                )}
                key={w}
              >
                <Widget id={w} />
                {editing ? (
                  <button
                    aria-label="Remover widget"
                    className="absolute -top-1.5 -left-1.5 flex size-6 items-center justify-center rounded-full bg-muted-foreground/80 text-white shadow"
                    onClick={() =>
                      updateBrowser((d) => ({
                        ...d,
                        widgets: d.widgets.filter((x) => x !== w),
                      }))
                    }
                    type="button"
                  >
                    <Icon className="size-3.5" name="IconMinusSmall" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {editing ? (
            <div className="flex flex-wrap gap-2">
              {WIDGETS.filter((w) => !data.widgets.includes(w.id)).map((w) => (
                <Button
                  key={w.id}
                  onClick={() =>
                    updateBrowser((d) => ({
                      ...d,
                      widgets: [...d.widgets, w.id],
                    }))
                  }
                  size="sm"
                  variant="outline"
                >
                  <Icon className="size-4" name="IconPlusSmall" />
                  Widget {w.name}
                </Button>
              ))}
            </div>
          ) : null}
          <AppGrid editing={editing} onOpen={open} />
          <div className="flex justify-center gap-2">
            {editing ? (
              <Button
                onClick={() => setAdding({ title: "", url: "" })}
                variant="outline"
              >
                <Icon className="size-4" name="IconPlusSmall" />
                Adicionar site
              </Button>
            ) : null}
            <Button
              onClick={() => setEditing(!editing)}
              variant={editing ? "default" : "ghost"}
            >
              {editing ? "Concluído" : "Editar tela inicial"}
            </Button>
          </div>
          {editing ? (
            <p className="text-center text-muted-foreground text-xs">
              Arraste os ícones para mudar a ordem.
            </p>
          ) : null}
        </div>
      )}
      <AddAppSheet
        initial={adding ?? undefined}
        onClose={() => setAdding(null)}
        open={adding !== null}
      />
      <HistorySheet
        onClose={() => setHistory(false)}
        onOpen={open}
        open={history}
      />
    </div>
  );
}
