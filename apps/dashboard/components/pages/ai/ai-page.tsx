"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import {
  type ServiceBrand,
  ServiceLogo,
  ServiceTile,
} from "@/components/dashboard/service-logos";
import {
  speak,
  speakable,
  stopSpeaking,
} from "@/components/pages/voice/voice-engine";
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
import { setPreferredModel, usePreferredModel } from "@/lib/ai-model-pref";
import { CHAT_MODELS, type ChatModelId } from "@/lib/ai-models";
import { Icon, type IconName } from "@/lib/icons";
import { firstName, usePreferences } from "@/lib/preferences";
import {
  BASE_PATH,
  type ConnectorsStatus,
  googleStartUrl,
  notionStartUrl,
  useConnectors,
} from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import {
  AttachmentStrip,
  CameraSheet,
  type ImageAttachment,
  imageFromFile,
  MAX_ATTACHMENTS,
  toApiImage,
  useDictation,
} from "./attachments";
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
  /** Photos sent with a user message. */
  images?: ImageAttachment[];
  /** MCP tool calls made while answering (e.g. Notion search). */
  tools?: ToolUse[];
}

interface Conversation {
  id: string;
  title: string;
  model: ChatModelId;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "casa-brasa-ai-conversations";
const CLAY = "#d97757";
const API_URL = `${BASE_PATH}/api/chat/`;
const CONNECTOR_PREFS_KEY = "casa-brasa-ai-connectors";
/** "1" when the person chose to test without the API (no credits used). */
const DEMO_KEY = "casa-brasa-ai-demo";

function saveDemo(on: boolean) {
  try {
    localStorage.setItem(DEMO_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable — the choice lasts for this visit only
  }
}

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
    // Full-size photos stay in memory; the saved history keeps thumbnails
    const slim = list.slice(0, 30).map((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.images
          ? { ...m, images: m.images.map(({ id, thumb }) => ({ id, thumb })) }
          : m
      ),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // storage unavailable (private mode) — history just won't persist
  }
}

/**
 * Messages for /api/chat. Photos of the two most recent photo messages go in
 * full size; older ones as thumbnails (keeps the request small).
 */
function toApiMessages(history: ChatMessage[]) {
  const withPhotos = history
    .map((m, i) => (m.images?.length ? i : -1))
    .filter((i) => i >= 0);
  const recent = new Set(withPhotos.slice(-2));
  return history.map((m, i) => ({
    role: m.role,
    content: m.content,
    ...(m.images?.length
      ? {
          images: m.images.map((a) =>
            toApiImage((recent.has(i) && a.full) || a.thumb)
          ),
        }
      : {}),
  }));
}

const CLAUDE_PREFIX = /^Claude\s+/;

const IMAGE_EXT = /\.(heic|heif|jpe?g|png|webp|gif)$/i;

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

/** Assistant avatar: the app logo chosen in Configurações. */
function UserBubble({ message: m }: { message: ChatMessage }) {
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {m.images?.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {m.images.map((a) => (
            // biome-ignore lint/performance/noImgElement: local data URL
            <img
              alt="Imagem enviada"
              className="max-h-48 rounded-2xl border object-cover"
              height={192}
              key={a.id}
              src={a.full ?? a.thumb}
              width={192}
            />
          ))}
        </div>
      ) : null}
      {m.content ? (
        <div className="whitespace-pre-wrap rounded-[26px] bg-muted px-5 py-3.5 text-[17px] leading-relaxed">
          {m.content}
        </div>
      ) : null}
    </div>
  );
}

function Spark({
  className,
  spinning,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <BrandLogo
      className={cn("rounded-md", spinning && "animate-pulse", className)}
    />
  );
}

function ModelSelect({
  value,
  onChange,
}: {
  value: ChatModelId;
  onChange: (m: ChatModelId) => void;
}) {
  // Short names in the pill ("Opus 5.5"), like Claude's app
  const items = CHAT_MODELS.map((m) => ({
    value: m.id,
    label: m.name.replace(CLAUDE_PREFIX, ""),
  }));
  return (
    <Select
      items={items}
      onValueChange={(v) => onChange(v as ChatModelId)}
      value={value}
    >
      <SelectTrigger
        aria-label="Modelo"
        className="h-10 w-auto min-w-0 shrink gap-1.5 truncate rounded-full border-0 bg-muted/70 px-3.5 text-[15px] text-foreground shadow-none hover:bg-muted"
        size="sm"
      >
        <SelectValue />
        {value.startsWith("claude-") && value !== "claude-haiku-4-5" ? (
          <span className="text-muted-foreground">Médio</span>
        ) : null}
      </SelectTrigger>
      <SelectContent>
        {CHAT_MODELS.map((m) => (
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
  extras,
  preview,
  canSend,
  placeholder,
}: {
  placeholder?: string;
  connectors: ReactNode;
  /** Attach / camera / microphone buttons. */
  extras?: ReactNode;
  /** Attached photos and live dictation, above the text box. */
  preview?: ReactNode;
  /** Something besides text can be sent (photos). */
  canSend?: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  model: ChatModelId;
  onModelChange: (m: ChatModelId) => void;
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
      if (!streaming && (value.trim() || canSend)) {
        onSubmit();
      }
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (streaming) {
      onStop();
    } else if (value.trim() || canSend) {
      onSubmit();
    }
  };

  const ready = Boolean(value.trim() || canSend);
  const round =
    "flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity";
  let primary: ReactNode;
  if (streaming) {
    primary = (
      <button aria-label="Parar resposta" className={round} type="submit">
        <span className="size-3 rounded-[3px] bg-background" />
      </button>
    );
  } else if (ready) {
    primary = (
      <button aria-label="Enviar mensagem" className={round} type="submit">
        <Icon className="size-5" name="IconArrowUp" />
      </button>
    );
  } else {
    primary = (
      <a aria-label="Modo voz" className={round} href={`${BASE_PATH}/voz/`}>
        <Icon className="size-5" name="IconVoiceMid" />
      </a>
    );
  }

  return (
    <form
      className="acrylic flex flex-col gap-2 rounded-[28px] border bg-card p-2.5 shadow-sm transition-shadow focus-within:shadow-md"
      onSubmit={submit}
    >
      {preview}
      <textarea
        aria-label="Mensagem para o assistente"
        autoFocus={autoFocus}
        className="max-h-[220px] min-h-[48px] w-full resize-none bg-transparent px-3 pt-2 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Como posso ajudar hoje?"}
        ref={ref}
        rows={1}
        value={value}
      />
      <div className="flex min-w-0 items-center gap-1.5">
        {connectors}
        <ModelSelect onChange={onModelChange} value={model} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {extras}
          {primary}
        </div>
      </div>
    </form>
  );
}

type ConnectorKey =
  | "notion"
  | "github"
  | "gmail"
  | "drive"
  | "youtube"
  | "whatsapp";
type ConnectorPrefs = Record<ConnectorKey, boolean>;

const CONNECTOR_ROWS: { key: ConnectorKey; label: string }[] = [
  { key: "notion", label: "Notion" },
  { key: "github", label: "GitHub" },
  { key: "gmail", label: "Gmail" },
  { key: "drive", label: "Google Drive" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp" },
];

const SERVICE_KEYS = new Set<string>([
  "notion",
  "github",
  "gmail",
  "drive",
  "youtube",
  "whatsapp",
]);
const isService = (server: string): server is ServiceBrand =>
  SERVICE_KEYS.has(server);

function isConnected(status: ConnectorsStatus | null, key: ConnectorKey) {
  if (!status) {
    return false;
  }
  if (key === "youtube") {
    return status.youtube.available;
  }
  if (key === "whatsapp") {
    return Boolean(status.whatsapp?.available && status.whatsapp.unlocked);
  }
  if (key === "github") {
    return Boolean(status.github?.connected);
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
  if (key === "whatsapp") {
    return "Ler conversas";
  }
  if (key === "github") {
    return status?.github.login ? `@${status.github.login}` : "Conectado";
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
  if (key === "youtube" || key === "github") {
    return `${BASE_PATH}/conectores/`;
  }
  if (key === "whatsapp") {
    return `${BASE_PATH}/whatsapp/`;
  }
  return status.google.available
    ? googleStartUrl(back)
    : `${BASE_PATH}/conectores/`;
}

const MENU_ROW =
  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted";

/** The composer's "+" menu: photos, camera and connectors (like Claude's app). */
function PlusMenu({
  status,
  prefs,
  onChange,
  onFiles,
  onCamera,
}: {
  status: ConnectorsStatus | null;
  prefs: ConnectorPrefs;
  onChange: (key: ConnectorKey, on: boolean) => void;
  onFiles: (files: FileList | null) => void;
  onCamera: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = CONNECTOR_ROWS.filter(
    (r) => isConnected(status, r.key) && prefs[r.key]
  );
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label="Adicionar fotos, câmera e conectores"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
            type="button"
          />
        }
      >
        <Icon className="size-5" name="IconPlusLarge" />
        {active.length > 0 ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex -space-x-1">
            {active.slice(0, 3).map((r) => (
              <span
                className="flex size-4 items-center justify-center rounded-full bg-white ring-2 ring-card"
                key={r.key}
              >
                <ServiceLogo brand={r.key} className="size-2.5" />
              </span>
            ))}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="acrylic w-76 gap-1 p-2 backdrop-blur-xl"
        side="top"
      >
        <label className={cn(MENU_ROW, "cursor-pointer")}>
          <input
            accept="image/*"
            className="sr-only"
            multiple
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
              setOpen(false);
            }}
            type="file"
          />
          <Icon className="size-5" name="IconImages1" />
          Fotos e imagens
        </label>
        <button
          className={MENU_ROW}
          onClick={() => {
            setOpen(false);
            onCamera();
          }}
          type="button"
        >
          <Icon className="size-5" name="IconCamera1" />
          Câmera
        </button>
        <div className="my-1 border-t" />
        <p className="px-2 pt-1 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Conectores
        </p>
        {CONNECTOR_ROWS.map((r) => {
          const connected = isConnected(status, r.key);
          return (
            <div className="flex items-center gap-3 px-2 py-1" key={r.key}>
              <ServiceTile brand={r.key} className="size-8 rounded-lg" />
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
          className="px-2 pt-1 pb-1 text-muted-foreground text-xs underline-offset-2 hover:underline"
          href={`${BASE_PATH}/conectores/`}
        >
          Gerenciar conectores
        </a>
      </PopoverContent>
    </Popover>
  );
}

const SERVICE_NAMES: Record<string, string> = {
  notion: "Notion",
  github: "GitHub",
  gmail: "Gmail",
  drive: "Google Drive",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
};

/** "Usou Gmail e Notion · 3 ações ›", expandable (like Claude's tool line). */
function ToolSummary({ tools }: { tools: ToolUse[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "running");
  const names = [
    ...new Set(tools.map((t) => SERVICE_NAMES[t.server] ?? t.server)),
  ];
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`
      : (names[0] ?? "");
  return (
    <div className="mb-3">
      <button
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className={cn(running && "animate-pulse")}>
          {running ? `Usando ${list}…` : `Usou ${list}`}
          {` · ${tools.length} ${tools.length === 1 ? "ação" : "ações"}`}
        </span>
        <Icon
          className={cn("size-4 transition-transform", open && "rotate-90")}
          name="IconChevronRight"
        />
      </button>
      {open ? (
        <div className="mt-2">
          <ToolChips tools={tools} />
        </div>
      ) : null}
    </div>
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
          {isService(t.server) ? (
            <ServiceLogo
              brand={t.server}
              className={cn(
                "size-3.5",
                t.status === "running" && "animate-pulse"
              )}
            />
          ) : (
            <Icon
              className={cn(
                "size-3.5",
                t.status === "running" && "animate-pulse"
              )}
              name="IconConnectors1"
            />
          )}
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
  const [playing, setPlaying] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ text: content }).catch(() => null);
    } else {
      await copy();
    }
  };
  const play = async () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await speak(speakable(content)).catch(() => null);
    setPlaying(false);
  };
  useEffect(() => () => stopSpeaking(), []);
  const btn =
    "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="-ml-2 flex items-center gap-0.5">
      <button
        aria-label="Copiar resposta"
        className={btn}
        onClick={copy}
        type="button"
      >
        <Icon
          className="size-[18px]"
          name={copied ? "IconCheckmark1" : "IconSquareBehindSquare1"}
        />
      </button>
      <button
        aria-label="Compartilhar"
        className={btn}
        onClick={share}
        type="button"
      >
        <Icon className="size-[18px]" name="IconShareOs" />
      </button>
      <button
        aria-label={playing ? "Parar leitura" : "Ouvir resposta"}
        aria-pressed={playing}
        className={cn(btn, playing && "text-foreground")}
        onClick={play}
        type="button"
      >
        <Icon
          className="size-[18px]"
          name={playing ? "IconStop" : "IconPlay"}
        />
      </button>
      <button
        aria-label="Gostei"
        aria-pressed={vote === "up"}
        className={cn(btn, vote === "up" && "text-foreground")}
        onClick={() => setVote(vote === "up" ? null : "up")}
        type="button"
      >
        <Icon className="size-[18px]" name="IconThumbsUp" />
      </button>
      <button
        aria-label="Não gostei"
        aria-pressed={vote === "down"}
        className={cn(btn, vote === "down" && "text-foreground")}
        onClick={() => setVote(vote === "down" ? null : "down")}
        type="button"
      >
        <Icon className="size-[18px]" name="IconThumbsDown" />
      </button>
      {onRetry ? (
        <button
          aria-label="Gerar novamente"
          className={btn}
          onClick={onRetry}
          type="button"
        >
          <Icon className="size-[18px]" name="IconArrowRotateClockwise" />
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
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const dictation = useDictation((text) =>
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
  );
  const model = usePreferredModel();
  const setModel = setPreferredModel;
  const [streaming, setStreaming] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prefs, setPrefs] = useState<ConnectorPrefs>({
    notion: true,
    github: true,
    gmail: true,
    drive: true,
    youtube: true,
    whatsapp: true,
  });
  const { status: connectors } = useConnectors();
  const profile = usePreferences();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Deep link from other pages: /ia/?prompt=...
    const params = new URLSearchParams(window.location.search);
    try {
      if (
        params.get("demo") === "1" ||
        localStorage.getItem(DEMO_KEY) === "1"
      ) {
        setDemoMode(true);
      }
    } catch {
      // storage unavailable
    }
    const prompt = params.get("prompt");
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
        appendToAssistant(convId, msgId, `\n\n> ${e.text}\n\n`);
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
    async (
      convId: string,
      history: ChatMessage[],
      chosenModel: ChatModelId
    ) => {
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
            messages: toApiMessages(history),
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
        let outOfCredits = false;
        await readNdjson(res.body, (e) => {
          if (e.type === "fallback") {
            outOfCredits = true;
          } else {
            handleEvent(convId, assistantId, e);
          }
        });
        if (outOfCredits) {
          // No credits left: answer from the panel data and stay in demo mode
          setDemoMode(true);
          saveDemo(true);
          await streamDemo(convId, assistantId, question, controller.signal);
        }
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
      const images = attachments;
      if (!(content || images.length) || streaming) {
        return;
      }
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        ...(images.length ? { images } : {}),
      };
      let convId = activeId;
      let history: ChatMessage[];
      if (active && convId) {
        history = [...active.messages, userMsg];
      } else {
        convId = uid();
        history = [userMsg];
        const conv: Conversation = {
          id: convId,
          title:
            (content.length > 48 ? `${content.slice(0, 48)}…` : content) ||
            "Imagem",
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
      setAttachments([]);
      dictation.stop();
      // Let the new conversation land in state before streaming into it
      setTimeout(() => run(convId as string, history, model), 0);
    },
    [active, activeId, model, run, streaming, attachments, dictation.stop]
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

  const toggleDemo = () => {
    setDemoMode((on) => {
      saveDemo(!on);
      return !on;
    });
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

  const addFiles = async (files: FileList | null) => {
    setAttachError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    const picked = Array.from(files ?? [])
      .filter((f) => f.type.startsWith("image/") || f.name.match(IMAGE_EXT))
      .slice(0, Math.max(0, room));
    if (files && files.length > picked.length) {
      setAttachError(`Até ${MAX_ATTACHMENTS} imagens por mensagem.`);
    }
    for (const file of picked) {
      try {
        const a = await imageFromFile(file);
        setAttachments((list) => [...list, a].slice(0, MAX_ATTACHMENTS));
      } catch {
        setAttachError("Não consegui abrir uma das imagens.");
      }
    }
  };

  const connectorsMenu = (
    <PlusMenu
      onCamera={() => setCameraOpen(true)}
      onChange={changePref}
      onFiles={addFiles}
      prefs={prefs}
      status={connectors}
    />
  );

  const composerExtras = (
    <button
      aria-label={
        dictation.listening ? "Parar o ditado" : "Ditar pelo microfone"
      }
      aria-pressed={dictation.listening}
      className={cn(
        "flex size-10 items-center justify-center rounded-full transition-colors",
        dictation.listening
          ? "animate-pulse text-white"
          : "bg-muted/70 text-foreground hover:bg-muted"
      )}
      onClick={dictation.toggle}
      style={dictation.listening ? { backgroundColor: CLAY } : undefined}
      title="Ditar pelo microfone"
      type="button"
    >
      <Icon className="size-5" name="IconMicrophone" />
    </button>
  );

  const composerPreview = (
    <>
      <AttachmentStrip
        items={attachments}
        onRemove={(id) => setAttachments((l) => l.filter((a) => a.id !== id))}
      />
      {dictation.listening ? (
        <p className="flex items-center gap-2 px-1.5 text-muted-foreground text-xs">
          <span
            className="size-2 animate-pulse rounded-full"
            style={{ backgroundColor: CLAY }}
          />
          {dictation.interim || "Ouvindo… fale normalmente"}
        </p>
      ) : null}
      {dictation.error || attachError ? (
        <p className="px-1.5 text-destructive text-xs">
          {dictation.error ?? attachError}
        </p>
      ) : null}
    </>
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
      {cameraOpen ? (
        <CameraSheet
          onCapture={(a) =>
            setAttachments((l) => [...l, a].slice(0, MAX_ATTACHMENTS))
          }
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
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
        {/* Barra superior: botões redondos flutuantes, como no app do Claude */}
        <div className="flex h-14 shrink-0 items-center gap-2 px-3 md:px-5">
          <button
            aria-label="Conversas"
            className="acrylic flex size-11 items-center justify-center rounded-full border bg-card/80 shadow-sm xl:hidden"
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            <Icon className="size-5" name="IconBarsTwo" />
          </button>
          {/* The app header already says "Assistente IA" */}
          <p className="min-w-0 flex-1 truncate text-center font-medium text-muted-foreground text-sm">
            {[active?.title, demoMode ? "Modo demonstração" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="acrylic flex h-11 items-center gap-1 rounded-full border bg-card/80 px-1.5 shadow-sm">
            <button
              aria-label="Nova conversa"
              className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
              onClick={newChat}
              type="button"
            >
              <Icon className="size-5" name="IconEditBig" />
            </button>
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    aria-label="Mais opções"
                    className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
                    type="button"
                  />
                }
              >
                <Icon className="size-5" name="IconDotGrid1x3Horizontal" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="acrylic w-64 gap-1 p-2 backdrop-blur-xl"
              >
                <button
                  aria-pressed={demoMode}
                  className={MENU_ROW}
                  onClick={toggleDemo}
                  type="button"
                >
                  <Icon
                    className="size-5"
                    name={demoMode ? "IconCheckmark1" : "IconSparklesSoft"}
                  />
                  <span className="flex flex-col">
                    <span>
                      {demoMode ? "Modo demonstração ✓" : "Testar sem API"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {demoMode
                        ? "Toque para voltar a usar o Claude"
                        : "Respostas com os dados do painel, sem gastar créditos"}
                    </span>
                  </span>
                </button>
                <a className={MENU_ROW} href={`${BASE_PATH}/voz/`}>
                  <Icon className="size-5" name="IconVoiceMid" />
                  Modo voz
                </a>
                <a className={MENU_ROW} href={`${BASE_PATH}/conectores/`}>
                  <Icon className="size-5" name="IconConnectors1" />
                  Conectores
                </a>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {messages.length === 0 ? (
          /* Tela inicial: saudação no centro, caixa de mensagem embaixo */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
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
            </div>
            <div className="mx-auto w-full max-w-3xl px-3 pb-3 md:px-4">
              <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:justify-center md:px-0">
                {SUGGESTIONS.map((s) => (
                  <button
                    className="flex shrink-0 items-center gap-2 rounded-full border bg-card/60 px-3.5 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                    key={s.label}
                    onClick={() => send(s.prompt)}
                    type="button"
                  >
                    <Icon className="size-4" name={s.icon} />
                    {s.label}
                  </button>
                ))}
              </div>
              <Composer
                autoFocus
                canSend={attachments.length > 0}
                connectors={connectorsMenu}
                extras={composerExtras}
                model={model}
                onChange={setDraft}
                onModelChange={setModel}
                onStop={() => abortRef.current?.abort()}
                onSubmit={() => send(draft)}
                preview={composerPreview}
                streaming={streaming}
                value={draft}
              />
            </div>
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
                        <UserBubble message={m} />
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
                        {m.tools?.length ? (
                          <ToolSummary tools={m.tools} />
                        ) : null}
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
                canSend={attachments.length > 0}
                connectors={connectorsMenu}
                extras={composerExtras}
                model={model}
                onChange={setDraft}
                onModelChange={setModel}
                onStop={() => abortRef.current?.abort()}
                onSubmit={() => send(draft)}
                placeholder="Responda ao Claude…"
                preview={composerPreview}
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
