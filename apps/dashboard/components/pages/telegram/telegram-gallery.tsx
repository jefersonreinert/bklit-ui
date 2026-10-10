"use client";

import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon, type IconName } from "@/lib/icons";
import { downloadUrl, downloadZip } from "@/lib/telegram/download";
import {
  formatBytes,
  isMediaKind,
  KIND_LABEL,
  keyLabel,
  MEDIA_KINDS,
  type MediaKind,
  monthName,
} from "@/lib/telegram/media";
import { cn } from "@/lib/utils";
import { Notice } from "./telegram-shared";

/**
 * Gallery of every Telegram file saved to the panel: navigate by year →
 * month → day, filter by kind and conversation, open photos, videos,
 * audio/MP3 and PDFs right here, download one, a selection or everything.
 */

type Item = FunctionReturnType<typeof api.tgmedia.list>["page"][number];
type Summary = NonNullable<FunctionReturnType<typeof api.tgmedia.summary>>;

const PAGE = 48;
const ALL = "all";

const KIND_ICON: Record<MediaKind, IconName> = {
  photo: "IconImages1",
  video: "IconVideo",
  audio: "IconHeadphones",
  voice: "IconMicrophone",
  pdf: "IconFilePdf",
  document: "IconFileText",
  gif: "IconImages1",
  sticker: "IconImages1",
};

const kindOf = (k: string): MediaKind => (isMediaKind(k) ? k : "document");
const isImage = (i: Item) =>
  i.kind === "photo" ||
  i.kind === "gif" ||
  (i.kind === "sticker" && i.mime.startsWith("image/"));

export interface GalleryFilter {
  year?: string;
  month?: string;
  day?: string;
  kinds: MediaKind[];
  chatId?: string;
}

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
        on ? "border-primary bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const count = (n: number) => (
  <span className="ml-1 text-muted-foreground text-xs">{n}</span>
);

const sum = (o: Record<string, number>) =>
  Object.values(o).reduce((a, b) => a + b, 0);

/** Years, then the months of the chosen year, then its days. */
function DateNav({
  calendar,
  f,
  set,
}: {
  calendar: Summary["calendar"];
  f: GalleryFilter;
  set: (patch: Partial<GalleryFilter>) => void;
}) {
  const years = Object.keys(calendar).sort().reverse();
  const months = f.year ? Object.keys(calendar[f.year] ?? {}).sort() : [];
  const days =
    f.year && f.month
      ? Object.keys(calendar[f.year]?.[f.month] ?? {}).sort()
      : [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Chip
          on={!f.year}
          onClick={() =>
            set({ year: undefined, month: undefined, day: undefined })
          }
        >
          Todas as datas
        </Chip>
        {years.map((y) => (
          <Chip
            key={y}
            on={f.year === y}
            onClick={() => set({ year: y, month: undefined, day: undefined })}
          >
            {y}
            {count(
              Object.values(calendar[y] ?? {}).reduce((a, m) => a + sum(m), 0)
            )}
          </Chip>
        ))}
      </div>
      {months.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {months.map((m) => (
            <Chip
              key={m}
              on={f.month === m}
              onClick={() =>
                set({ month: f.month === m ? undefined : m, day: undefined })
              }
            >
              <span className="capitalize">{monthName(m)}</span>
              {count(sum(calendar[f.year ?? ""]?.[m] ?? {}))}
            </Chip>
          ))}
        </div>
      ) : null}
      {days.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => (
            <Chip
              key={d}
              on={f.day === d}
              onClick={() => set({ day: f.day === d ? undefined : d })}
            >
              {Number(d.slice(-2))}
              {count(calendar[f.year ?? ""]?.[f.month ?? ""]?.[d] ?? 0)}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function KindNav({
  kinds,
  counts,
  onChange,
}: {
  kinds: MediaKind[];
  counts: Record<string, number>;
  onChange: (k: MediaKind[]) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      <Chip on={kinds.length === 0} onClick={() => onChange([])}>
        Tudo{count(sum(counts))}
      </Chip>
      {MEDIA_KINDS.filter((k) => counts[k]).map((k) => (
        <Chip
          key={k}
          on={kinds.includes(k)}
          onClick={() =>
            onChange(
              kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]
            )
          }
        >
          {KIND_LABEL[k]}
          {count(counts[k] ?? 0)}
        </Chip>
      ))}
    </div>
  );
}

function Thumb({ item }: { item: Item }) {
  if (item.url && isImage(item)) {
    return (
      // biome-ignore lint/performance/noImgElement: storage URL, any size
      <img
        alt={item.fileName}
        className="size-full object-cover"
        height={240}
        loading="lazy"
        src={item.url}
        width={240}
      />
    );
  }
  if (item.url && item.kind === "video") {
    return (
      <video
        className="size-full object-cover"
        muted
        playsInline
        preload="metadata"
        src={`${item.url}#t=0.5`}
      />
    );
  }
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
      <Icon
        className="size-8 text-muted-foreground"
        name={KIND_ICON[kindOf(item.kind)]}
      />
      <span className="line-clamp-2 break-all text-[11px] text-muted-foreground">
        {item.fileName}
      </span>
    </div>
  );
}

function Tile({
  item,
  selecting,
  selected,
  onOpen,
  onToggle,
}: {
  item: Item;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={item.fileName}
      aria-pressed={selecting ? selected : undefined}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border bg-muted/30 text-left",
        selected && "ring-2 ring-primary"
      )}
      onClick={selecting ? onToggle : onOpen}
      type="button"
    >
      <Thumb item={item} />
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-[11px] text-white">
        <Icon className="size-3" name={KIND_ICON[kindOf(item.kind)]} />
        <span className="truncate">{item.chatName}</span>
      </span>
      {selecting ? (
        <span
          className={cn(
            "absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white text-[10px] text-white",
            selected ? "bg-primary" : "bg-black/30"
          )}
        >
          {selected ? "✓" : ""}
        </span>
      ) : null}
    </button>
  );
}

function Preview({ item }: { item: Item }) {
  if (!item.url) {
    return <Notice tone="error">Arquivo indisponível.</Notice>;
  }
  if (isImage(item)) {
    return (
      // biome-ignore lint/performance/noImgElement: storage URL, any size
      <img
        alt={item.fileName}
        className="max-h-[60vh] w-full rounded-xl object-contain"
        height={600}
        src={item.url}
        width={600}
      />
    );
  }
  if (item.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user's own video, no captions
      <video
        className="max-h-[60vh] w-full rounded-xl"
        controls
        playsInline
        src={item.url}
      />
    );
  }
  if (item.kind === "audio" || item.kind === "voice") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user's own audio, no captions
      <audio className="w-full" controls src={item.url} />
    );
  }
  if (item.kind === "pdf") {
    return (
      <iframe
        className="h-[65vh] w-full rounded-xl border bg-white"
        src={item.url}
        title={item.fileName}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border p-8 text-center text-muted-foreground text-sm">
      <Icon className="size-10" name="IconFileText" />
      Pré-visualização indisponível para este tipo de arquivo. Use Baixar.
    </div>
  );
}

function Viewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: Item[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const remove = useMutation(api.tgmedia.remove);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = index === null ? null : items[index];
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(item)}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-3xl!"
        side="right"
      >
        {item ? (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="break-all">{item.fileName}</SheetTitle>
              <SheetDescription>
                {item.chatName}
                {item.sender ? ` · ${item.sender}` : ""} ·{" "}
                {new Date(item.date).toLocaleString("pt-BR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}{" "}
                · {formatBytes(item.size)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4">
              <Preview item={item} />
              {item.caption ? (
                <p className="whitespace-pre-wrap text-sm">{item.caption}</p>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  <Button
                    aria-label="Anterior"
                    disabled={index === 0}
                    onClick={() => onIndex((index ?? 0) - 1)}
                    size="sm"
                    variant="ghost"
                  >
                    ←
                  </Button>
                  <Button
                    aria-label="Próximo"
                    disabled={index === items.length - 1}
                    onClick={() => onIndex((index ?? 0) + 1)}
                    size="sm"
                    variant="ghost"
                  >
                    →
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={async () => {
                      if (!armed) {
                        setArmed(true);
                        return;
                      }
                      setArmed(false);
                      await remove({ ids: [item.id] });
                      onClose();
                    }}
                    onMouseLeave={() => setArmed(false)}
                    size="sm"
                    variant={armed ? "destructive" : "ghost"}
                  >
                    <Icon className="size-4" name="IconTrashCan" />
                    {armed ? "Toque de novo" : "Apagar da galeria"}
                  </Button>
                  {item.url ? (
                    <Button
                      nativeButton={false}
                      render={
                        <a href={item.url} rel="noreferrer" target="_blank" />
                      }
                      size="sm"
                      variant="outline"
                    >
                      Abrir
                    </Button>
                  ) : null}
                  <Button
                    disabled={!item.url}
                    onClick={() =>
                      downloadUrl(item.url ?? "", item.fileName).catch(
                        (e: unknown) =>
                          setError(e instanceof Error ? e.message : "Falhou.")
                      )
                    }
                    size="sm"
                  >
                    <Icon className="size-4" name="IconArrowDown" />
                    Baixar
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Groups the loaded page by day, newest first. */
function byDay(items: Item[]) {
  const groups: { day: string; items: { item: Item; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = groups.at(-1);
    if (last?.day === item.day) {
      last.items.push({ item, index });
    } else {
      groups.push({ day: item.day, items: [{ item, index }] });
    }
  });
  return groups;
}

function zipName(f: GalleryFilter) {
  const when = f.day ?? f.month ?? f.year ?? "tudo";
  const what = f.kinds.length ? f.kinds.join("-") : "midias";
  return `telegram-${what}-${when}.zip`;
}

function BulkBar({
  f,
  items,
  selecting,
  selected,
  setSelecting,
  setSelected,
}: {
  f: GalleryFilter;
  items: Item[];
  selecting: boolean;
  selected: Set<string>;
  setSelecting: (on: boolean) => void;
  setSelected: (s: Set<string>) => void;
}) {
  const convex = useConvex();
  const remove = useMutation(api.tgmedia.remove);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  async function zip(ids: string[], name: string) {
    setError(null);
    setBusy("Preparando…");
    try {
      const list = await convex.query(api.tgmedia.urls, {
        ids: ids as Id<"tgMedia">[],
      });
      if (list.length === 1 && list[0]?.url) {
        await downloadUrl(list[0].url, list[0].fileName);
      } else {
        await downloadZip(
          list.map((i) => ({
            url: i.url,
            fileName: i.fileName,
            folder: i.day,
          })),
          name,
          (done, total) => setBusy(`Baixando ${done} de ${total}…`)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadEverything() {
    setBusy("Preparando…");
    const all = await convex.query(api.tgmedia.allIds, {
      ...(f.year ? { year: f.year } : {}),
      ...(f.month ? { month: f.month } : {}),
      ...(f.day ? { day: f.day } : {}),
      ...(f.chatId ? { chatId: f.chatId } : {}),
      ...(f.kinds.length ? { kinds: f.kinds } : {}),
    });
    const ids = all.map((i) => i.id);
    for (let start = 0; start < ids.length; start += 500) {
      const part = Math.floor(start / 500) + 1;
      await zip(
        ids.slice(start, start + 500),
        ids.length > 500
          ? zipName(f).replace(".zip", `-parte${part}.zip`)
          : zipName(f)
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selecting ? (
          <>
            <span className="text-sm">{selected.size} selecionada(s)</span>
            <Button
              onClick={() => setSelected(new Set(items.map((i) => i.id)))}
              size="sm"
              variant="ghost"
            >
              Selecionar visíveis
            </Button>
            <Button
              disabled={selected.size === 0 || Boolean(busy)}
              onClick={() =>
                zip(
                  [...selected],
                  zipName(f).replace("telegram-", "telegram-selecao-")
                )
              }
              size="sm"
            >
              <Icon className="size-4" name="IconArrowDown" />
              Baixar selecionadas
            </Button>
            <Button
              disabled={selected.size === 0}
              onClick={async () => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                setArmed(false);
                await remove({ ids: [...selected] as Id<"tgMedia">[] });
                setSelected(new Set());
              }}
              onMouseLeave={() => setArmed(false)}
              size="sm"
              variant={armed ? "destructive" : "ghost"}
            >
              {armed ? "Toque de novo para apagar" : "Apagar"}
            </Button>
            <Button
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
              }}
              size="sm"
              variant="ghost"
            >
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => setSelecting(true)}
              size="sm"
              variant="outline"
            >
              Selecionar
            </Button>
            <Button
              disabled={Boolean(busy) || items.length === 0}
              onClick={() =>
                downloadEverything().catch((e: unknown) => {
                  setBusy(null);
                  setError(e instanceof Error ? e.message : "Falhou.");
                })
              }
              size="sm"
            >
              <Icon className="size-4" name="IconArrowDown" />
              Baixar tudo deste filtro (.zip)
            </Button>
          </>
        )}
        {busy ? (
          <span className="text-muted-foreground text-xs">{busy}</span>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function Grid({
  f,
  selecting,
  selected,
  toggle,
  setItems,
}: {
  f: GalleryFilter;
  selecting: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  setItems: (items: Item[]) => void;
}) {
  const args = {
    ...(f.year ? { year: f.year } : {}),
    ...(f.month ? { month: f.month } : {}),
    ...(f.day ? { day: f.day } : {}),
    ...(f.chatId ? { chatId: f.chatId } : {}),
    ...(f.kinds.length ? { kinds: f.kinds } : {}),
  };
  const { results, status, loadMore } = usePaginatedQuery(
    api.tgmedia.list,
    args,
    {
      initialNumItems: PAGE,
    }
  );
  const [open, setOpen] = useState<number | null>(null);
  const groups = useMemo(() => byDay(results), [results]);
  useEffect(() => {
    setItems(results);
  }, [results, setItems]);

  if (status === "LoadingFirstPage") {
    return (
      <p className="text-muted-foreground text-sm">Carregando a galeria…</p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        Nenhuma mídia com estes filtros. Em Conversas, use “Baixar” numa
        mensagem ou “Mídias → Salvar na galeria”.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section className="flex flex-col gap-2" key={g.day}>
          <h3 className="font-medium text-muted-foreground text-sm">
            {keyLabel(g.day)}
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map(({ item, index }) => (
              <Tile
                item={item}
                key={item.id}
                onOpen={() => setOpen(index)}
                onToggle={() => toggle(item.id)}
                selected={selected.has(item.id)}
                selecting={selecting}
              />
            ))}
          </div>
        </section>
      ))}
      {status === "CanLoadMore" ? (
        <Button onClick={() => loadMore(PAGE)} variant="outline">
          Carregar mais
        </Button>
      ) : null}
      {status === "LoadingMore" ? (
        <p className="text-center text-muted-foreground text-sm">Carregando…</p>
      ) : null}
      <Viewer
        index={open}
        items={results}
        onClose={() => setOpen(null)}
        onIndex={setOpen}
      />
    </div>
  );
}

export function TelegramGallery({ initialChatId }: { initialChatId?: string }) {
  const summary = useQuery(api.tgmedia.summary, {});
  const [f, setF] = useState<GalleryFilter>({
    kinds: [],
    ...(initialChatId ? { chatId: initialChatId } : {}),
  });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Item[]>([]);
  const set = (patch: Partial<GalleryFilter>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setSelected(new Set());
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  if (summary === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (summary === null) {
    return (
      <Notice>
        Desbloqueie o painel com o código de acesso para ver a galeria.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {summary.total} arquivo(s) · {formatBytes(summary.bytes)} guardados
          {summary.truncated
            ? " (mostrando os 20 000 mais recentes nos totais)"
            : ""}
        </p>
        <FilterSelect
          className="sm:w-60"
          items={[
            { value: ALL, label: "Todas as conversas" },
            ...summary.chats.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.count})`,
            })),
          ]}
          onChange={(v) => set({ chatId: v === ALL ? undefined : v })}
          value={f.chatId ?? ALL}
        />
      </div>
      <KindNav
        counts={summary.kinds}
        kinds={f.kinds}
        onChange={(kinds) => set({ kinds })}
      />
      <DateNav calendar={summary.calendar} f={f} set={set} />
      <BulkBar
        f={f}
        items={items}
        selected={selected}
        selecting={selecting}
        setSelected={setSelected}
        setSelecting={setSelecting}
      />
      <Grid
        f={f}
        selected={selected}
        selecting={selecting}
        setItems={setItems}
        toggle={toggle}
      />
    </div>
  );
}
