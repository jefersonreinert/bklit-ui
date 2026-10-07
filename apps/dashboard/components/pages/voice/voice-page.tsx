"use client";

import { Icon } from "@/lib/icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AI_MODELS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { Markdown } from "../ai/markdown";
import {
  deleteSession,
  loadSessions,
  sessionText,
  useVoice,
  type VoiceEngine,
  type VoiceMode,
  type VoiceSession,
  type VoiceStatus,
} from "./use-voice";
import { speechSupported } from "./voice-engine";

const SETTINGS_KEY = "casa-brasa-voice-settings";
const CLAY = "#d97757";

interface Settings {
  mode: VoiceMode;
  engine: VoiceEngine;
  model: string;
  speakReplies: boolean;
  autoSummaryMin: number;
}

const DEFAULTS: Settings = {
  mode: "conversa",
  engine: "iphone",
  model: "claude-sonnet-5-5",
  speakReplies: true,
  autoSummaryMin: 5,
};

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Pausado",
  listening: "Ouvindo",
  thinking: "Pensando…",
  speaking: "Respondendo no fone",
};

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Orb({
  status,
  onClick,
}: {
  status: VoiceStatus;
  onClick: () => void;
}) {
  const on = status !== "idle";
  return (
    <button
      aria-label={on ? "Parar de ouvir" : "Começar a ouvir"}
      aria-pressed={on}
      className="relative flex size-36 items-center justify-center rounded-full transition-transform active:scale-95 md:size-44"
      onClick={onClick}
      style={{ backgroundColor: on ? CLAY : undefined }}
      type="button"
    >
      {on ? (
        <>
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-25"
            style={{
              backgroundColor: CLAY,
              animationDuration: status === "listening" ? "1.8s" : "0.9s",
            }}
          />
          <span
            className="absolute -inset-3 rounded-full border-2 opacity-40"
            style={{ borderColor: CLAY }}
          />
        </>
      ) : (
        <span className="absolute inset-0 rounded-full border-2 border-muted-foreground/40 border-dashed bg-muted" />
      )}
      <Icon
        className={cn(
          "relative size-12 md:size-14",
          on ? "text-white" : "text-muted-foreground"
        )}
        name={status === "idle" ? "IconPlay" : "IconPause"}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="flex w-full gap-1 rounded-xl border p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          aria-pressed={value === o.id}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-sm",
            value === o.id ? "bg-muted font-medium" : "text-muted-foreground"
          )}
          key={o.id}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

function AskBox({ onAsk }: { onAsk: (q: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) {
      return;
    }
    setBusy(true);
    try {
      await onAsk(q.trim());
      setQ("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex gap-2" onSubmit={submit}>
      <Input
        aria-label="Pergunta sobre a transcrição"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Pergunte algo sobre o que foi dito…"
        value={q}
      />
      <Button disabled={busy || !q.trim()} type="submit">
        {busy ? "…" : "Perguntar"}
      </Button>
    </form>
  );
}

function History({ currentId }: { currentId: string }) {
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setSessions(loadSessions().filter((s) => s.id !== currentId));
  }, [currentId]);
  if (sessions.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">Sessões anteriores</h3>
      {sessions.map((s) => (
        <div className="rounded-xl border bg-card/60" key={s.id}>
          <div className="flex items-center gap-2 p-3">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setOpen(open === s.id ? null : s.id)}
              type="button"
            >
              <p className="truncate font-medium text-sm">
                {new Date(s.startedAt).toLocaleString("pt-BR")}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {s.mode === "notas" ? "Anotações" : "Conversa"} ·{" "}
                {s.lines.length} trechos
                {s.summaries.length ? ` · ${s.summaries.length} resumos` : ""}
              </p>
            </button>
            <Button
              aria-label="Baixar sessão"
              onClick={() => download(`voz-${s.id}.txt`, sessionText(s))}
              size="icon-sm"
              variant="ghost"
            >
              <Icon className="size-4" name="IconArrowDown" />
            </Button>
            <Button
              aria-label="Excluir sessão"
              onClick={() => {
                deleteSession(s.id);
                setSessions((list) => list.filter((x) => x.id !== s.id));
              }}
              size="icon-sm"
              variant="ghost"
            >
              <Icon className="size-4" name="IconTrashCan" />
            </Button>
          </div>
          {open === s.id ? (
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t p-3 text-muted-foreground text-xs">
              {sessionText(s)}
            </pre>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function idleHint(running: boolean, mode: VoiceMode) {
  if (!running) {
    return "Toque para começar. Com o fone conectado, o microfone dele é usado.";
  }
  return mode === "conversa"
    ? "Fale normalmente. Quando você fizer uma pausa, envio para o Claude."
    : "Transcrevendo tudo o que o microfone ouvir.";
}

function SettingsPanel({
  settings,
  change,
  onStop,
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
  onStop: () => void;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border bg-card/60 p-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Modo</span>
        <Segmented
          label="Modo"
          onChange={(mode) => {
            onStop();
            change({ mode });
          }}
          options={[
            { id: "conversa", label: "Conversa" },
            { id: "notas", label: "Anotações" },
          ]}
          value={settings.mode}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Transcrição</span>
        <Segmented
          label="Transcrição"
          onChange={(engine) => {
            onStop();
            change({ engine });
          }}
          options={[
            { id: "iphone", label: "iPhone (grátis)" },
            { id: "gemini", label: "Gemini (precisa)" },
          ]}
          value={settings.engine}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Modelo</span>
        <Select
          items={AI_MODELS.map((m) => ({ value: m.id, label: m.name }))}
          onValueChange={(model) => change({ model: model as string })}
          value={settings.model}
        >
          <SelectTrigger aria-label="Modelo" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {settings.mode === "conversa" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
          <span className="text-sm">Ler respostas em voz alta</span>
          <Switch
            aria-label="Ler respostas em voz alta"
            checked={settings.speakReplies}
            onCheckedChange={(speakReplies) => change({ speakReplies })}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">
            Resumo automático
          </span>
          <Segmented
            label="Resumo automático"
            onChange={(m) => change({ autoSummaryMin: Number(m) })}
            options={[
              { id: "0", label: "Desligado" },
              { id: "5", label: "5 min" },
              { id: "10", label: "10 min" },
              { id: "15", label: "15 min" },
            ]}
            value={String(settings.autoSummaryMin)}
          />
        </div>
      )}
    </section>
  );
}

export function VoicePage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      const next = saved
        ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<Settings>) }
        : DEFAULTS;
      setSettings(speechSupported() ? next : { ...next, engine: "gemini" });
    } catch {
      // keep defaults
    }
  }, []);

  const change = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  const v = useVoice(settings);
  const running = v.status !== "idle";
  const lastLine = v.session.lines.at(-1)?.id;

  useEffect(() => {
    if (lastLine || v.interim) {
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [lastLine, v.interim]);

  const pushToTalk =
    settings.engine === "gemini" && settings.mode === "conversa";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionText(v.session));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="flex flex-col items-center gap-4 rounded-3xl border bg-card/60 p-5 text-center">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1 font-medium text-xs",
            running ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
          )}
          role="status"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              running ? "animate-pulse bg-white" : "bg-muted-foreground"
            )}
          />
          {STATUS_LABEL[v.status]}
          {v.recording ? " · gravando" : ""}
        </div>
        <Orb onClick={running ? v.stop : v.start} status={v.status} />
        {pushToTalk && running ? (
          <Button
            onClick={v.talk}
            size="lg"
            variant={v.recording ? "destructive" : "default"}
          >
            <Icon
              className="size-4"
              name={v.recording ? "IconPaperPlane" : "IconPlay"}
            />
            {v.recording ? "Enviar fala" : "Falar"}
          </Button>
        ) : null}
        <p className="min-h-10 max-w-xl text-muted-foreground text-sm italic">
          {v.interim || idleHint(running, settings.mode)}
        </p>
        {v.error ? (
          <button
            className="rounded-lg border border-destructive/40 px-3 py-2 text-destructive text-sm"
            onClick={v.clearError}
            type="button"
          >
            {v.error}
          </button>
        ) : null}
      </section>

      <SettingsPanel change={change} onStop={v.stop} settings={settings} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-medium">
            {settings.mode === "conversa" ? "Conversa" : "Transcrição"}{" "}
            <span className="text-muted-foreground text-sm">
              · desde {time(v.session.startedAt)}
            </span>
          </h3>
          {settings.mode === "notas" ? (
            <Button
              onClick={() => v.summarize(true)}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconSparklesSoft" />
              Resumir tudo
            </Button>
          ) : null}
          <Button
            aria-label="Copiar"
            onClick={copy}
            size="icon-sm"
            variant="ghost"
          >
            <Icon
              className="size-4"
              name={copied ? "IconCheckmark1" : "IconSquareBehindSquare1"}
            />
          </Button>
          <Button
            aria-label="Baixar .txt"
            onClick={() =>
              download(`voz-${v.session.id}.txt`, sessionText(v.session))
            }
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconArrowDown" />
          </Button>
          <Button onClick={v.newSession} size="sm" variant="ghost">
            Nova sessão
          </Button>
        </div>

        {settings.mode === "notas" ? <AskBox onAsk={v.ask} /> : null}

        {v.session.summaries.map((s) => (
          <article
            className="rounded-2xl border bg-card/60 p-4 text-sm"
            key={s.at}
          >
            <p className="mb-2 flex items-center gap-2 font-medium text-muted-foreground text-xs">
              <Icon className="size-3.5" name="IconSparklesSoft" />
              Resumo · {time(s.at)}
            </p>
            <Markdown text={s.text} />
          </article>
        ))}

        <ol className="flex flex-col gap-2">
          {v.session.lines.map((l) => (
            <li
              className={cn(
                "flex",
                l.who === "me" && settings.mode === "conversa"
                  ? "justify-end"
                  : ""
              )}
              key={l.id}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
                  l.who === "me" ? "bg-muted" : "border bg-card/60"
                )}
              >
                <span className="mr-2 text-[11px] text-muted-foreground tabular-nums">
                  {time(l.at)}
                </span>
                {l.text}
              </div>
            </li>
          ))}
          {v.session.lines.length === 0 ? (
            <li className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
              Nada transcrito ainda.
            </li>
          ) : null}
        </ol>
        <div ref={bottom} />
      </section>

      <p className="text-muted-foreground text-xs">
        O iPhone só deixa o microfone ligado com o app aberto e a tela acesa — a
        tela fica ligada automaticamente enquanto estiver ouvindo. Avise as
        pessoas por perto quando estiver gravando.
      </p>

      <History currentId={v.session.id} />
    </div>
  );
}
