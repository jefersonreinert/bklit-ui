"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import {
  FilterSelect,
  SearchInput,
} from "@/components/pages/beverages/bev-shared";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { PERIODS } from "@/lib/ict/format";
import { ICT_CATEGORIES, RELEVANCE, RELEVANCE_LABEL } from "@/lib/ict/types";
import { cn } from "@/lib/utils";
import { type FeedPost, PostCard } from "./post-card";

const ALL = "all";
const PAGE = 15;

export interface FeedFilter {
  category: string;
  relevance: string;
  period: string;
  favorites: boolean;
  pending: boolean;
}

export const EMPTY_FILTER: FeedFilter = {
  category: ALL,
  relevance: ALL,
  period: "all",
  favorites: false,
  pending: false,
};

function toArgs(f: FeedFilter) {
  const ms = PERIODS.find((p) => p.value === f.period)?.ms ?? 0;
  return {
    category: f.category === ALL ? undefined : f.category,
    relevance: f.relevance === ALL ? undefined : f.relevance,
    favorites: f.favorites || undefined,
    pending: f.pending || undefined,
    // Rounded to the hour so the query arguments stay stable
    since: ms
      ? Math.floor((Date.now() - ms) / 3_600_000) * 3_600_000
      : undefined,
  };
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Toggle({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-9 rounded-md border px-3 text-sm transition-colors",
        on ? "border-primary bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Filters({
  filter,
  setFilter,
  query,
  setQuery,
}: {
  filter: FeedFilter;
  setFilter: (f: FeedFilter) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const set = (patch: Partial<FeedFilter>) =>
    setFilter({ ...filter, ...patch });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <SearchInput
        onChange={setQuery}
        placeholder="Pesquisar no texto original e no resumo da IA"
        value={query}
      />
      <FilterSelect
        items={[
          { value: ALL, label: "Todas as categorias" },
          ...ICT_CATEGORIES.map((c) => ({ value: c, label: c })),
        ]}
        onChange={(category) => set({ category })}
        value={filter.category}
      />
      <FilterSelect
        items={[
          { value: ALL, label: "Qualquer relevância" },
          ...RELEVANCE.map((r) => ({ value: r, label: RELEVANCE_LABEL[r] })),
        ]}
        onChange={(relevance) => set({ relevance })}
        value={filter.relevance}
      />
      <FilterSelect
        items={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        onChange={(period) => set({ period })}
        value={filter.period}
      />
      <Toggle
        label="Favoritas"
        on={filter.favorites}
        onClick={() => set({ favorites: !filter.favorites })}
      />
      <Toggle
        label="Por analisar"
        on={filter.pending}
        onClick={() => set({ pending: !filter.pending })}
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
      {text}
    </p>
  );
}

function SearchResults({
  text,
  args,
  interests,
}: {
  text: string;
  args: ReturnType<typeof toArgs>;
  interests: string[];
}) {
  const hits = useQuery(api.ict.search, { text, ...args, pending: undefined });
  if (hits === undefined) {
    return <Empty text="A pesquisar…" />;
  }
  if (hits.length === 0) {
    return <Empty text={`Nada encontrado para “${text}”.`} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        {hits.length} resultado(s) (máx. 50)
      </p>
      {hits.map((p) => (
        <PostCard interests={interests} key={p.postId} post={p as FeedPost} />
      ))}
    </div>
  );
}

export function IctFeed({
  interests,
  latestId,
  hasPosts,
}: {
  interests: string[];
  latestId: string | null;
  hasPosts: boolean;
}) {
  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FILTER);
  const [query, setQuery] = useState("");
  const text = useDebounced(query.trim(), 350);
  const args = useMemo(() => toArgs(filter), [filter]);
  const { results, status, loadMore } = usePaginatedQuery(
    api.ict.feed,
    text ? "skip" : args,
    { initialNumItems: PAGE }
  );

  let body: React.ReactNode;
  if (text) {
    body = <SearchResults args={args} interests={interests} text={text} />;
  } else if (status === "LoadingFirstPage") {
    body = <Empty text="A carregar publicações…" />;
  } else if (results.length === 0) {
    body = (
      <Empty
        text={
          hasPosts
            ? "Nenhuma publicação com estes filtros."
            : "Ainda não há publicações guardadas. Elas aparecem aqui assim que a primeira sincronização com a API do X terminar."
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {results.map((p) => (
          <PostCard
            featured={p.postId === latestId && filter === EMPTY_FILTER}
            interests={interests}
            key={p.postId}
            post={p as FeedPost}
          />
        ))}
        {status === "CanLoadMore" ? (
          <Button onClick={() => loadMore(PAGE)} variant="outline">
            <Icon className="size-4" name="IconArrowDown" />
            Carregar mais
          </Button>
        ) : null}
        {status === "LoadingMore" ? (
          <p className="text-center text-muted-foreground text-sm">
            A carregar…
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Filters
        filter={filter}
        query={query}
        setFilter={setFilter}
        setQuery={setQuery}
      />
      {body}
    </div>
  );
}
