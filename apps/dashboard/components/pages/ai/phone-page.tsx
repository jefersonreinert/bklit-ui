"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { getSession, setSession } from "@/lib/pos/store";
import { convexClient } from "@/lib/sync/convex-client";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";

/**
 * "Meu telefone": an Android phone running 24/7 on the VPS (Redroid),
 * driven by Mobilerun. The VPS server (/opt/phone-agent) only answers to
 * an administrator's POS PIN (the POS session of this device) or to the
 * panel's own token (access code).
 */

const PHONE_URL =
  process.env.NEXT_PUBLIC_PHONE_URL ?? "https://phone.reinert1996.duckdns.org";

type Provider = "gemini" | "anthropic" | "openai" | "openrouter";

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "Chave grátis em aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    hint: "Chave em console.anthropic.com (precisa de créditos)",
  },
  { id: "openai", label: "OpenAI", hint: "Chave em platform.openai.com" },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "Uma chave para vários modelos: openrouter.ai/keys",
  },
];

interface Status {
  online: boolean;
  size: string | null;
  provider: Provider | null;
  model: string | null;
  hasKey: boolean;
  running: string | null;
}

interface Task {
  id: string;
  goal: string;
  state: "running" | "done" | "failed" | "stopped";
  started: number;
  ended: number | null;
  log: string[];
}

const STATE_LABEL: Record<Task["state"], string> = {
  running: "Executando…",
  done: "Concluída",
  failed: "Falhou",
  stopped: "Parada",
};

const SUGGESTIONS = [
  "Abra o Chrome e pesquise o horário do ferry Gozo–Malta hoje",
  "Abra as Configurações e me diga a versão do Android",
  "Abra o Chrome em atlasbar.sg e me diga o horário de funcionamento",
];

/* ------------------------------ api client ------------------------------ */

let token: { value: string; until: number } | null = null;

async function panelToken() {
  if (token && token.until > Date.now()) {
    return token.value;
  }
  const res = await fetch(`${BASE_PATH}/api/convex/token/`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) {
    return null;
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    return null;
  }
  token = { value: data.token, until: Date.now() + 45 * 60_000 };
  return data.token;
}

class Locked extends Error {}

/** The POS session (PIN) of this device, else the panel's token. */
async function credentials(): Promise<Record<string, string> | null> {
  const pos = getSession();
  if (pos) {
    return { "x-pos-session": pos };
  }
  const auth = await panelToken();
  return auth ? { authorization: `Bearer ${auth}` } : null;
}

async function call(path: string, init?: RequestInit) {
  const auth = await credentials();
  if (!auth) {
    throw new Locked("locked");
  }
  const res = await fetch(`${PHONE_URL}${path}`, {
    ...init,
    headers: {
      ...auth,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    token = null;
    throw new Locked(res.status === 403 ? "not_admin" : "locked");
  }
  return res;
}

async function json<T>(path: string, body?: unknown): Promise<T> {
  const res = await call(
    path,
    body === undefined
      ? undefined
      : { method: "POST", body: JSON.stringify(body) }
  );
  const data = (await res.json().catch(() => ({}))) as T & {
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? `erro ${res.status}`);
  }
  return data;
}

const ERRORS: Record<string, string> = {
  no_key: "Configure a chave da IA primeiro (botão Ajustes).",
  busy: "O celular já está executando uma tarefa.",
  phone_offline: "O celular virtual não está respondendo.",
};

const message = (e: unknown) =>
  e instanceof Locked
    ? "Digite o PIN de administrador do POS para usar o celular."
    : (ERRORS[(e as Error).message] ??
      "Não consegui falar com o celular. Tente de novo.");

/* ----------------------------------- PIN ---------------------------------- */

/** The POS PIN (administrators only); signs this device in to the POS too. */
function PinUnlock({
  notAdmin,
  onDone,
}: {
  notAdmin: boolean;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    notAdmin ? "Esse PIN não é de administrador." : null
  );

  const submit = async (value: string) => {
    const client = convexClient();
    if (!client || value.length !== 4) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await client.mutation(api.staff.login, {
        pin: value,
        device: "Meu telefone",
      });
      if ("token" in res && res.token) {
        setSession(res.token);
        onDone();
      } else if ("error" in res && res.error === "locked") {
        const at = new Date(res.until).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setError(`Muitas tentativas. Tente de novo às ${at}.`);
      } else {
        setError("PIN incorreto.");
      }
    } catch {
      setError("Não consegui conferir o PIN. Tente de novo.");
    } finally {
      setBusy(false);
      setPin("");
    }
  };

  const press = (d: string) => {
    if (busy) {
      return;
    }
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      submit(next);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center">
      <Icon className="size-8" name="IconLock" />
      <div>
        <p className="font-semibold text-lg">PIN do POS</p>
        <p className="text-muted-foreground text-sm">
          Digite o seu PIN de administrador para usar o celular.
        </p>
      </div>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            className={cn(
              "size-3.5 rounded-full border-2 border-foreground/60",
              i < pin.length && "bg-foreground"
            )}
            key={i}
          />
        ))}
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="grid w-full grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            className="h-12 text-lg"
            disabled={busy}
            key={d}
            onClick={() => press(d)}
            variant="outline"
          >
            {d}
          </Button>
        ))}
        <Button
          className="h-12"
          disabled={busy || !pin}
          onClick={() => setPin("")}
          variant="ghost"
        >
          Limpar
        </Button>
        <Button
          className="h-12 text-lg"
          disabled={busy}
          onClick={() => press("0")}
          variant="outline"
        >
          0
        </Button>
        <Button
          className="h-12"
          disabled={busy || !pin}
          onClick={() => setPin((p) => p.slice(0, -1))}
          variant="ghost"
        >
          ⌫
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- screen -------------------------------- */

/** The phone's screen as a live picture (a JPEG every ~0.8 s). */
function useFrames(paused: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    const frame = async () => {
      try {
        const res = await call("/screen?w=590");
        if (!res.ok) {
          setError(message(new Error("phone_offline")));
          return;
        }
        const next = URL.createObjectURL(await res.blob());
        if (url) {
          URL.revokeObjectURL(url);
        }
        url = next;
        setSrc(next);
        setError(null);
      } catch (e) {
        setError(message(e));
      }
    };
    const loop = async () => {
      while (alive) {
        if (!(paused || document.hidden)) {
          await frame();
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    };
    loop();
    return () => {
      alive = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [paused]);

  return { src, error, setError };
}

function PhoneScreen({
  paused,
  onRefresh,
}: {
  paused: boolean;
  onRefresh: () => void;
}) {
  const { src, error, setError } = useFrames(paused);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  const rel = (e: ReactPointerEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    e.preventDefault();
    start.current = { ...rel(e), t: Date.now() };
  };

  const onUp = (e: ReactPointerEvent<HTMLImageElement>) => {
    const s = start.current;
    start.current = null;
    if (!s) {
      return;
    }
    const end = rel(e);
    const moved = Math.hypot(end.x - s.x, end.y - s.y) > 0.03;
    const body = moved
      ? {
          x1: s.x,
          y1: s.y,
          x2: end.x,
          y2: end.y,
          ms: Math.min(1500, Math.max(150, Date.now() - s.t)),
        }
      : { x: s.x, y: s.y };
    json(moved ? "/swipe" : "/tap", body).catch((err) =>
      setError(message(err))
    );
  };

  const key = (name: string) =>
    json(`/key/${name}`, {}).catch((err) => setError(message(err)));

  return (
    <div className="flex flex-col items-center gap-4">
      <IPhoneFrame>
        {src ? (
          // biome-ignore lint/performance/noImgElement: live frames from the VPS, not a static asset
          <img
            alt="Tela do celular"
            className="block aspect-[1179/2556] w-full cursor-pointer touch-none select-none"
            draggable={false}
            height={1279}
            onPointerDown={onDown}
            onPointerUp={onUp}
            src={src}
            width={590}
          />
        ) : (
          <div className="flex aspect-[1179/2556] w-full items-center justify-center bg-[radial-gradient(circle_at_30%_25%,#ff5e3a55,transparent_55%),radial-gradient(circle_at_75%_40%,#a23aff55,transparent_55%),radial-gradient(circle_at_40%_80%,#1e78ff55,transparent_55%)] p-8 text-center text-sm text-white/80">
            {error ?? "Ligando a tela…"}
          </div>
        )}
      </IPhoneFrame>
      {error && src ? (
        <p className="text-center text-destructive text-xs">{error}</p>
      ) : null}
      <div className="acrylic flex items-center gap-1 rounded-full border bg-card/80 p-1 shadow-sm">
        <RoundKey label="Voltar" onClick={() => key("back")}>
          <Icon className="size-[18px]" name="IconChevronLeft" />
        </RoundKey>
        <RoundKey label="Início" onClick={() => key("home")}>
          <Icon className="size-[18px]" name="IconHome" />
        </RoundKey>
        <RoundKey label="Apps abertos" onClick={() => key("recents")}>
          <span className="grid size-[15px] grid-cols-2 gap-[3px]">
            <span className="rounded-[2px] border-[1.5px] border-current" />
            <span className="rounded-[2px] border-[1.5px] border-current" />
            <span className="rounded-[2px] border-[1.5px] border-current" />
            <span className="rounded-[2px] border-[1.5px] border-current" />
          </span>
        </RoundKey>
        <span className="mx-1 h-5 w-px bg-border" />
        <RoundKey label="Atualizar a tela" onClick={onRefresh}>
          <Icon className="size-[18px]" name="IconArrowRotateClockwise" />
        </RoundKey>
      </div>
      <TypeBox onError={(e) => setError(message(e))} />
    </div>
  );
}

function RoundKey({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:scale-95"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

const MALTA_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Malta",
});

/** iOS status bar drawn over the phone (Android's own icons are hidden). */
function StatusBar() {
  const [now, setNow] = useState(() => MALTA_TIME.format(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(MALTA_TIME.format(new Date())), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 flex h-[5.9%] items-center justify-between px-[9%] pt-[0.4%] font-semibold text-[15px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
      translate="no"
    >
      <span className="w-[24%] text-center tabular-nums">{now}</span>
      <span className="flex w-[24%] items-center justify-center gap-[5px]">
        <span className="flex h-[11px] items-end gap-[1.5px]">
          {[4, 6, 8, 11].map((h) => (
            <span
              className="w-[3px] rounded-[1px] bg-white"
              key={h}
              style={{ height: h }}
            />
          ))}
        </span>
        <svg
          aria-hidden="true"
          className="h-[11px] w-[15px]"
          viewBox="0 0 16 12"
        >
          <path
            d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4C5.2.4 2.7 1.5.8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c-.4 0-.8.2-1.1.4L8 11.6l1.1-1.8c-.3-.2-.7-.4-1.1-.4Z"
            fill="white"
          />
        </svg>
        <span className="relative flex h-[12px] w-[24px] items-center rounded-[3.5px] border border-white/45 p-[1.5px]">
          <span className="h-full w-[80%] rounded-[1.5px] bg-white" />
          <span className="absolute -right-[3px] h-[4px] w-[1.5px] rounded-r-sm bg-white/45" />
        </span>
      </span>
    </div>
  );
}

/** iPhone 16 Pro look: titanium band, black bezel, Dynamic Island, buttons. */
function IPhoneFrame({ children }: { children: ReactNode }) {
  const side =
    "absolute w-[3px] bg-gradient-to-b from-[#b9b4ac] via-[#8a857e] to-[#5f5b55]";
  return (
    <div className="relative w-full max-w-[350px] px-[3px]">
      {/* side buttons */}
      <span className={cn(side, "top-[15%] left-0 h-[4.5%] rounded-l-sm")} />
      <span className={cn(side, "top-[23%] left-0 h-[7.5%] rounded-l-sm")} />
      <span className={cn(side, "top-[32.5%] left-0 h-[7.5%] rounded-l-sm")} />
      <span className={cn(side, "top-[26%] right-0 h-[11%] rounded-r-sm")} />
      <div className="rounded-[3.6rem] bg-gradient-to-br from-[#d6d1c9] via-[#8d8880] to-[#4c4944] p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55),0_10px_25px_-10px_rgba(0,0,0,0.4)]">
        <div className="rounded-[3.45rem] bg-black p-[11px]">
          <div className="relative overflow-hidden rounded-[2.75rem] bg-black">
            {children}
            <StatusBar />
            <span className="pointer-events-none absolute top-[1.15%] left-1/2 h-[3.55%] w-[31%] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <span className="absolute top-1/2 right-[14%] size-[22%] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#3a4a6b,#0b0f19_60%)]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeBox({ onError }: { onError: (e: unknown) => void }) {
  const [text, setText] = useState("");
  const send = async () => {
    if (!text) {
      return;
    }
    try {
      await json("/text", { text });
      setText("");
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="flex w-full max-w-[340px] items-center gap-2">
      <input
        className="h-9 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            send();
          }
        }}
        placeholder="Digitar no celular…"
        value={text}
      />
      <Button onClick={() => json("/key/enter", {})} size="sm" variant="ghost">
        Enter
      </Button>
      <Button onClick={send} size="sm" variant="secondary">
        Enviar
      </Button>
    </div>
  );
}

/* --------------------------------- settings ------------------------------ */

function Settings({
  status,
  onSaved,
}: {
  status: Status | null;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<Provider>(
    status?.provider ?? "gemini"
  );
  const [model, setModel] = useState(status?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const hint = PROVIDERS.find((p) => p.id === provider)?.hint;

  const save = async () => {
    try {
      await json("/config", {
        provider,
        model: model || null,
        apiKey: apiKey || null,
      });
      setApiKey("");
      setNote("Salvo no seu VPS ✓");
      onSaved();
    } catch (e) {
      setNote(message(e));
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-medium text-sm">IA que controla o celular</p>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Provedor</span>
        <select
          className="h-9 w-full rounded-lg border bg-background px-2"
          onChange={(e) => {
            setProvider(e.target.value as Provider);
            setModel("");
          }}
          value={provider}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">
          Modelo (vazio = recomendado)
        </span>
        <input
          className="h-9 w-full rounded-lg border bg-background px-2"
          onChange={(e) => setModel(e.target.value)}
          placeholder={
            status?.provider === provider ? (status.model ?? "") : ""
          }
          value={model}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">
          Chave da API{" "}
          {status?.hasKey && status.provider === provider
            ? "(já salva — deixe vazio para manter)"
            : ""}
        </span>
        <input
          autoComplete="off"
          className="h-9 w-full rounded-lg border bg-background px-2"
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          value={apiKey}
        />
      </label>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <p className="text-muted-foreground text-xs">
        A chave fica só no seu VPS e nunca volta para o navegador.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={save} size="sm">
          Salvar
        </Button>
        {note ? <span className="text-xs">{note}</span> : null}
      </div>
    </div>
  );
}

/* ---------------------------------- tasks -------------------------------- */

const LOG_ERROR = /error|💥|failed|❌/i;
const LOG_DONE = /✅|done|success|complete/i;
const LOG_THINK = /^\s*(🧠|💭|📝|🤔)/;

function TaskCard({ task, onStop }: { task: Task; onStop?: () => void }) {
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm">{task.goal}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs",
            task.state === "running" && "animate-pulse bg-primary/15",
            task.state === "done" && "bg-emerald-500/15 text-emerald-600",
            task.state === "failed" && "bg-destructive/15 text-destructive",
            task.state === "stopped" && "bg-muted text-muted-foreground"
          )}
        >
          {STATE_LABEL[task.state]}
        </span>
      </div>
      {task.log.length ? (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] text-[#c9d1d9]">
          <div className="flex items-center gap-1.5 border-white/10 border-b px-3 py-2">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 font-mono text-[11px] text-white/40">
              mobilerun
            </span>
          </div>
          <pre
            className="max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11.5px] leading-relaxed"
            translate="no"
          >
            {task.log.map((line, i) => (
              <span
                className={cn(
                  "block",
                  LOG_ERROR.test(line) && "text-[#ff7b72]",
                  LOG_DONE.test(line) && "text-[#7ee787]",
                  LOG_THINK.test(line) && "text-[#d2a8ff]"
                )}
                // biome-ignore lint/suspicious/noArrayIndexKey: log lines only grow
                key={i}
              >
                {line}
              </span>
            ))}
          </pre>
        </div>
      ) : null}
      {onStop && task.state === "running" ? (
        <Button onClick={onStop} size="sm" variant="destructive">
          <Icon className="size-4" name="IconStop" />
          Parar
        </Button>
      ) : null}
    </div>
  );
}

export function PhonePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [reasoning, setReasoning] = useState(false);
  const [current, setCurrent] = useState<Task | null>(null);
  const [history, setHistory] = useState<Task[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [screenKey, setScreenKey] = useState(0);
  const [locked, setLocked] = useState<"locked" | "not_admin" | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await json<Status>("/status");
      setStatus(s);
      setError(null);
      setLocked(null);
      if (!s.hasKey) {
        setSettingsOpen(true);
      }
      return s;
    } catch (e) {
      if (e instanceof Locked) {
        setLocked(e.message === "not_admin" ? "not_admin" : "locked");
      } else {
        setError(message(e));
      }
      return null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await json<Task[]>("/tasks"));
    } catch {
      // the status line already explains
    }
  }, []);

  useEffect(() => {
    loadStatus().then((s) => {
      if (s?.running) {
        json<Task>(`/tasks/${s.running}`).then(setCurrent, () => null);
      }
    });
    loadHistory();
  }, [loadStatus, loadHistory]);

  // Follows the running task
  const runningId = current?.state === "running" ? current.id : null;
  useEffect(() => {
    if (!runningId) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const t = await json<Task>(`/tasks/${runningId}`);
        setCurrent(t);
        if (t.state !== "running") {
          loadHistory();
        }
      } catch {
        // try again on the next tick
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [runningId, loadHistory]);

  const start = async (text = goal) => {
    const g = text.trim();
    if (!g) {
      return;
    }
    try {
      const { id } = await json<{ id: string }>("/tasks", {
        goal: g,
        reasoning,
      });
      setGoal("");
      setCurrent({
        id,
        goal: g,
        state: "running",
        started: Date.now() / 1000,
        ended: null,
        log: [],
      });
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  };

  const stop = async () => {
    if (current) {
      setCurrent(await json<Task>(`/tasks/${current.id}/stop`, {}));
    }
  };

  if (locked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <PinUnlock
          notAdmin={locked === "not_admin"}
          onDone={() => {
            setLocked(null);
            setScreenKey((n) => n + 1);
            loadStatus();
            loadHistory();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <a
            className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            href={`${BASE_PATH}/ia/`}
          >
            <Icon className="size-4" name="IconArrowLeft" />
            Chat
          </a>
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "size-2 rounded-full",
                status?.online ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            {status?.online ? "Celular ligado" : "Conectando…"}
          </span>
        </div>
        <PhoneScreen
          key={screenKey}
          onRefresh={() => setScreenKey((n) => n + 1)}
          paused={false}
        />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-semibold text-xl">Meu telefone</h1>
            <p className="text-muted-foreground text-sm">
              Um Android que fica ligado 24h no seu VPS. Peça em português e a
              IA faz no celular — ou toque e arraste na tela para usar você
              mesmo.
            </p>
          </div>
          <Button
            onClick={() => setSettingsOpen((v) => !v)}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconSettingsGear1" />
            Ajustes
          </Button>
        </div>

        {settingsOpen ? (
          <Settings
            onSaved={() => {
              loadStatus();
              setSettingsOpen(false);
            }}
            status={status}
          />
        ) : null}

        {error ? (
          <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
            <Icon className="size-4" name="IconLock" />
            {error}
          </p>
        ) : null}

        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <textarea
            className="min-h-20 w-full resize-none bg-transparent text-sm outline-none"
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start();
              }
            }}
            placeholder="O que o celular deve fazer? Ex.: abra o Chrome e pesquise…"
            value={goal}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-muted-foreground text-xs">
              <input
                checked={reasoning}
                onChange={(e) => setReasoning(e.target.checked)}
                type="checkbox"
              />
              Planejar antes (tarefas longas)
            </label>
            <Button
              disabled={!goal.trim() || current?.state === "running"}
              onClick={() => start()}
              size="sm"
            >
              <Icon className="size-4" name="IconPaperPlane" />
              Executar
            </Button>
          </div>
        </div>

        {current ? (
          <TaskCard onStop={stop} task={current} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted"
                key={s}
                onClick={() => start(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {history.filter((t) => t.id !== current?.id).length ? (
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Histórico
            </p>
            {history
              .filter((t) => t.id !== current?.id)
              .slice(0, 10)
              .map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
