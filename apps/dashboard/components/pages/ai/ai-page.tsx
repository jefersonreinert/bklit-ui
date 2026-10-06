"use client";

import { Icon, type IconName } from "@bklitui/icons";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { demoAnswer } from "@/lib/ai-demo";
import type { ChatStreamEvent } from "@/lib/ai-events";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";
import { firstName, usePreferences } from "@/lib/preferences";
import {
  BASE_PATH,
  type ConnectorsStatus,
  googleStartUrl,
  notionStartUrl,
  useConnectors,
} from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

/* -------------------------------------------------------------------------- */
/* Tipos e persistência local (conveniência por navegador)                    */
/* -------------------------------------------------------------------------- */

interface ToolUse {
  server: string;
  name: string;
  status: "running" | "done" | "error";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** MCP tool calls made while answering (e.g. Notion search). */
  tools?: ToolUse[];
}

interface Conversation {
  id: string;
  title: string;
  model: AiModelId;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "casa-brasa-ai-conversations";
const CLAY = "#d97757";
const API_URL = `${BASE_PATH}/api/chat/`;
const CONNECTOR_PREFS_KEY = "casa-brasa-ai-connectors";

const NOTION_PREFIX = /^notion-/;

const TOOL_LABELS: Record<string, string> = {
  search: "Pesquisando",
  fetch: "Lendo página",
  "create-pages": "Criando página",
  "update-page": "Editando página",
  "create-comment": "Comentando",
  "get-comments": "Lendo comentários",
  "query-data-sources": "Consultando base de dados",
  gmail_search: "Pesquisando e-mails",
  gmail_read_thread: "Lendo e-mail",
  gmail_create_draft: "Criando rascunho",
  drive_search: "Pesquisando no Drive",
  drive_read_file: "Lendo arquivo",
  youtube_search: "Pesquisando no YouTube",
  youtube_video: "Lendo vídeo",
  youtube_channel: "Lendo canal",
  youtube_playlist: "Lendo playlist",
  youtube_transcript: "Transcrevendo vídeo",
};

function toolLabel(name: string) {
  const short = name.replace(NOTION_PREFIX, "");
  return TOOL_LABELS[short] ?? short.replaceAll("-", " ").replaceAll("_", " ");
}

async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ChatStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer = drainLines(
      buffer + decoder.decode(value, { stream: true }),
      onEvent
    );
  }
  drainLines(`${buffer}\n`, onEvent);
}

/** Parses complete NDJSON lines and keeps the trailing partial line. */
function drainLines(buffer: string, onEvent: (e: ChatStreamEvent) => void) {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) {
      try {
        onEvent(JSON.parse(line) as ChatStreamEvent);
      } catch {
        // ignore a malformed line rather than breaking the whole answer
      }
    }
  }
  return rest;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function saveConversations(list: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // storage unavailable (private mode) — history just won't persist
  }
}

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) {
    return "Bom dia";
  }
  return h < 18 ? "Boa tarde" : "Boa noite";
}

const SUGGESTIONS: { icon: IconName; label: string; prompt: string }[] = [
  {
    icon: "IconCoins",
    label: "Analisar finanças",
    prompt:
      "Faça uma análise do resultado financeiro deste mês e diga o que devo priorizar.",
  },
  {
    icon: "IconForkKnife",
    label: "Reduzir CMV",
    prompt:
      "Quais pratos devo reajustar ou reformular para reduzir o CMV do cardápio?",
  },
  {
    icon: "IconGlass",
    label: "Carta de bebidas",
    prompt:
      "Como está a margem da carta de bebidas? Quais vinhos e coquetéis estão fora da meta?",
  },
  {
    icon: "IconPeople",
    label: "Equipe e escala",
    prompt:
      "Como está a equipe hoje? Tenho problemas de escala, ponto ou horas extras?",
  },
];

/* -------------------------------------------------------------------------- */
/* Peças visuais                                                              */
/* -------------------------------------------------------------------------- */

/** Clay asterisk mark used as the assistant avatar. */
function Spark({
  className,
  spinning,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "shrink-0",
        spinning && "animate-[spin_3s_linear_infinite]",
        className
      )}
      fill={CLAY}
      viewBox="0 0 24 24"
    >
      {[0, 30, 60, 90, 120, 150].map((deg) => (
        <rect
          height="22"
          key={deg}
          rx="1.6"
          transform={`rotate(${deg} 12 12)`}
          width="3.2"
          x="10.4"
          y="1"
        />
      ))}
    </svg>
  );
}

function ModelSelect({
  value,
  onChange,
}: {
  value: AiModelId;
  onChange: (m: AiModelId) => void;
}) {
  const items = AI_MODELS.map((m) => ({ value: m.id, label: m.name }));
  return (
    <Select
      items={items}
      onValueChange={(v) => onChange(v as AiModelId)}
      value={value}
    >
      <SelectTrigger
        aria-label="Modelo"
        className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-muted"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AI_MODELS.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex flex-col">
              <span>{m.name}</span>
              <span className="text-muted-foreground text-xs">
                {m.description}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  model,
  onModelChange,
  connectors,
  autoFocus,
}: {
  connectors: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  model: AiModelId;
  onModelChange: (m: AiModelId) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~8 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (streaming) {
      onStop();
    } else if (value.trim()) {
      onSubmit();
    }
  };

  return (
    <form
      className="acrylic flex flex-col gap-2 rounded-[20px] border bg-card p-3 shadow-sm transition-shadow focus-within:shadow-md"
      onSubmit={submit}
    >
      <textarea
        aria-label="Mensagem para o assistente"
        autoFocus={autoFocus}
        className="max-h-[220px] min-h-[44px] w-full resize-none bg-transparent px-1.5 pt-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Como posso ajudar hoje?"
        ref={ref}
        rows={1}
        value={value}
      />
      <div className="flex items-center gap-1">
        {connectors}
        <div className="ml-auto flex items-center gap-1">
          <ModelSelect onChange={onModelChange} value={model} />
          <button
            aria-label={streaming ? "Parar resposta" : "Enviar mensagem"}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-white transition-opacity",
              !(streaming || value.trim()) && "opacity-40"
            )}
            disabled={!(streaming || value.trim())}
            style={{ backgroundColor: CLAY }}
            type="submit"
          >
            <Icon
              className="size-4"
              name={streaming ? "IconStop" : "IconArrowUp"}
            />
          </button>
        </div>
      </div>
    </form>
  );
}

type ConnectorKey = "notion" | "gmail" | "drive" | "youtube";
type ConnectorPrefs = Record<ConnectorKey, boolean>;

const CONNECTOR_ROWS: { key: ConnectorKey; label: string; icon: IconName }[] = [
  { key: "notion", label: "Notion", icon: "IconNotion" },
  { key: "gmail", label: "Gmail", icon: "IconEmail1" },
  { key: "drive", label: "Google Drive", icon: "IconFolder1" },
  { key: "youtube", label: "YouTube", icon: "IconYoutube" },
];

const SERVER_ICONS: Record<string, IconName> = {
  notion: "IconNotion",
  gmail: "IconEmail1",
  drive: "IconFolder1",
  youtube: "IconYoutube",
};

function isConnected(status: ConnectorsStatus | null, key: ConnectorKey) {
  if (!status) {
    return false;
  }
  if (key === "youtube") {
    return status.youtube.available;
  }
  return key === "notion" ? status.notion.connected : status.google.connected;
}

function connectorSubtitle(status: ConnectorsStatus | null, key: ConnectorKey) {
  if (!isConnected(status, key)) {
    return "Não conectado";
  }
  if (key === "youtube") {
    return status?.youtube.transcripts
      ? "Pesquisa e transcrição"
      : "Pesquisa (sem transcrição)";
  }
  return (key !== "notion" && status?.google.email) || "Conectado";
}

function connectHref(status: ConnectorsStatus | null, key: ConnectorKey) {
  const back = `${BASE_PATH}/ia/`;
  if (!status?.configured) {
    return `${BASE_PATH}/conectores/`;
  }
  if (key === "notion") {
    return notionStartUrl(back);
  }
  if (key === "youtube") {
    return `${BASE_PATH}/conectores/`;
  }
  return status.google.available
    ? googleStartUrl(back)
    : `${BASE_PATH}/conectores/`;
}

function ConnectorsMenu({
  status,
  prefs,
  onChange,
}: {
  status: ConnectorsStatus | null;
  prefs: ConnectorPrefs;
  onChange: (key: ConnectorKey, on: boolean) => void;
}) {
  const active = CONNECTOR_ROWS.filter(
    (r) => isConnected(status, r.key) && prefs[r.key]
  );
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Conectores"
            className={cn(
              "gap-1.5 rounded-lg",
              active.length > 0 && "text-foreground"
            )}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" name="IconConnectors1" />
        {active.map((r) => (
          <Icon className="size-3.5" key={r.key} name={r.icon} />
        ))}
        {active.length === 1 ? (
          <span className="text-xs">{active[0]?.label}</span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="acrylic w-72 gap-3 p-3 backdrop-blur-xl"
        side="top"
      >
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Conectores
        </p>
        {CONNECTOR_ROWS.map((r) => {
          const connected = isConnected(status, r.key);
          return (
            <div className="flex items-center gap-3" key={r.key}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4" name={r.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{r.label}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {connectorSubtitle(status, r.key)}
                </p>
              </div>
              {connected ? (
                <Switch
                  aria-label={`Usar ${r.label} nesta conversa`}
                  checked={prefs[r.key]}
                  onCheckedChange={(on) => onChange(r.key, on)}
                />
              ) : (
                <a
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  href={connectHref(status, r.key)}
                >
                  Conectar
                </a>
              )}
            </div>
          );
        })}
        <a
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          href={`${BASE_PATH}/conectores/`}
        >
          Gerenciar conectores
        </a>
      </PopoverContent>
    </Popover>
  );
}

function ToolChips({ tools }: { tools: ToolUse[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((t, i) => (
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-muted-foreground text-xs",
            t.status === "error" && "border-destructive/40 text-destructive"
          )}
          key={`${t.name}-${i}`}
        >
          <Icon
            className={cn(
              "size-3.5",
              t.status === "running" && "animate-pulse"
            )}
            name={SERVER_ICONS[t.server] ?? "IconConnectors1"}
          />
          {toolLabel(t.name)}
          {t.status === "done" ? (
            <Icon className="size-3" name="IconCheckmark1Small" />
          ) : null}
          {t.status === "error" ? (
            <Icon className="size-3" name="IconCrossSmall" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function MessageActions({
  content,
  onRetry,
}: {
  content: string;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };
  const btn =
    "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="flex items-center gap-0.5">
      <button
        aria-label="Copiar resposta"
        className={btn}
        onClick={copy}
        type="button"
      >
        <Icon
          className="size-3.5"
          name={copied ? "IconCheckmark1" : "IconSquareBehindSquare1"}
        />
      </button>
      <button
        aria-label="Gostei"
        aria-pressed={vote === "up"}
        className={cn(btn, vote === "up" && "text-foreground")}
        onClick={() => setVote(vote === "up" ? null : "up")}
        type="button"
      >
        <Icon className="size-3.5" name="IconThumbsUp" />
      </button>
      <button
        aria-label="Não gostei"
        aria-pressed={vote === "down"}
        className={cn(btn, vote === "down" && "text-foreground")}
        onClick={() => setVote(vote === "down" ? null : "down")}
        type="button"
      >
        <Icon className="size-3.5" name="IconThumbsDown" />
      </button>
      {onRetry ? (
        <button
          aria-label="Gerar novamente"
          className={btn}
          onClick={onRetry}
          type="button"
        >
          <Icon className="size-3.5" name="IconArrowRotateClockwise" />
        </button>
      ) : null}
    </div>
  );
}

function HistoryList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Button className="justify-start gap-2" onClick={onNew} variant="ghost">
        <span
          className="flex size-6 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: CLAY }}
        >
          <Icon className="size-3.5" name="IconPlusLarge" />
        </span>
        Nova conversa
      </Button>
      <p className="px-3 font-medium text-muted-foreground text-xs">Recentes</p>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {conversations.length === 0 ? (
          <li className="px-3 text-muted-foreground text-xs">
            Nenhuma conversa ainda.
          </li>
        ) : null}
        {conversations.map((c) => (
          <li className="group relative" key={c.id}>
            <button
              className={cn(
                "w-full truncate rounded-lg px-3 py-2 pr-8 text-left text-sm transition-colors",
                c.id === activeId
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => onSelect(c.id)}
              type="button"
            >
              {c.title}
            </button>
            <button
              aria-label={`Apagar conversa ${c.title}`}
              className="absolute top-1/2 right-1.5 hidden size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover:flex"
              onClick={() => onDelete(c.id)}
              type="button"
            >
              <Icon className="size-3.5" name="IconTrashCan" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

export function AiPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<AiModelId>(DEFAULT_MODEL);
  const [streaming, setStreaming] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prefs, setPrefs] = useState<ConnectorPrefs>({
    notion: true,
    gmail: true,
    drive: true,
    youtube: true,
  });
  const { status: connectors } = useConnectors();
  const profile = usePreferences();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Deep link from other pages: /ia/?prompt=...
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) {
      setDraft(prompt.slice(0, 2000));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    setConversations(loadConversations());
    try {
      const saved = localStorage.getItem(CONNECTOR_PREFS_KEY);
      if (saved) {
        setPrefs((p) => ({ ...p, ...(JSON.parse(saved) as ConnectorPrefs) }));
      }
    } catch {
      // storage unavailable or corrupt — keep the defaults
    }
  }, []);

  const changePref = useCallback((key: ConnectorKey, on: boolean) => {
    setPrefs((p) => {
      const next = { ...p, [key]: on };
      try {
        localStorage.setItem(CONNECTOR_PREFS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — preference lasts for this visit only
      }
      return next;
    });
  }, []);

  const activeConnectors = CONNECTOR_ROWS.filter(
    (r) => isConnected(connectors, r.key) && prefs[r.key]
  ).map((r) => r.key);
  const activeKey = activeConnectors.join(",");

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  // Keep the newest tokens in view while streaming
  const lastContent = messages.at(-1)?.content;
  useEffect(() => {
    if (lastContent !== undefined) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [lastContent]);

  const updateConversation = useCallback(
    (id: string, fn: (c: Conversation) => Conversation) => {
      setConversations((prev) => {
        const next = prev
          .map((c) => (c.id === id ? fn(c) : c))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        saveConversations(next);
        return next;
      });
    },
    []
  );

  const appendToAssistant = useCallback(
    (convId: string, msgId: string, chunk: string) =>
      updateConversation(convId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, content: m.content + chunk } : m
        ),
      })),
    [updateConversation]
  );

  const updateTools = useCallback(
    (convId: string, msgId: string, fn: (tools: ToolUse[]) => ToolUse[]) =>
      updateConversation(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, tools: fn(m.tools ?? []) } : m
        ),
      })),
    [updateConversation]
  );

  const handleEvent = useCallback(
    (convId: string, msgId: string, e: ChatStreamEvent) => {
      if (e.type === "text") {
        appendToAssistant(convId, msgId, e.text);
      } else if (e.type === "tool") {
        updateTools(convId, msgId, (t) => [
          ...t,
          { server: e.server, name: e.name, status: "running" },
        ]);
      } else if (e.type === "tool_done") {
        updateTools(convId, msgId, (t) => {
          const i = t.findIndex((x) => x.status === "running");
          return i < 0
            ? t
            : t.map((x, j) =>
                j === i ? { ...x, status: e.error ? "error" : "done" } : x
              );
        });
      } else {
        appendToAssistant(convId, msgId, `\n\n> ${e.text}`);
      }
    },
    [appendToAssistant, updateTools]
  );

  const streamDemo = useCallback(
    async (
      convId: string,
      msgId: string,
      question: string,
      signal: AbortSignal
    ) => {
      const answer = demoAnswer(question);
      const tokens = answer.match(/\S+\s*/g) ?? [answer];
      for (let i = 0; i < tokens.length; i += 3) {
        if (signal.aborted) {
          return;
        }
        appendToAssistant(convId, msgId, tokens.slice(i, i + 3).join(""));
        await new Promise((r) => setTimeout(r, 22));
      }
    },
    [appendToAssistant]
  );

  const run = useCallback(
    async (convId: string, history: ChatMessage[], chosenModel: AiModelId) => {
      const assistantId = uid();
      updateConversation(convId, (c) => ({
        ...c,
        messages: [
          ...history,
          { id: assistantId, role: "assistant", content: "" },
        ],
      }));
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      const question = history.at(-1)?.content ?? "";

      try {
        if (demoMode) {
          await streamDemo(convId, assistantId, question, controller.signal);
          return;
        }
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: chosenModel,
            messages: history.map(({ role, content }) => ({ role, content })),
            connectors: activeKey ? activeKey.split(",") : [],
            user: { name: profile.name, role: profile.role },
          }),
          signal: controller.signal,
        });
        // No server (static build) or no API key → offline demo answers
        if ([404, 405, 501, 503].includes(res.status) || !res.body) {
          setDemoMode(true);
          await streamDemo(convId, assistantId, question, controller.signal);
          return;
        }
        if (!res.ok) {
          appendToAssistant(
            convId,
            assistantId,
            `> ⚠️ Erro ${res.status} ao falar com o assistente.`
          );
          return;
        }
        await readNdjson(res.body, (e) => handleEvent(convId, assistantId, e));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDemoMode(true);
          await streamDemo(convId, assistantId, question, controller.signal);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [
      appendToAssistant,
      demoMode,
      handleEvent,
      streamDemo,
      updateConversation,
      activeKey,
      profile.name,
      profile.role,
    ]
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streaming) {
        return;
      }
      const userMsg: ChatMessage = { id: uid(), role: "user", content };
      let convId = activeId;
      let history: ChatMessage[];
      if (active && convId) {
        history = [...active.messages, userMsg];
      } else {
        convId = uid();
        history = [userMsg];
        const conv: Conversation = {
          id: convId,
          title: content.length > 48 ? `${content.slice(0, 48)}…` : content,
          model,
          updatedAt: Date.now(),
          messages: history,
        };
        setConversations((prev) => {
          const next = [conv, ...prev];
          saveConversations(next);
          return next;
        });
        setActiveId(convId);
      }
      setDraft("");
      // Let the new conversation land in state before streaming into it
      setTimeout(() => run(convId as string, history, model), 0);
    },
    [active, activeId, model, run, streaming]
  );

  const retry = () => {
    if (!active || streaming) {
      return;
    }
    let lastUser = -1;
    active.messages.forEach((m, i) => {
      if (m.role === "user") {
        lastUser = i;
      }
    });
    if (lastUser >= 0) {
      run(active.id, active.messages.slice(0, lastUser + 1), model);
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setDraft("");
    setHistoryOpen(false);
  };

  const deleteChat = (id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (id === activeId) {
      setActiveId(null);
    }
  };

  const connectorsMenu = (
    <ConnectorsMenu onChange={changePref} prefs={prefs} status={connectors} />
  );

  const history = (
    <HistoryList
      activeId={activeId}
      conversations={conversations}
      onDelete={deleteChat}
      onNew={newChat}
      onSelect={(id) => {
        setActiveId(id);
        setHistoryOpen(false);
      }}
    />
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-var(--header-h)-env(safe-area-inset-bottom))] md:-m-6">
      {/* Histórico (desktop) */}
      <aside className="hidden w-64 shrink-0 border-r p-3 xl:block">
        {history}
      </aside>

      {/* Histórico (mobile/tablet) */}
      <Sheet onOpenChange={setHistoryOpen} open={historyOpen}>
        <SheetContent className="acrylic w-72! bg-sidebar p-3" side="left">
          <SheetTitle className="sr-only">Conversas</SheetTitle>
          {history}
        </SheetContent>
      </Sheet>

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <div className="flex h-12 shrink-0 items-center gap-2 px-3 md:px-5">
          <Button
            aria-label="Conversas"
            className="xl:hidden"
            onClick={() => setHistoryOpen(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconHistory" />
          </Button>
          <p className="min-w-0 flex-1 truncate font-medium text-sm">
            {active ? active.title : "Assistente IA"}
          </p>
          {demoMode ? (
            <span
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
              title="Configure ANTHROPIC_API_KEY no Vercel para usar o Claude"
            >
              Modo demonstração
            </span>
          ) : null}
          {active ? (
            <Button
              aria-label="Nova conversa"
              onClick={newChat}
              size="icon-sm"
              variant="ghost"
            >
              <Icon className="size-4" name="IconEditBig" />
            </Button>
          ) : null}
        </div>

        {messages.length === 0 ? (
          /* Tela inicial */
          <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 pb-10">
            <h2
              className="flex items-center gap-3 text-center font-serif text-3xl tracking-tight md:text-4xl"
              style={{
                fontFamily:
                  "var(--ai-font, ui-serif, Georgia, 'Times New Roman', serif)",
              }}
            >
              <Spark className="size-8 md:size-9" />
              {greeting()}, {firstName(profile.name)}
            </h2>
            <div className="w-full max-w-2xl">
              <Composer
                autoFocus
                connectors={connectorsMenu}
                model={model}
                onChange={setDraft}
                onModelChange={setModel}
                onStop={() => abortRef.current?.abort()}
                onSubmit={() => send(draft)}
                streaming={streaming}
                value={draft}
              />
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    className="flex items-center gap-2 rounded-xl border bg-card/60 px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                    key={s.label}
                    onClick={() => send(s.prompt)}
                    type="button"
                  >
                    <Icon className="size-4" name={s.icon} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {demoMode ? (
              <p className="max-w-md text-center text-muted-foreground text-xs">
                Modo demonstração: as respostas são montadas com os dados do
                painel. Adicione a variável{" "}
                <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code>{" "}
                no Vercel para conversar com o Claude.
              </p>
            ) : null}
          </div>
        ) : (
          /* Conversa */
          <>
            <div className="flex-1 overflow-y-auto" ref={scrollRef}>
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
                {messages.map((m, idx) => {
                  const isLast = idx === messages.length - 1;
                  if (m.role === "user") {
                    return (
                      <div className="flex justify-end" key={m.id}>
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    );
                  }
                  const pending = isLast && streaming;
                  return (
                    <div className="flex gap-3" key={m.id}>
                      <Spark
                        className="mt-1 size-5"
                        spinning={pending && m.content === ""}
                      />
                      <div className="min-w-0 flex-1">
                        {m.tools?.length ? <ToolChips tools={m.tools} /> : null}
                        {m.content === "" && !m.tools?.length ? (
                          <p className="text-muted-foreground text-sm">
                            Pensando…
                          </p>
                        ) : (
                          <div
                            className="text-[15px]"
                            style={{
                              fontFamily:
                                "var(--ai-font, ui-serif, Georgia, 'Times New Roman', serif)",
                            }}
                          >
                            <Markdown text={m.content} />
                          </div>
                        )}
                        {pending ? null : (
                          <div className="mt-2">
                            <MessageActions
                              content={m.content}
                              onRetry={isLast ? retry : undefined}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
              <Composer
                connectors={connectorsMenu}
                model={model}
                onChange={setDraft}
                onModelChange={setModel}
                onStop={() => abortRef.current?.abort()}
                onSubmit={() => send(draft)}
                streaming={streaming}
                value={draft}
              />
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                O assistente pode cometer erros. Confira informações importantes
                no painel.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
