"use client";

import { Icon } from "@/lib/icons";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  type YtTranscript,
  type YtVideoDetails,
} from "@/lib/youtube-types";
import { SaveMenu } from "../videos/save-menu";
import {
  relativeDate,
  shortNumber,
  timestamp,
  useTranscript,
  useYt,
} from "./use-youtube";

const WHITESPACE = /\s+/;

function Stat({
  icon,
  value,
  label,
}: {
  icon: "IconEyeOpen" | "IconThumbsUp" | "IconBubbleText" | "IconClock";
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card/60 px-3 py-2">
      <Icon className="size-4 text-muted-foreground" name={icon} />
      <div className="leading-tight">
        <p className="font-medium text-sm tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TranscriptBody({
  transcript,
  onSeek,
  title,
}: {
  transcript: YtTranscript;
  onSeek: (s: number) => void;
  title: string;
}) {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const needle = filter.trim().toLowerCase();
  const segments = needle
    ? transcript.segments.filter((s) => s.text.toLowerCase().includes(needle))
    : transcript.segments;
  const words = useMemo(
    () => transcript.text.split(WHITESPACE).filter(Boolean).length,
    [transcript.text]
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Procurar na transcrição"
          className="h-8 max-w-56"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Procurar na transcrição"
          type="search"
          value={filter}
        />
        <span className="text-muted-foreground text-xs">
          {words.toLocaleString("pt-BR")} palavras
        </span>
        <div className="ml-auto flex gap-1">
          <Button onClick={copy} size="sm" variant="outline">
            <Icon
              className="size-4"
              name={copied ? "IconCheckmark1" : "IconSquareBehindSquare1"}
            />
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button
            onClick={() =>
              download(
                `transcricao-${transcript.videoId}.txt`,
                `${title}\nhttps://youtu.be/${transcript.videoId}\n\n${transcript.text}`
              )
            }
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconArrowDown" />
            .txt
          </Button>
        </div>
      </div>
      <ol className="max-h-[60vh] overflow-y-auto rounded-xl border bg-card/40 p-2">
        {segments.map((s, i) => (
          <li
            className="flex gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50"
            key={`${s.start}-${i}`}
          >
            {s.start === null ? (
              <span className="w-12 shrink-0" />
            ) : (
              <button
                className="w-12 shrink-0 text-left font-mono text-muted-foreground text-xs tabular-nums hover:text-foreground"
                onClick={() => onSeek(s.start ?? 0)}
                type="button"
              >
                {timestamp(s.start)}
              </button>
            )}
            <span className="text-sm leading-relaxed">{s.text}</span>
          </li>
        ))}
        {segments.length === 0 ? (
          <li className="p-4 text-center text-muted-foreground text-sm">
            Nada encontrado.
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function TranscriptPanel({
  video,
  enabled,
  onSeek,
}: {
  video: YtVideoDetails;
  enabled: boolean;
  onSeek: (s: number) => void;
}) {
  const { transcript, loading, error, run } = useTranscript(video.id);
  if (!enabled) {
    return (
      <p className="rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
        A transcrição completa usa a API do Gemini (Google). Adicione{" "}
        <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> no Vercel
        para ativar. Enquanto isso, no app do YouTube use{" "}
        <b>⋯ → Mostrar transcrição</b> e cole o texto no Assistente IA.
      </p>
    );
  }
  if (transcript) {
    return (
      <TranscriptBody
        onSeek={onSeek}
        title={video.title}
        transcript={transcript}
      />
    );
  }
  const long = video.duration > 3600;
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-muted/30 p-4">
      <p className="text-muted-foreground text-sm">
        Gera a transcrição completa da fala, com os tempos de cada trecho.
        {long
          ? ` Este vídeo tem ${formatDuration(video.duration)}: pode levar alguns minutos.`
          : " Leva de alguns segundos a um minuto."}
      </p>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={loading} onClick={run}>
        <Icon
          className={cn("size-4", loading && "animate-spin")}
          name={loading ? "IconLoader" : "IconFileText"}
        />
        {loading ? "Transcrevendo…" : "Transcrever vídeo completo"}
      </Button>
    </div>
  );
}

export function VideoView({
  id,
  transcripts,
  onChannel,
}: {
  id: string;
  transcripts: boolean;
  onChannel: (channelId: string) => void;
}) {
  const {
    data: video,
    loading,
    error,
  } = useYt<YtVideoDetails>("video", { id });
  const [start, setStart] = useState<{ t: number; n: number }>({ t: 0, n: 0 });
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="aspect-video animate-pulse rounded-2xl bg-muted" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (error || !video) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        {error ?? "Vídeo não encontrado."}
      </p>
    );
  }

  const seek = (t: number) => {
    setStart((s) => ({ t, n: s.n + 1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const prompt = `Use o YouTube: transcreva o vídeo https://youtu.be/${video.id} ("${video.title}") e me dê um resumo em tópicos com as ideias práticas para o restaurante.`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full"
            key={start.n}
            referrerPolicy="strict-origin-when-cross-origin"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&start=${start.t}${start.n ? "&autoplay=1" : ""}`}
            title={video.title}
          />
        </div>
        <div>
          <h2 className="font-semibold text-lg leading-snug tracking-tight md:text-xl">
            {video.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
            <button
              className="font-medium text-foreground hover:underline"
              onClick={() => onChannel(video.channelId)}
              type="button"
            >
              {video.channelTitle}
            </button>
            <span>·</span>
            <span>
              {new Date(video.publishedAt).toLocaleDateString("pt-BR")}
            </span>
            <span>({relativeDate(video.publishedAt)})</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            icon="IconClock"
            label="duração"
            value={formatDuration(video.duration)}
          />
          <Stat
            icon="IconEyeOpen"
            label="visualizações"
            value={shortNumber(video.views)}
          />
          <Stat
            icon="IconThumbsUp"
            label="curtidas"
            value={shortNumber(video.likes)}
          />
          <Stat
            icon="IconBubbleText"
            label="comentários"
            value={shortNumber(video.comments)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveMenu video={video} />
          <Button
            nativeButton={false}
            render={
              <a
                href={`${BASE_PATH}/ia/?prompt=${encodeURIComponent(prompt)}`}
              />
            }
            variant="outline"
          >
            <Icon className="size-4" name="IconSparklesSoft" />
            Analisar com IA
          </Button>
          <Button
            nativeButton={false}
            render={
              <a
                href={`https://youtu.be/${video.id}`}
                rel="noopener noreferrer"
                target="_blank"
              />
            }
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowUpRight" />
            Abrir no YouTube
          </Button>
        </div>

        <section className="rounded-2xl border bg-card/60 p-4">
          <h3 className="mb-2 font-medium text-sm">Descrição</h3>
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-muted-foreground text-sm leading-relaxed",
              !showAll && "line-clamp-6"
            )}
          >
            {video.description || "Sem descrição."}
          </p>
          {video.description.length > 400 ? (
            <button
              className="mt-2 font-medium text-xs hover:underline"
              onClick={() => setShowAll((v) => !v)}
              type="button"
            >
              {showAll ? "Mostrar menos" : "Mostrar tudo"}
            </button>
          ) : null}
          {video.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {video.tags.slice(0, 20).map((t) => (
                <span
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                  key={t}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-medium">
            <Icon className="size-4" name="IconFileText" />
            Transcrição completa
          </h3>
          <TranscriptPanel enabled={transcripts} onSeek={seek} video={video} />
        </section>
      </div>

      <aside className="flex flex-col gap-3">
        <h3 className="font-medium text-sm">
          Comentários em destaque{" "}
          <span className="text-muted-foreground">
            ({video.topComments.length})
          </span>
        </h3>
        {video.topComments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Comentários indisponíveis.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {video.topComments.map((c, i) => (
              <li
                className="rounded-xl border bg-card/60 p-3"
                key={`${c.author}-${i}`}
              >
                <p className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{c.author}</span>
                  <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Icon className="size-3" name="IconThumbsUp" />
                    {shortNumber(c.likes)}
                  </span>
                </p>
                <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-muted-foreground text-sm">
                  {c.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
