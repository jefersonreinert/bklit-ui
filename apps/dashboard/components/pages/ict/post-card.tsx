"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { formatDateTime } from "@/lib/ict/format";
import {
  ICT_ACCOUNT,
  type IctAnalysisResult,
  RELEVANCE_LABEL,
  type Relevance,
} from "@/lib/ict/types";
import { cn } from "@/lib/utils";

export interface FeedPost {
  postId: string;
  username: string;
  text: string;
  createdAt: number;
  url: string;
  references: { type: string; id: string }[];
  media: { type: string; url?: string; previewUrl?: string }[];
  urls: string[];
  metrics?: Record<string, number>;
  analysisStatus: "pending" | "running" | "completed" | "failed";
  favorite: boolean;
  read: boolean;
  analysis: {
    result: IctAnalysisResult | null;
    model: string | null;
    analyzedAt: number | null;
    lastError: string | null;
    runs: number;
  };
}

const SCHEME = /^https?:\/\//;

const REF_LABEL: Record<string, string> = {
  replied_to: "Resposta a",
  quoted: "Cita",
  retweeted: "Repost de",
};

const RELEVANCE_TONE: Record<Relevance, string> = {
  low: "text-muted-foreground",
  medium: "text-warning",
  high: "text-destructive",
};

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="mb-1 font-medium text-muted-foreground text-xs">{title}</p>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{title}</span>
      {items.map((x) => (
        <Badge key={x} variant="outline">
          {x}
        </Badge>
      ))}
    </div>
  );
}

function History({ postId }: { postId: string }) {
  const runs = useQuery(api.ict.analysisHistory, { postId });
  if (!runs) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
      {runs.map((r) => (
        <li key={r.id}>
          {formatDateTime(r.createdAt)} · {r.model || "—"} ·{" "}
          {r.status === "completed"
            ? `${r.category} · relevância ${r.relevance}`
            : `falhou: ${r.error}`}
        </li>
      ))}
    </ul>
  );
}

function AnalysisBody({
  a,
  model,
  at,
  postId,
}: {
  a: IctAnalysisResult;
  model: string | null;
  at: number | null;
  postId: string;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{a.summary_pt}</p>
      <p className="text-sm">
        <span className="font-medium">Mensagem principal: </span>
        {a.main_message}
      </p>
      <p className={cn("text-xs", RELEVANCE_TONE[a.relevance])}>
        Relevância {RELEVANCE_LABEL[a.relevance].toLowerCase()}:{" "}
        {a.relevance_reason}
      </p>
      {a.insufficient_data ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
          Dados insuficientes: a publicação depende de conteúdo que a IA não viu
          (link, vídeo, imagem ou outro post).
        </p>
      ) : null}
      {a.concepts.length ? (
        <div>
          <p className="mb-1 font-medium text-muted-foreground text-xs">
            Conceitos mencionados
          </p>
          <dl className="flex flex-col gap-1 text-sm">
            {a.concepts.map((c) => (
              <div key={c.name}>
                <dt className="inline font-medium">{c.name}: </dt>
                <dd className="inline text-muted-foreground">
                  {c.explanation_pt}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <Chips items={a.instruments} title="Instrumentos" />
      <Chips items={a.sessions} title="Sessões" />
      <Chips items={a.price_levels} title="Níveis de preço" />
      <Chips items={a.events} title="Eventos" />
      <List items={a.key_points} title="Pontos principais" />
      <List items={a.facts} title="O que o autor afirma" />
      {a.interpretation ? (
        <div>
          <p className="mb-1 font-medium text-muted-foreground text-xs">
            Interpretação da IA (não é afirmação do autor)
          </p>
          <p className="text-sm italic">{a.interpretation}</p>
        </div>
      ) : null}
      <List items={a.uncertainties} title="Incertezas e ambiguidades" />
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span>
          Grok · {model ?? "—"} · {formatDateTime(at)}
        </span>
        <button
          className="underline underline-offset-2"
          onClick={() => setShowHistory(!showHistory)}
          type="button"
        >
          {showHistory ? "Esconder histórico" : "Histórico de análises"}
        </button>
      </div>
      {showHistory ? <History postId={postId} /> : null}
    </div>
  );
}

function AnalyzeButton({ post }: { post: FeedPost }) {
  const reanalyze = useMutation(api.ict.reanalyze);
  const [asked, setAsked] = useState(false);
  const failed = post.analysisStatus === "failed";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
      <Button
        disabled={asked}
        onClick={async () => {
          setAsked(true);
          await reanalyze({ postId: post.postId }).catch(() => setAsked(false));
        }}
        size="sm"
      >
        <Icon
          className="size-4"
          name={asked ? "IconLoader" : "IconSparklesSoft"}
        />
        {asked ? "Pedido enviado…" : "Analisar com IA"}
      </Button>
      <span className="text-muted-foreground text-xs">
        {failed
          ? `A última análise falhou${post.analysis.lastError ? `: ${post.analysis.lastError}` : "."}`
          : "Resumo, conceitos ICT e relevância pelo Grok (consome créditos da xAI)."}
      </span>
    </div>
  );
}

function AnalysisSection({ post }: { post: FeedPost }) {
  // Collapsed until the header is tapped
  const [open, setOpen] = useState(false);
  const a = post.analysis.result;
  if (!a && post.analysisStatus !== "running") {
    return <AnalyzeButton post={post} />;
  }
  let state = "Análise pendente";
  if (post.analysisStatus === "running") {
    state = "A analisar com o Grok…";
  } else if (post.analysisStatus === "failed") {
    state = `Análise falhada${post.analysis.lastError ? `: ${post.analysis.lastError}` : ""}`;
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Icon className="size-4" name="IconSparklesSoft" />
        <span className="font-medium text-sm">Análise do Grok</span>
        {a ? (
          <>
            <Badge variant="secondary">{a.category}</Badge>
            <span className={cn("text-xs", RELEVANCE_TONE[a.relevance])}>
              {RELEVANCE_LABEL[a.relevance]}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">{state}</span>
        )}
        <Icon
          className={cn(
            "ml-auto size-4 transition-transform",
            open && "rotate-90"
          )}
          name="IconChevronRight"
        />
      </button>
      {open && a ? (
        <div className="mt-3">
          <AnalysisBody
            a={a}
            at={post.analysis.analyzedAt}
            model={post.analysis.model}
            postId={post.postId}
          />
          {post.analysisStatus === "running" ? (
            <p className="mt-2 text-muted-foreground text-xs">A reanalisar…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Profile photo (X avatar), or the initials when there is none yet. */
export function Avatar({
  src,
  size = 36,
}: {
  src: string | null;
  size?: number;
}) {
  if (!src) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background text-xs"
        style={{ height: size, width: size }}
      >
        ICT
      </span>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: X CDN image
    <img
      alt="The Inner Circle Trader"
      className="shrink-0 rounded-full object-cover"
      height={size}
      referrerPolicy="no-referrer"
      src={src}
      style={{ height: size, width: size }}
      width={size}
    />
  );
}

function MediaGrid({ post }: { post: FeedPost }) {
  const shown = post.media.filter((m) => m.url || m.previewUrl).slice(0, 4);
  if (shown.length === 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "grid gap-1.5 overflow-hidden rounded-xl",
        shown.length > 1 && "grid-cols-2"
      )}
    >
      {shown.map((m) => {
        const src = m.type === "photo" ? (m.url ?? m.previewUrl) : m.previewUrl;
        return (
          <a
            className="relative block bg-muted"
            href={post.url}
            key={src}
            rel="noopener noreferrer"
            target="_blank"
          >
            {/* biome-ignore lint/performance/noImgElement: X CDN image */}
            <img
              alt=""
              className={cn(
                "w-full object-cover",
                shown.length > 1 ? "aspect-square" : "max-h-[520px]"
              )}
              height={400}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={src}
              width={600}
            />
            {m.type === "photo" ? null : (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-black/60 text-white">
                  <Icon className="size-5" name="IconPlay" />
                </span>
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

/** Links of the post itself (photo/video pages) are not shown as links. */
const MEDIA_LINK = /x\.com\/[^/]+\/status\/\d+\/(photo|video)\//;

export function PostCard({
  post,
  featured,
  interests,
  avatar,
}: {
  avatar: string | null;
  post: FeedPost;
  featured?: boolean;
  interests: string[];
}) {
  const setFlags = useMutation(api.ict.setFlags);
  const reanalyze = useMutation(api.ict.reanalyze);
  const [copied, setCopied] = useState(false);
  const interesting =
    post.analysis.result && interests.includes(post.analysis.result.category);
  const links = post.urls.filter((u) => !MEDIA_LINK.test(u));

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        featured && "border-primary/50 ring-1 ring-primary/30",
        !post.read && "border-l-4 border-l-primary"
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Avatar src={avatar} />
        <span className="font-semibold text-sm">{ICT_ACCOUNT.name}</span>
        <span className="text-muted-foreground text-sm">@{post.username}</span>
        <span className="text-muted-foreground text-xs">
          · {formatDateTime(post.createdAt)}
        </span>
        {featured ? <Badge>Mais recente</Badge> : null}
        {interesting ? <Badge variant="outline">Interesse</Badge> : null}
        <a
          className="ml-auto text-muted-foreground text-xs underline-offset-2 hover:underline"
          href={post.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Ver no X
        </a>
      </header>

      {post.references.length ? (
        <p className="text-muted-foreground text-xs">
          {post.references
            .map((r) => `${REF_LABEL[r.type] ?? r.type} post ${r.id}`)
            .join(" · ")}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {post.text}
      </p>
      <MediaGrid post={post} />
      {links.length ? (
        <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
          {links.map((u) => (
            <a
              className="truncate underline underline-offset-2"
              href={u}
              key={u}
              rel="noopener noreferrer"
              target="_blank"
            >
              {u.replace(SCHEME, "").slice(0, 60)}
            </a>
          ))}
        </div>
      ) : null}

      <AnalysisSection post={post} />

      <div className="flex flex-wrap gap-1.5">
        <Button
          onClick={() =>
            setFlags({ postId: post.postId, favorite: !post.favorite })
          }
          size="sm"
          variant={post.favorite ? "secondary" : "ghost"}
        >
          <Icon className="size-4" name="IconStar" />
          {post.favorite ? "Favorita" : "Favoritar"}
        </Button>
        <Button
          onClick={() => setFlags({ postId: post.postId, read: !post.read })}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconCheckmark1Small" />
          {post.read ? "Marcar não lida" : "Marcar lida"}
        </Button>
        {post.analysis.result ? (
          <Button
            disabled={post.analysisStatus === "running"}
            onClick={() => reanalyze({ postId: post.postId })}
            size="sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowsRepeat" />
            Reanalisar
          </Button>
        ) : null}
        <Button
          onClick={async () => {
            await navigator.clipboard
              .writeText(post.url)
              .catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconSquareBehindSquare1" />
          {copied ? "Copiado" : "Copiar link"}
        </Button>
      </div>
    </article>
  );
}
