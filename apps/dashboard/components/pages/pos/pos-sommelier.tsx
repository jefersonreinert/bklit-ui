"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { DEFAULT_MODEL, langOf, OPENAI_VOICES } from "@/lib/sommelier/prompt";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { QrCode } from "./pos-qr";

/**
 * POS → Sommelier IA (wine businesses): turns the guests' AI sommelier
 * on, gives the link / QR code for the tables, the owner's instructions
 * and what guests are asking.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const guestLink = (token: string) =>
  `${window.location.origin}${BASE}/sommelier/?t=${token}`;

const when = (ms: number) =>
  new Date(ms).toLocaleString(appLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function SommelierView() {
  const company = useCompany();
  const can = useCan();
  const data = usePosQuery(api.sommelier.settings, { company });
  const canEdit = can(["settings"]);

  const [enabled, setEnabled] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [notes, setNotes] = useState("");
  const [voice, setVoice] = useState<"browser" | "openai">("browser");
  const [openaiVoice, setOpenaiVoice] = useState("marin");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [dailyLimit, setDailyLimit] = useState("300");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loaded = data ? `${company}:${data.token}:${data.enabled}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the saved settings change
  useEffect(() => {
    if (!data) {
      return;
    }
    setEnabled(data.enabled);
    setGreeting(data.greeting);
    setNotes(data.notes);
    setVoice(data.voice);
    setOpenaiVoice(data.openaiVoice);
    setModel(data.model);
    setDailyLimit(String(data.dailyLimit));
  }, [loaded]);

  if (data === undefined) {
    return <p className="p-4 text-muted-foreground text-sm">Carregando…</p>;
  }
  if (data === null) {
    return <p className="p-4 text-muted-foreground text-sm">Sem acesso.</p>;
  }

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendPos(api.sommelier.save, {
        company,
        enabled,
        greeting,
        notes,
        voice,
        openaiVoice,
        model,
        dailyLimit: Number(dailyLimit) || 300,
      });
      setMsg({ ok: true, text: "Salvo." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!window.confirm("Gerar um link novo? Os QR codes impressos param de funcionar.")) {
      return;
    }
    await sendPos(api.sommelier.rotate, { company }).catch((err) =>
      setMsg({ ok: false, text: String(err) })
    );
  };

  const link = data.token ? guestLink(data.token) : null;
  const copy = async () => {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Opus 5.5 list price: $4 in / $20 out per MTok, cache reads $0.20
  const cost =
    ((data.usage.inTokens - data.usage.cacheRead) * 4 +
      data.usage.cacheRead * 0.2 +
      data.usage.outTokens * 20) /
    1_000_000;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#e6c88d] to-[#b0803f] text-[#2a1c08]">
            <Icon className="size-5" name="IconSparklesSoft" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Sommelier IA para clientes</h2>
            <p className="text-muted-foreground text-sm">
              O cliente lê o QR code na mesa e conversa por voz com o Claude sobre os
              vinhos: recomendações, notas de prova, harmonização, guias de
              degustação e a história de cada vinho. Usa a chave Anthropic de
              Configurações → AI Providers (ou a chave Claude do servidor).
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={setEnabled}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Stat label="vinhos na lista" value={data.wines} />
          <Stat label="nas máquinas" value={data.onTap} />
          <Stat label="com notas da casa" value={data.withNotes} />
          <Stat label="pratos p/ harmonizar" value={data.food} />
        </div>
      </section>

      {link && data.enabled ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-start">
          <QrCode label="QR code do sommelier" size={180} value={link} />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="font-semibold">Link dos clientes</h3>
            <p className="break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-xs">
              {link}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copy} size="sm" variant="outline">
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
              <Button onClick={() => window.open(link, "_blank", "noopener")} size="sm" variant="outline">
                Abrir como cliente
              </Button>
              {canEdit ? (
                <Button onClick={rotate} size="sm" variant="ghost">
                  Gerar link novo
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Imprima o QR code nas mesas e nas máquinas. Quem tiver o link pode
              usar; o limite diário protege o custo.
            </p>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h3 className="font-semibold">Configurações</h3>
        <Field label="Saudação (opcional)">
          <Input
            disabled={!canEdit}
            maxLength={300}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Welcome to Vinomad! I'm your sommelier…"
            value={greeting}
          />
        </Field>
        <Field
          hint="Ex.: 'Sempre sugira um vinho maltês', 'Promoção: taça de rosé a €5 até as 19h', 'Não recomende o Gallo Signature'."
          label="Instruções da casa para a IA"
        >
          <Textarea
            disabled={!canEdit}
            maxLength={3000}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            value={notes}
          />
        </Field>
        <Field label="Voz da resposta">
          <div className="grid grid-cols-2 gap-2">
            <Choice
              active={voice === "browser"}
              desc="Grátis. Usa a voz do celular do cliente."
              disabled={!canEdit}
              onClick={() => setVoice("browser")}
              title="Voz do celular"
            />
            <Choice
              active={voice === "openai"}
              desc="Mais humana (OpenAI gpt-realtime-2.1-mini). Precisa da chave OpenAI em AI Providers."
              disabled={!canEdit}
              onClick={() => setVoice("openai")}
              title="Voz natural"
            />
          </div>
        </Field>
        {voice === "openai" ? (
          <Field label="Timbre">
            <div className="flex flex-wrap gap-1.5">
              {OPENAI_VOICES.map((v) => (
                <button
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm capitalize",
                    openaiVoice === v && "border-primary bg-primary/10"
                  )}
                  disabled={!canEdit}
                  key={v}
                  onClick={() => setOpenaiVoice(v)}
                  type="button"
                >
                  {v}
                  {v === "marin" || v === "cedar" ? " ★" : ""}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modelo Claude">
            <Input
              disabled={!canEdit}
              onChange={(e) => setModel(e.target.value)}
              value={model}
            />
          </Field>
          <Field label="Limite de perguntas por dia">
            <Input
              disabled={!canEdit}
              inputMode="numeric"
              onChange={(e) => setDailyLimit(e.target.value.replace(/\D/g, ""))}
              value={dailyLimit}
            />
          </Field>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button disabled={busy} onClick={save}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
            {msg ? (
              <span className={cn("text-sm", msg.ok ? "text-emerald-600" : "text-destructive")}>
                {msg.text}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Só quem tem a permissão Ajustes pode mudar.
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">O que os clientes perguntam</h3>
          <p className="text-muted-foreground text-xs">
            Últimas 24 h: {data.usage.today} perguntas · {data.usage.guests} clientes
            {data.usage.failed ? ` · ${data.usage.failed} com erro` : ""} · ≈ US$
            {cost.toFixed(2)}
          </p>
        </div>
        {data.recent.length === 0 ? (
          <p className="mt-3 text-muted-foreground text-sm">Nenhuma pergunta ainda.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {data.recent.map((c) => (
              <li className="space-y-1 py-2.5" key={`${c.at}-${c.question.slice(0, 20)}`}>
                <p className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span>{when(c.at)}</span>
                  <span>{langOf(c.lang).flag}</span>
                  {c.ok === false ? <span className="text-destructive">erro</span> : null}
                </p>
                <p className="font-medium text-sm">{c.question}</p>
                {c.answer ? (
                  <p className="line-clamp-3 text-muted-foreground text-sm">{c.answer}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2 py-2">
      <p className="font-semibold text-lg tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-sm">{label}</p>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function Choice({
  title,
  desc,
  active,
  disabled,
  onClick,
}: {
  title: string;
  desc: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-xl border p-3 text-left",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <p className="font-medium text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{desc}</p>
    </button>
  );
}
