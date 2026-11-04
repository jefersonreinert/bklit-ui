"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";

/**
 * "Meu telefone": an Android phone running 24/7 on the VPS (Redroid),
 * driven by Mobilerun. The VPS server (/opt/phone-agent) only answers
 * with the panel's own token, so the access code protects the phone too.
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

async function call(path: string, init?: RequestInit) {
  const auth = await panelToken();
  if (!auth) {
    throw new Locked("locked");
  }
  const res = await fetch(`${PHONE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${auth}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) {
    token = null;
    throw new Locked("locked");
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
    ? "Digite o código de acesso do painel para usar o celular."
    : (ERRORS[(e as Error).message] ??
      "Não consegui falar com o celular. Tente de novo.");

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
        const res = await call("/screen?w=540");
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
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[340px] overflow-hidden rounded-[2.2rem] border-[6px] border-foreground/85 bg-black shadow-xl">
        {src ? (
          // biome-ignore lint/performance/noImgElement: live frames from the VPS, not a static asset
          <img
            alt="Tela do celular"
            className="block aspect-[1080/2340] w-full cursor-pointer touch-none select-none"
            draggable={false}
            height={1170}
            onPointerDown={onDown}
            onPointerUp={onUp}
            src={src}
            width={540}
          />
        ) : (
          <div className="flex aspect-[1080/2340] w-full items-center justify-center p-6 text-center text-sm text-white/70">
            {error ?? "Ligando a tela…"}
          </div>
        )}
      </div>
      {error && src ? (
        <p className="text-center text-destructive text-xs">{error}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button onClick={() => key("back")} size="sm" variant="outline">
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar
        </Button>
        <Button onClick={() => key("home")} size="sm" variant="outline">
          <Icon className="size-4" name="IconHome" />
          Início
        </Button>
        <Button onClick={() => key("recents")} size="sm" variant="outline">
          Apps
        </Button>
        <Button
          aria-label="Atualizar a tela"
          onClick={onRefresh}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconArrowRotateClockwise" />
        </Button>
      </div>
      <TypeBox onError={(e) => setError(message(e))} />
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
        <pre
          className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 font-mono text-[11px] leading-relaxed"
          translate="no"
        >
          {task.log.join("\n")}
        </pre>
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

  const loadStatus = useCallback(async () => {
    try {
      const s = await json<Status>("/status");
      setStatus(s);
      setError(null);
      if (!s.hasKey) {
        setSettingsOpen(true);
      }
      return s;
    } catch (e) {
      setError(message(e));
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
