"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BASE_PATH, googleStartUrl, useConnectors } from "@/lib/use-connectors";
import {
  parseYtLink,
  YT_DURATIONS,
  YT_ORDERS,
  type YtDuration,
  type YtOrder,
  type YtSearchResult,
  type YtVideo,
} from "@/lib/youtube-types";
import { useLibraryWith } from "../videos/library-store";
import { ChannelView, PlaylistView } from "./collection-views";
import { LibraryView } from "./library-view";
import { ytGet } from "./use-youtube";
import { GridSkeleton, VideoCard } from "./video-card";
import { VideoView } from "./video-view";

type View =
  | { kind: "search" }
  | { kind: "video"; id: string }
  | { kind: "channel"; id?: string; handle?: string }
  | { kind: "playlist"; id: string }
  | { kind: "me" };

const SUGGESTIONS = [
  "técnicas de churrasco picanha",
  "harmonização vinho e carne",
  "gestão de restaurante CMV",
  "coquetéis clássicos bartender",
  "defumação low and slow",
];

/** Mirrors the open view in the URL so it can be shared or reloaded. */
function viewToQuery(v: View) {
  if (v.kind === "video") {
    return `?v=${v.id}`;
  }
  if (v.kind === "playlist") {
    return `?list=${v.id}`;
  }
  if (v.kind === "me") {
    return "?me=1";
  }
  if (v.kind === "channel") {
    return v.id
      ? `?channel=${v.id}`
      : `?channel=${encodeURIComponent(v.handle ?? "")}`;
  }
  return "";
}

function viewFromQuery(search: string): View | null {
  const p = new URLSearchParams(search);
  const v = p.get("v");
  const list = p.get("list");
  const channel = p.get("channel");
  if (p.get("me") || p.get("connected") === "google") {
    return { kind: "me" };
  }
  if (v) {
    return { kind: "video", id: v };
  }
  if (list) {
    return { kind: "playlist", id: list };
  }
  if (channel) {
    return channel.startsWith("UC")
      ? { kind: "channel", id: channel }
      : { kind: "channel", handle: channel };
  }
  return null;
}

function SearchResults({
  result,
  loading,
  error,
  onVideo,
  onChannel,
  onMore,
}: {
  result: YtSearchResult | null;
  loading: boolean;
  error: string | null;
  onVideo: (id: string) => void;
  onChannel: (id: string) => void;
  onMore: () => void;
}) {
  if (error) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">{error}</p>
    );
  }
  if (!result && loading) {
    return <GridSkeleton />;
  }
  if (!result) {
    return null;
  }
  if (result.videos.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Nenhum vídeo encontrado.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {result.videos.map((v: YtVideo) => (
          <VideoCard
            key={v.id}
            onChannel={() => onChannel(v.channelId)}
            onOpen={() => onVideo(v.id)}
            video={v}
          />
        ))}
      </div>
      {result.nextPageToken ? (
        <Button
          className="self-center"
          disabled={loading}
          onClick={onMore}
          variant="outline"
        >
          {loading ? "Carregando…" : "Mais resultados"}
        </Button>
      ) : null}
    </div>
  );
}

/** "Minha conta" entry: opens the library, or connects the Google login. */
function AccountBar({
  hasAccount,
  canConnect,
  open,
  onOpen,
}: {
  hasAccount: boolean;
  canConnect: boolean;
  open: boolean;
  onOpen: () => void;
}) {
  if (open) {
    return null;
  }
  if (hasAccount) {
    return (
      <button
        className="flex w-fit items-center gap-2 rounded-xl border bg-card/60 px-3 py-2 text-sm hover:bg-muted"
        onClick={onOpen}
        type="button"
      >
        <Icon className="size-4" name="IconYoutube" />
        Minha conta: playlists, inscrições e curtidos
        <Icon className="size-4 text-muted-foreground" name="IconArrowRight" />
      </button>
    );
  }
  if (!canConnect) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-3 py-2 text-sm">
      <Icon className="size-4 shrink-0" name="IconYoutube" />
      <span className="flex-1 text-muted-foreground">
        Conecte a sua conta para ver suas playlists (inclusive privadas),
        inscrições e vídeos curtidos.
      </span>
      <a
        className="rounded-md bg-foreground px-2.5 py-1 font-medium text-background text-xs"
        href={googleStartUrl(`${BASE_PATH}/youtube/`)}
      >
        Conectar com Google
      </a>
    </div>
  );
}

export function YoutubePage() {
  const { status } = useConnectors();
  // Enables the "Salvar" buttons (shared video library)
  useLibraryWith(status);
  const [stack, setStack] = useState<View[]>([{ kind: "search" }]);
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<YtOrder>("relevance");
  const [duration, setDuration] = useState<YtDuration>("any");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<YtSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = stack.at(-1) ?? { kind: "search" };

  // Deep link (?v= / ?list= / ?channel=) on first load
  useEffect(() => {
    const initial = viewFromQuery(window.location.search);
    if (initial) {
      setStack([{ kind: "search" }, initial]);
    }
  }, []);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${viewToQuery(view)}`
    );
  }, [view]);

  const push = useCallback((v: View) => {
    setStack((s) => [...s, v]);
    window.scrollTo({ top: 0 });
  }, []);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const runSearch = useCallback(
    async (q: string, pageToken?: string) => {
      if (!q.trim()) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const page = await ytGet<YtSearchResult>("search", {
          q,
          order,
          duration,
          pageToken: pageToken ?? "",
        });
        setResult((prev) =>
          pageToken && prev
            ? { ...page, videos: [...prev.videos, ...page.videos] }
            : page
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro na busca");
      } finally {
        setLoading(false);
      }
    },
    [order, duration]
  );

  // Re-run when filters change
  useEffect(() => {
    if (query) {
      runSearch(query);
    }
  }, [query, runSearch]);

  const submit = (e?: FormEvent, value = input) => {
    e?.preventDefault();
    const link = parseYtLink(value);
    if (link?.kind === "video" || link?.kind === "playlist") {
      push({ kind: link.kind, id: link.id });
      return;
    }
    if (link?.kind === "channel") {
      push({ kind: "channel", id: link.id });
      return;
    }
    if (link?.kind === "handle") {
      push({ kind: "channel", handle: link.handle });
      return;
    }
    setStack([{ kind: "search" }]);
    setResult(null);
    setQuery(value.trim());
  };

  const unavailable = status && !status.youtube.available;
  const transcripts = status?.youtube.transcripts ?? false;
  const openVideo = (id: string) => push({ kind: "video", id });
  const openChannel = (id: string) => push({ kind: "channel", id });

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2 md:flex-row md:items-center"
        onSubmit={submit}
      >
        <div className="flex flex-1 items-center gap-2">
          {stack.length > 1 ? (
            <Button
              aria-label="Voltar"
              onClick={back}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Icon className="size-4" name="IconArrowLeft" />
            </Button>
          ) : null}
          <div className="relative flex-1">
            <Icon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              name="IconMagnifyingGlass"
            />
            <Input
              aria-label="Pesquisar no YouTube ou colar link"
              className="h-10 pl-9"
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pesquisar vídeos, ou colar link de vídeo, playlist ou @canal"
              type="search"
              value={input}
            />
          </div>
          <Button className="h-10" disabled={!input.trim()} type="submit">
            Buscar
          </Button>
        </div>
        {view.kind === "search" ? (
          <div className="flex gap-2">
            <Select
              items={YT_ORDERS.map((o) => ({ value: o.id, label: o.label }))}
              onValueChange={(v) => setOrder(v as YtOrder)}
              value={order}
            >
              <SelectTrigger
                aria-label="Ordenar por"
                className="h-10 w-full md:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YT_ORDERS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={YT_DURATIONS.map((d) => ({ value: d.id, label: d.label }))}
              onValueChange={(v) => setDuration(v as YtDuration)}
              value={duration}
            >
              <SelectTrigger
                aria-label="Duração"
                className="h-10 w-full md:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YT_DURATIONS.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </form>

      <AccountBar
        canConnect={Boolean(status?.configured && status.google.available)}
        hasAccount={Boolean(status?.google.youtube)}
        onOpen={() => push({ kind: "me" })}
        open={view.kind === "me"}
      />

      {unavailable ? (
        <p className="rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
          Configure{" "}
          <code className="rounded bg-muted px-1">YOUTUBE_API_KEY</code> no
          Vercel para pesquisar no YouTube.
        </p>
      ) : null}

      {view.kind === "search" && !query ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Icon className="size-7" name="IconYoutube" />
          </span>
          <div>
            <p className="font-medium">Pesquise vídeos de qualquer canal</p>
            <p className="text-muted-foreground text-sm">
              Detalhes, duração, playlists completas e{" "}
              {transcripts ? "transcrição integral" : "comentários"} de cada
              vídeo.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                className="rounded-xl border bg-card/60 px-3 py-1.5 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
                key={s}
                onClick={() => {
                  setInput(s);
                  submit(undefined, s);
                }}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {view.kind === "search" && query ? (
        <SearchResults
          error={error}
          loading={loading}
          onChannel={openChannel}
          onMore={() => runSearch(query, result?.nextPageToken ?? undefined)}
          onVideo={openVideo}
          result={result}
        />
      ) : null}
      {view.kind === "video" ? (
        <VideoView
          id={view.id}
          key={view.id}
          onChannel={openChannel}
          transcripts={transcripts}
        />
      ) : null}
      {view.kind === "channel" ? (
        <ChannelView
          key={view.id ?? view.handle}
          onPlaylist={(id) => push({ kind: "playlist", id })}
          onVideo={openVideo}
          target={view}
        />
      ) : null}
      {view.kind === "me" ? (
        <LibraryView
          onChannel={openChannel}
          onPlaylist={(id) => push({ kind: "playlist", id })}
          onVideo={openVideo}
        />
      ) : null}
      {view.kind === "playlist" ? (
        <PlaylistView
          id={view.id}
          key={view.id}
          onChannel={openChannel}
          onVideo={openVideo}
        />
      ) : null}
    </div>
  );
}
