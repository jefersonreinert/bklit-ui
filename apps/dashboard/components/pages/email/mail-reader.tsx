"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/lib/icons";
import type { MailMessage, MailThread } from "@/lib/mail-types";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { fullDate } from "./mail-format";
import { Avatar } from "./mail-list";

/**
 * HTML e-mails render in a sandboxed iframe: no scripts (sandbox without
 * allow-scripts plus a CSP), links open in a new tab.
 */
function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"><base target="_blank"><style>html,body{margin:0;padding:12px;background:#fff;color:#141413;font:14px/1.5 -apple-system,system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
  // Fit the frame to its content once it loads (same-origin, no scripts)
  useEffect(() => {
    const frame = ref.current;
    if (!frame) {
      return;
    }
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) {
        setHeight(Math.min(body.scrollHeight + 24, 4000));
      }
    };
    frame.addEventListener("load", measure);
    return () => frame.removeEventListener("load", measure);
  }, []);
  return (
    <iframe
      className="w-full rounded-xl border bg-white"
      ref={ref}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      title="Conteúdo do e-mail"
    />
  );
}

function MessageCard({
  message,
  expanded,
  onToggle,
}: {
  message: MailMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="rounded-2xl border bg-card/60">
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={onToggle}
        type="button"
      >
        <Avatar name={message.from.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-medium text-sm">{message.from.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {message.from.email}
            </p>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {expanded
              ? `Para: ${message.to}${message.cc ? ` · Cc: ${message.cc}` : ""}`
              : message.text.slice(0, 120)}
          </p>
        </div>
        <span className="shrink-0 text-muted-foreground text-xs">
          {fullDate(message.date)}
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {message.html ? (
            <HtmlBody html={message.html} />
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {message.text}
            </p>
          )}
          {message.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((a) => (
                <span
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
                  key={a.filename}
                >
                  <Icon className="size-3.5" name="IconPaperclip1" />
                  {a.filename}
                  {a.size > 0 ? (
                    <span className="text-muted-foreground">
                      {Math.max(1, Math.round(a.size / 1024))} KB
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(active && "text-amber-500")}
      onClick={onClick}
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      <Icon className="size-4" name={icon} />
    </Button>
  );
}

export interface ReaderActions {
  onBack: () => void;
  onReply: (m: MailMessage, all: boolean) => void;
  onForward: (m: MailMessage) => void;
  onArchive: () => void;
  onTrash: () => void;
  onUnread: () => void;
  onStar: () => void;
}

export function MailReader({
  thread,
  loading,
  error,
  starred,
  inTrash,
  actions,
}: {
  thread: MailThread | null;
  loading: boolean;
  error: string | null;
  starred: boolean;
  inTrash: boolean;
  actions: ReaderActions;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Newest message expanded, like Gmail
    const last = thread?.messages.at(-1)?.id;
    setOpen(new Set(last ? [last] : []));
  }, [thread]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Carregando conversa…
      </div>
    );
  }
  if (error || !thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <Icon
          className="size-8"
          name={error ? "IconWarningSign" : "IconEmail1"}
        />
        {error ?? "Selecione um e-mail para ler"}
      </div>
    );
  }

  const last = thread.messages.at(-1);
  const aiPrompt = `Leia o e-mail "${thread.subject}" (thread_id=${thread.id}) no Gmail, resuma em tópicos e crie um rascunho de resposta.`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2 md:px-4">
        <Button
          aria-label="Voltar"
          className="md:hidden"
          onClick={actions.onBack}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconArrowLeft" />
        </Button>
        <ToolbarButton
          icon="IconArchive"
          label="Arquivar"
          onClick={actions.onArchive}
        />
        <ToolbarButton
          icon="IconTrashCan"
          label={inTrash ? "Restaurar" : "Excluir"}
          onClick={actions.onTrash}
        />
        <ToolbarButton
          icon="IconEmail1"
          label="Marcar como não lido"
          onClick={actions.onUnread}
        />
        <ToolbarButton
          active={starred}
          icon="IconStar"
          label={starred ? "Remover estrela" : "Marcar com estrela"}
          onClick={actions.onStar}
        />
        <Button
          className="ml-auto gap-1.5"
          nativeButton={false}
          render={
            <a
              href={`${BASE_PATH}/ia/?prompt=${encodeURIComponent(aiPrompt)}`}
            />
          }
          size="sm"
          variant="outline"
        >
          <Icon className="size-4" name="IconSparklesSoft" />
          <span className="hidden sm:inline">Responder com IA</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-6">
          <h2 className="font-semibold text-xl tracking-tight">
            {thread.subject}
          </h2>
          {thread.messages.map((m) => (
            <MessageCard
              expanded={open.has(m.id)}
              key={m.id}
              message={m}
              onToggle={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(m.id)) {
                    next.delete(m.id);
                  } else {
                    next.add(m.id);
                  }
                  return next;
                })
              }
            />
          ))}
          {last ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => actions.onReply(last, false)}
                variant="outline"
              >
                <Icon className="size-4" name="IconArrowUndoUp" />
                Responder
              </Button>
              <Button
                onClick={() => actions.onReply(last, true)}
                variant="outline"
              >
                <Icon className="size-4" name="IconPeople" />
                Responder a todos
              </Button>
              <Button onClick={() => actions.onForward(last)} variant="outline">
                <Icon className="size-4" name="IconArrowRight" />
                Encaminhar
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
