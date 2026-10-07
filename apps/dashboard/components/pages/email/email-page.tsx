"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import {
  MAIL_FOLDERS,
  type MailFolderId,
  type MailMessage,
  type MailSummary,
  type MailThread,
} from "@/lib/mail-types";
import { BASE_PATH, googleStartUrl } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import {
  ComposeSheet,
  type ComposeState,
  EMPTY_COMPOSE,
} from "./compose-sheet";
import { plainText, quote, withPrefix } from "./mail-format";
import { MailList } from "./mail-list";
import { MailReader } from "./mail-reader";
import { useMail } from "./use-mail";

function FolderNav({
  folder,
  unread,
  onSelect,
  vertical,
}: {
  folder: MailFolderId;
  unread: number;
  onSelect: (f: MailFolderId) => void;
  vertical: boolean;
}) {
  return (
    <nav
      aria-label="Pastas"
      className={cn(
        "flex gap-1",
        vertical ? "flex-col" : "overflow-x-auto px-3 pb-2"
      )}
    >
      {MAIL_FOLDERS.map((f) => (
        <button
          aria-current={folder === f.id ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
            folder === f.id
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            !vertical && "border"
          )}
          key={f.id}
          onClick={() => onSelect(f.id)}
          type="button"
        >
          <Icon className="size-4" name={f.icon} />
          <span className={cn(vertical && "flex-1 text-left")}>{f.label}</span>
          {f.id === "inbox" && unread > 0 ? (
            <span className="rounded-full bg-foreground px-1.5 text-[11px] text-background tabular-nums">
              {unread}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

function DemoBanner({ canConnect }: { canConnect: boolean }) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
      <Icon className="size-4 shrink-0" name="IconCircleInfo" />
      <span className="flex-1 text-muted-foreground">
        Caixa de exemplo. Conecte o Google para ver os seus e-mails.
      </span>
      <a
        className="shrink-0 rounded-md bg-foreground px-2 py-1 font-medium text-background"
        href={
          canConnect
            ? googleStartUrl(`${BASE_PATH}/email/`)
            : `${BASE_PATH}/conectores/`
        }
      >
        Conectar
      </a>
    </div>
  );
}

function replyDraft(
  m: MailMessage,
  all: boolean,
  threadId: string,
  me: string
) {
  const others = all
    ? [m.to, m.cc]
        .join(",")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.toLowerCase().includes(me.toLowerCase()))
    : [];
  return {
    title: all ? "Responder a todos" : "Responder",
    to: m.from.email,
    cc: others.join(", "),
    subject: withPrefix("Re:", m.subject),
    body: quote(plainText(m.text, m.html), m.from.name, m.date),
    threadId,
    inReplyTo: m.messageId,
    references: m.references,
  };
}

export function EmailPage() {
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const mail = useMail(folder, query);
  const [selected, setSelected] = useState<MailSummary | null>(null);
  const [thread, setThread] = useState<MailThread | null>(null);
  const [threadState, setThreadState] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: false, error: null });
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const changeFolder = (f: MailFolderId) => {
    setFolder(f);
    setSelected(null);
    setThread(null);
  };

  const { act, getThread } = mail;
  const open = useCallback(
    async (m: MailSummary) => {
      setSelected(m);
      setThread(null);
      setThreadState({ loading: true, error: null });
      if (m.unread) {
        act(m, "read");
      }
      try {
        setThread(await getThread(m.threadId));
        setThreadState({ loading: false, error: null });
      } catch (e) {
        setThreadState({
          loading: false,
          error: e instanceof Error ? e.message : "Erro ao abrir",
        });
      }
    },
    [act, getThread]
  );

  const current = selected
    ? (mail.list.find((m) => m.id === selected.id) ?? selected)
    : null;

  const closeReader = () => {
    setSelected(null);
    setThread(null);
  };

  const openCompose = (state: ComposeState) => {
    setCompose(state);
    setComposeOpen(true);
  };

  const actions = {
    onBack: closeReader,
    onReply: (m: MailMessage, all: boolean) =>
      openCompose(replyDraft(m, all, thread?.id ?? m.id, mail.account)),
    onForward: (m: MailMessage) =>
      openCompose({
        title: "Encaminhar",
        to: "",
        cc: "",
        subject: withPrefix("Fwd:", m.subject),
        body: `\n\n---------- Mensagem encaminhada ----------\nDe: ${m.from.name} <${m.from.email}>\nAssunto: ${m.subject}\n\n${plainText(m.text, m.html)}`,
      }),
    onArchive: () => {
      if (current) {
        act(current, "archive");
        closeReader();
      }
    },
    onTrash: () => {
      if (current) {
        act(current, folder === "trash" ? "untrash" : "trash");
        closeReader();
      }
    },
    onUnread: () => {
      if (current) {
        act(current, "unread");
        closeReader();
      }
    },
    onStar: () => {
      if (current) {
        act(current, current.starred ? "unstar" : "star");
      }
    },
  };

  const folderLabel = MAIL_FOLDERS.find((f) => f.id === folder)?.label;
  const canConnect = Boolean(
    mail.status?.configured && mail.status.google.available
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-var(--header-h)-env(safe-area-inset-bottom))] md:-m-6">
      {/* Pastas (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col gap-4 border-r p-3 lg:flex">
        <Button
          className="justify-start"
          onClick={() => openCompose(EMPTY_COMPOSE)}
        >
          <Icon className="size-4" name="IconEditBig" />
          Escrever
        </Button>
        <FolderNav
          folder={folder}
          onSelect={changeFolder}
          unread={mail.unreadInbox}
          vertical
        />
        <p className="mt-auto truncate px-1 text-muted-foreground text-xs">
          {mail.account}
        </p>
      </aside>

      {/* Lista */}
      <section
        className={cn(
          "flex min-w-0 flex-col border-r md:w-[360px] md:shrink-0 xl:w-[400px]",
          selected ? "hidden md:flex" : "flex flex-1 md:flex-none"
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <Icon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              name="IconMagnifyingGlass"
            />
            <Input
              aria-label="Pesquisar e-mails"
              className="pl-8"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Pesquisar em ${folderLabel?.toLowerCase()}`}
              type="search"
              value={search}
            />
          </div>
          <Button
            aria-label="Atualizar"
            onClick={mail.reload}
            size="icon-sm"
            variant="ghost"
          >
            <Icon
              className={cn("size-4", mail.loading && "animate-spin")}
              name="IconArrowRotateClockwise"
            />
          </Button>
          <Button
            aria-label="Escrever"
            className="lg:hidden"
            onClick={() => openCompose(EMPTY_COMPOSE)}
            size="icon-sm"
          >
            <Icon className="size-4" name="IconEditBig" />
          </Button>
        </div>
        <div className="lg:hidden">
          <FolderNav
            folder={folder}
            onSelect={changeFolder}
            unread={mail.unreadInbox}
            vertical={false}
          />
        </div>
        {mail.mode === "demo" ? <DemoBanner canConnect={canConnect} /> : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MailList
            error={mail.error}
            hasMore={mail.hasMore}
            loading={mail.loading || mail.mode === "loading"}
            messages={mail.list}
            onLoadMore={mail.loadMore}
            onOpen={open}
            onStar={(m) => act(m, m.starred ? "unstar" : "star")}
            selectedId={selected?.threadId ?? null}
            sentView={folder === "sent" || folder === "drafts"}
          />
        </div>
      </section>

      {/* Leitura */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex"
        )}
      >
        <MailReader
          actions={actions}
          error={threadState.error}
          inTrash={folder === "trash"}
          loading={threadState.loading}
          starred={current?.starred ?? false}
          thread={thread}
        />
      </section>

      <ComposeSheet
        demo={mail.mode === "demo"}
        initial={compose}
        onOpenChange={setComposeOpen}
        onSend={mail.send}
        open={composeOpen}
      />
    </div>
  );
}
