"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  browserHref,
  type NewsItem,
  timeAgo,
  useNews,
} from "@/lib/browser/news";
import {
  hostOf,
  newFeedId,
  saveFeeds,
  useNewsFeeds,
} from "@/lib/browser/store";
import { Icon } from "@/lib/icons";
import { dayKey, flag, useCalendar } from "@/lib/markets/calendar";
import { cn } from "@/lib/utils";
import { UnlockCard } from "./unlock-card";

function Thumb({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className
        )}
      >
        <Icon className="size-6" name="IconNewspaper" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: remote news images
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: image fallback
    <img
      alt=""
      className={cn("object-cover", className)}
      height={400}
      loading="lazy"
      onError={() => setBroken(true)}
      referrerPolicy="no-referrer"
      src={src}
      width={600}
    />
  );
}

function Hero({ item }: { item: NewsItem }) {
  return (
    <Link
      className="group relative block overflow-hidden rounded-3xl border bg-card"
      href={browserHref(item.link)}
    >
      <Thumb className="aspect-[16/9] w-full" src={item.image} />
      <div className="flex flex-col gap-1.5 p-4">
        <span className="text-muted-foreground text-xs">
          {item.source} · {timeAgo(item.date)}
        </span>
        <span className="font-semibold text-xl leading-snug group-hover:underline">
          {item.title}
        </span>
        {item.summary && item.summary !== item.title ? (
          <span className="line-clamp-2 text-muted-foreground text-sm">
            {item.summary}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Row({ item }: { item: NewsItem }) {
  return (
    <Link
      className="flex gap-3 rounded-2xl p-2 transition-colors hover:bg-muted/60"
      href={browserHref(item.link)}
    >
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">
          {item.source} · {timeAgo(item.date)}
        </p>
        <p className="line-clamp-3 font-medium leading-snug">{item.title}</p>
      </div>
      {item.image ? (
        <Thumb className="size-20 shrink-0 rounded-xl" src={item.image} />
      ) : null}
    </Link>
  );
}

function FeedsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feeds = useNewsFeeds();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Fontes de notícias</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <ul className="divide-y rounded-2xl border">
            {feeds.map((f) => (
              <li className="flex items-center gap-3 px-3 py-2.5" key={f.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {hostOf(f.url)}
                  </span>
                </span>
                <Switch
                  aria-label={f.name}
                  checked={f.on}
                  onCheckedChange={(on) =>
                    saveFeeds(
                      feeds.map((x) => (x.id === f.id ? { ...x, on } : x))
                    )
                  }
                />
                <button
                  aria-label={`Remover ${f.name}`}
                  className="p-1 text-muted-foreground"
                  onClick={() => saveFeeds(feeds.filter((x) => x.id !== f.id))}
                  type="button"
                >
                  <Icon className="size-4" name="IconTrashCan" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) {
                saveFeeds([
                  ...feeds,
                  {
                    id: newFeedId(),
                    name: name.trim() || hostOf(url),
                    url: url.trim(),
                    on: true,
                  },
                ]);
                setName("");
                setUrl("");
              }
            }}
          >
            <p className="font-medium text-sm">Adicionar fonte (RSS)</p>
            <Input
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              value={name}
            />
            <Input
              autoCapitalize="off"
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://site.com/feed"
              value={url}
            />
            <Button disabled={!url.trim()} type="submit">
              Adicionar
            </Button>
            <p className="text-muted-foreground text-xs">
              Dica: para um assunto, use
              https://news.google.com/rss/search?q=SEU+ASSUNTO&hl=pt-PT&gl=PT&ceid=PT:pt-150
            </p>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Today's high-impact releases, linking to the calendar. */
function TodayEvents() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const { events } = useCalendar(today, today);
  const list = (events ?? [])
    .filter(
      (e) => e.impact === "high" && dayKey(new Date(e.time)) === dayKey(today)
    )
    .slice(0, 8);
  if (!list.length) {
    return null;
  }
  return (
    <Link
      className="no-scrollbar flex gap-2 overflow-x-auto rounded-2xl border bg-card p-2"
      href="/calendario/"
    >
      <span className="flex shrink-0 items-center gap-1.5 px-2 font-semibold text-[#d03b2f] text-xs uppercase">
        <Icon className="size-4" name="IconCalendarClock" />
        Hoje
      </span>
      {list.map((e) => (
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-muted/60 px-2.5 py-1.5 text-xs"
          key={e.id}
        >
          <span>{flag(e.currency)}</span>
          <span className="tabular-nums">
            {new Date(e.time).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="max-w-48 truncate font-medium">{e.title}</span>
          {e.actual ? <span className="tabular-nums">· {e.actual}</span> : null}
        </span>
      ))}
    </Link>
  );
}

export function NewsPage() {
  const feeds = useNewsFeeds();
  const { items, error, loading, reload } = useNews(feeds);
  const [source, setSource] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  if (error === "locked") {
    return <UnlockCard onDone={reload} />;
  }
  const sources = [...new Set((items ?? []).map((i) => i.source))].slice(0, 12);
  const list = (items ?? []).filter((i) => !source || i.source === source);
  const [first, ...rest] = list;
  const withImage = first?.image ? first : list.find((i) => i.image);
  const others = withImage ? list.filter((i) => i !== withImage) : rest;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <TodayEvents />
      <div className="flex items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          <button
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm",
              source ? "bg-muted" : "bg-foreground text-background"
            )}
            onClick={() => setSource(null)}
            type="button"
          >
            Tudo
          </button>
          {sources.map((s) => (
            <button
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm",
                source === s ? "bg-foreground text-background" : "bg-muted"
              )}
              key={s}
              onClick={() => setSource(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
        <Button
          aria-label="Atualizar"
          onClick={reload}
          size="icon"
          variant="ghost"
        >
          {loading ? (
            <Spinner />
          ) : (
            <Icon className="size-4" name="IconArrowsRepeat" />
          )}
        </Button>
        <Button onClick={() => setManaging(true)} size="sm" variant="outline">
          Fontes
        </Button>
      </div>
      {items === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}
      {items && list.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-sm">
          {error ?? "Nenhuma notícia. Ative fontes em “Fontes”."}
        </p>
      ) : null}
      {withImage ? (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Hero item={withImage} />
          <div className="flex flex-col gap-1">
            {others.slice(0, 5).map((i) => (
              <Row item={i} key={i.link} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {others.slice(withImage ? 5 : 0).map((i) => (
          <Row item={i} key={i.link} />
        ))}
      </div>
      <FeedsSheet onClose={() => setManaging(false)} open={managing} />
    </div>
  );
}
