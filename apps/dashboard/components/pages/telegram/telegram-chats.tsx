"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  FilterSelect,
  SearchInput,
} from "@/components/pages/beverages/bev-shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import {
  type ChatRow,
  type MessageRow,
  parseChats,
  parseMessages,
  type ToolOutput,
} from "@/lib/telegram/core";
import { cn } from "@/lib/utils";
import { Notice, ToolResultView, useRunTool } from "./telegram-shared";
import { readUpload } from "./tool-form";

/**
 * A small Telegram client on top of the tools: chat list, history,
 * replies, attachments and mark-as-read, plus global search.
 */

const PAGE = 30;

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "private", label: "Pessoas" },
  { value: "group", label: "Grupos" },
  { value: "channel", label: "Canais" },
  { value: "contact_requests", label: "Fora dos contatos" },
];

const KIND_ICON = {
  private: "IconPeople",
  group: "IconGroup1",
  channel: "IconMegaphone",
} as const;

const time = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function ChatList({
  chats,
  selected,
  onSelect,
}: {
  chats: ChatRow[];
  selected: string | null;
  onSelect: (c: ChatRow) => void;
}) {
  return (
    <ul className="flex max-h-[65vh] flex-col overflow-y-auto">
      {chats.map((c) => (
        <li key={c.id}>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted",
              selected === c.id && "bg-primary/10"
            )}
            onClick={() => onSelect(c)}
            type="button"
          >
            <Icon
              className="size-4 shrink-0 text-muted-foreground"
              name={KIND_ICON[c.kind]}
            />
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.bot ? " 🤖" : ""}
            </span>
            {c.unread > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {c.unread}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bubble({ m, me }: { m: MessageRow; me: string | null }) {
  const mine = Boolean(me) && m.sender === me;
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl border px-3 py-2 text-sm",
        mine ? "self-end bg-primary/10" : "self-start bg-muted/40"
      )}
    >
      <p className="mb-0.5 text-muted-foreground text-xs">
        {m.sender} · {time(m.date)} · #{m.id}
      </p>
      <p className="whitespace-pre-wrap break-words">{m.text}</p>
    </div>
  );
}

function Composer({ chatId, onSent }: { chatId: string; onSent: () => void }) {
  const { run, busy } = useRunTool();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let out: ToolOutput;
    try {
      out = file
        ? await run("telegram-send-file", {
            chatId,
            filePath: await readUpload(file),
            ...(text ? { caption: text } : {}),
          })
        : await run("telegram-send-message", { chatId, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
      return;
    }
    if (out.ok) {
      setText("");
      setFile(null);
      onSent();
    } else {
      setError(out.text);
    }
  }

  return (
    <form className="flex flex-col gap-2 border-t pt-3" onSubmit={send}>
      <Textarea
        aria-label="Mensagem"
        onChange={(e) => setText(e.target.value)}
        placeholder={file ? "Legenda (opcional)" : "Escreva uma mensagem"}
        rows={2}
        value={text}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          aria-label="Anexar arquivo"
          className="max-w-full text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          type="file"
        />
        <Button
          disabled={busy || !(text.trim() || file)}
          size="sm"
          type="submit"
        >
          <Icon className="size-4" name="IconPaperPlaneTopRight" />
          {busy ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}

function Conversation({ chat, me }: { chat: ChatRow; me: string | null }) {
  const { run, busy } = useRunTool();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offsetId?: number) => {
      const out = await run("telegram-read-messages", {
        chatId: chat.id,
        limit: PAGE,
        ...(offsetId ? { offsetId } : {}),
      });
      if (!out.ok) {
        setError(out.text);
        return;
      }
      setError(null);
      const rows = parseMessages(out.text);
      setMessages((prev) =>
        offsetId
          ? [...rows, ...prev.filter((m) => !rows.some((r) => r.id === m.id))]
          : rows
      );
    },
    [chat.id, run]
  );

  useEffect(() => {
    setMessages([]);
    load();
  }, [load]);

  return (
    <div className="flex min-h-[50vh] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{chat.name}</p>
        <div className="flex gap-1">
          <Button
            disabled={busy}
            onClick={() => run("telegram-mark-as-read", { chatId: chat.id })}
            size="sm"
            variant="ghost"
          >
            Marcar como lida
          </Button>
          <Button
            disabled={busy}
            onClick={() => load()}
            size="sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowRotateClockwise" />
          </Button>
        </div>
      </div>
      {messages.length >= PAGE ? (
        <Button
          disabled={busy}
          onClick={() => load(messages[0]?.id)}
          size="sm"
          variant="outline"
        >
          Carregar anteriores
        </Button>
      ) : null}
      <div className="flex max-h-[55vh] flex-1 flex-col gap-2 overflow-y-auto">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} me={me} />
        ))}
        {busy && messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {chat.kind === "channel" ? null : (
        <Composer chatId={chat.id} onSent={() => load()} />
      )}
    </div>
  );
}

export function TelegramChats({ me }: { me: string | null }) {
  const { run, busy } = useRunTool();
  const [filter, setFilter] = useState("all");
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [selected, setSelected] = useState<ChatRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const out = await run("telegram-list-chats", {
      limit: 60,
      ...(filter === "all" ? {} : { filterType: filter }),
    });
    if (out.ok) {
      setError(null);
      setChats(parseChats(out.text));
    } else {
      setError(out.text);
    }
  }, [filter, run]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <FilterSelect items={FILTERS} onChange={setFilter} value={filter} />
          <Button
            aria-label="Atualizar"
            disabled={busy}
            onClick={load}
            size="sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowRotateClockwise" />
          </Button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {busy && chats.length === 0 ? (
          <p className="text-muted-foreground text-sm">Carregando conversas…</p>
        ) : null}
        <ChatList
          chats={chats}
          onSelect={setSelected}
          selected={selected?.id ?? null}
        />
      </div>
      <div className="min-w-0 rounded-xl border p-4">
        {selected ? (
          <Conversation chat={selected} key={selected.id} me={me} />
        ) : (
          <p className="text-muted-foreground text-sm">Escolha uma conversa.</p>
        )}
      </div>
    </div>
  );
}

export function TelegramSearch() {
  const { run, busy } = useRunTool();
  const [query, setQuery] = useState("");
  const [out, setOut] = useState<ToolOutput | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setOut(await run("telegram-search-global", { query, limit: 50 }));
        }}
      >
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar em todas as conversas"
          value={query}
        />
        <Button disabled={busy || !query.trim()} type="submit">
          {busy ? "Buscando…" : "Buscar"}
        </Button>
      </form>
      {out ? <ToolResultView out={out} /> : null}
    </div>
  );
}
