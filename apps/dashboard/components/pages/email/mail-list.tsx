"use client";

import { Icon } from "@bklitui/icons";
import type { MailSummary } from "@/lib/mail-types";
import { cn } from "@/lib/utils";
import { initials, listDate } from "./mail-format";

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="flex gap-3 border-b px-4 py-3" key={i}>
          <span className="size-9 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <span className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MailList({
  messages,
  loading,
  error,
  selectedId,
  sentView,
  hasMore,
  onOpen,
  onStar,
  onLoadMore,
}: {
  messages: MailSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  sentView: boolean;
  hasMore: boolean;
  onOpen: (m: MailSummary) => void;
  onStar: (m: MailSummary) => void;
  onLoadMore: () => void;
}) {
  if (loading && messages.length === 0) {
    return <ListSkeleton />;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground text-sm">
        <Icon className="size-6" name="IconWarningSign" />
        {error}
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground text-sm">
        <Icon className="size-7" name="IconInboxEmpty" />
        Nenhum e-mail aqui.
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {messages.map((m) => {
        const who = sentView ? `Para: ${m.to || "—"}` : m.from.name;
        return (
          <li
            className={cn(
              "group relative border-b transition-colors hover:bg-muted/50",
              selectedId === m.threadId && "bg-muted"
            )}
            key={m.id}
          >
            <button
              className="flex w-full gap-3 px-4 py-3 text-left"
              onClick={() => onOpen(m)}
              type="button"
            >
              <Avatar name={sentView ? m.to || "?" : m.from.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      m.unread ? "font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {who}
                  </p>
                  {m.hasAttachments ? (
                    <Icon
                      className="size-3.5 shrink-0 text-muted-foreground"
                      name="IconPaperclip1"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      m.unread ? "font-medium" : "text-muted-foreground"
                    )}
                  >
                    {listDate(m.date)}
                  </span>
                </div>
                <p
                  className={cn(
                    "truncate pr-6 text-sm",
                    m.unread && "font-medium"
                  )}
                >
                  {m.subject}
                </p>
                <p className="line-clamp-1 pr-6 text-muted-foreground text-xs">
                  {m.snippet}
                </p>
              </div>
            </button>
            {m.unread ? (
              <span className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
            <button
              aria-label={m.starred ? "Remover estrela" : "Marcar com estrela"}
              aria-pressed={m.starred}
              className={cn(
                "absolute right-3 bottom-3 rounded p-0.5 text-muted-foreground hover:text-foreground",
                m.starred
                  ? "text-amber-500 hover:text-amber-600"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              )}
              onClick={() => onStar(m)}
              type="button"
            >
              <Icon className="size-4" name="IconStar" />
            </button>
          </li>
        );
      })}
      {hasMore ? (
        <li className="p-3">
          <button
            className="w-full rounded-lg border py-2 text-muted-foreground text-sm hover:bg-muted"
            onClick={onLoadMore}
            type="button"
          >
            Carregar mais
          </button>
        </li>
      ) : null}
    </ul>
  );
}
