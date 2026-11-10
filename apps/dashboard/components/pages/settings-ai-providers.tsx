"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AiApiError, aiAction, fetchAiConfig } from "@/lib/ai/client";
import {
  AI_ERROR_KINDS,
  AI_ERROR_LABELS,
  AI_PROVIDERS,
  AMBIGUOUS_KINDS,
  type AiConfigView,
  type AiErrorKind,
  type AiLogEntry,
  type AiProviderId,
  type AiProviderView,
  type AiRouterSettings,
} from "@/lib/ai/providers-meta";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Settings → AI Providers & API Configuration. Turn providers on/off,
 * save keys (encrypted on the server, never shown again), pick the model,
 * set the priority order, test the connection, and tune the automatic
 * fallback. The log shows which provider answered each request.
 */

const TIMEOUTS = [20_000, 45_000, 90_000];
const CUSTOM = "__custom__";

const time = (t: number) =>
  new Date(t).toLocaleString(appLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  });

function StatusPill({ p }: { p: AiProviderView }) {
  if (!p.hasKey) {
    return <Pill tone="muted">Sem chave</Pill>;
  }
  if (p.cooldownUntil) {
    return (
      <Pill tone="warn">
        Em pausa até{" "}
        {new Date(p.cooldownUntil).toLocaleTimeString(appLocale(), {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Pill>
    );
  }
  if (p.status.state === "ok") {
    return (
      <Pill tone="ok">
        Conectado{p.status.latencyMs ? ` · ${(p.status.latencyMs / 1000).toFixed(1)} s` : ""}
      </Pill>
    );
  }
  if (p.status.state === "error") {
    return (
      <Pill tone="bad">{p.status.kind ? AI_ERROR_LABELS[p.status.kind] : "Erro"}</Pill>
    );
  }
  return <Pill tone="muted">Não testado</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "ok" | "bad" | "warn" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        tone === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "muted" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

export function AiProvidersCard() {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [log, setLog] = useState<AiLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAiConfig();
      setConfig(data.config);
      setLog(data.log);
      setError(null);
    } catch (err) {
      if (err instanceof AiApiError && err.message === "Sem acesso.") {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Erro ao carregar.");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (body: Record<string, unknown>) => {
    try {
      const data = await aiAction<{ config: AiConfigView }>(body);
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
      return false;
    }
  };

  const saveRouter = (patch: Partial<AiRouterSettings>) => {
    if (!config) {
      return;
    }
    const router = { ...config.router, ...patch };
    setConfig({ ...config, router });
    run({ action: "router", router });
  };

  const move = (id: AiProviderId, to: number) => {
    if (!config) {
      return;
    }
    const order = config.router.order.filter((x) => x !== id);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, id);
    setConfig({
      ...config,
      router: { ...config.router, order },
      providers: order
        .map((o) => config.providers.find((p) => p.id === o))
        .filter((p): p is AiProviderView => Boolean(p)),
    });
    run({ action: "router", router: { ...config.router, order } });
  };

  return (
    <Card id="ai-providers">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5" name="IconSparkle" />
          AI Providers &amp; API Configuration
        </CardTitle>
        <CardDescription>
          Provedores de IA usados para reconhecer produtos por foto. A leitura de
          códigos de barras acontece no próprio iPhone e não gasta créditos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {denied ? (
          <p className="text-muted-foreground text-sm">
            Disponível para quem entrou com o código de acesso do painel ou para
            administradores do POS.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {!(config || denied || error) ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner className="size-4" /> Carregando…
          </p>
        ) : null}
        {config ? (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
              <Icon className="mt-0.5 size-4 shrink-0" name="IconShieldCheck" />
              <p>
                As chaves ficam guardadas no servidor, criptografadas (AES-256-GCM),
                e nunca voltam para o navegador nem ficam no app do iPhone — aqui
                aparecem só os 4 últimos caracteres.
                {config.canStoreKeys
                  ? ""
                  : " Atenção: o servidor ainda não tem o segredo CONNECTORS_SECRET, então não consegue guardar chaves."}
              </p>
            </div>

            <section aria-label="Provedores" className="flex flex-col gap-3">
              <h3 className="font-semibold text-sm">Provedores e prioridade</h3>
              <ol className="flex flex-col gap-3">
                {config.providers.map((p, i) => (
                  <ProviderCard
                    first={i === 0}
                    index={i}
                    key={p.id}
                    last={i === config.providers.length - 1}
                    onDown={() => move(p.id, i + 1)}
                    onPrimary={() => move(p.id, 0)}
                    onUp={() => move(p.id, i - 1)}
                    provider={p}
                    run={run}
                  />
                ))}
              </ol>
            </section>

            <RouterSettings onChange={saveRouter} router={config.router} />
            <RequestLog log={log} onRefresh={load} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProviderCard({
  provider: p,
  index,
  first,
  last,
  onUp,
  onDown,
  onPrimary,
  run,
}: {
  provider: AiProviderView;
  index: number;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onPrimary: () => void;
  run: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const meta = AI_PROVIDERS[p.id];
  const [key, setKey] = useState("");
  const [changingKey, setChangingKey] = useState(false);
  const [busy, setBusy] = useState<null | "key" | "test" | "models">(null);
  const [test, setTest] = useState<string | null>(null);
  const models = p.models?.length
    ? [...p.models].sort((a, b) => Number(Boolean(b.vision)) - Number(Boolean(a.vision)))
    : meta.suggested.map((id) => ({ id, name: undefined, vision: undefined }));
  const known = models.some((m) => m.id === p.model);
  const [custom, setCustom] = useState(!known && Boolean(p.model) && Boolean(p.models?.length));
  const [customModel, setCustomModel] = useState(p.model);

  const saveKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      return;
    }
    setBusy("key");
    if (await run({ action: "setKey", provider: p.id, key: key.trim() })) {
      setKey("");
      setChangingKey(false);
      // Check right away and load the models
      setBusy("test");
      await doTest();
    }
    setBusy(null);
  };

  const doTest = async () => {
    setBusy("test");
    setTest(null);
    try {
      const data = await aiAction<{
        test: { ok: boolean; latencyMs?: number; models?: number; error?: string; kind?: AiErrorKind };
      }>({ action: "test", provider: p.id, full: true });
      setTest(
        data.test.ok
          ? `Funcionando · ${data.test.models ?? 0} modelos · ${((data.test.latencyMs ?? 0) / 1000).toFixed(1)} s`
          : `${data.test.kind ? AI_ERROR_LABELS[data.test.kind] : "Erro"}: ${data.test.error ?? ""}`
      );
      await run({ action: "provider", provider: p.id });
    } catch (err) {
      setTest(err instanceof Error ? err.message : "Erro no teste.");
    }
    setBusy(null);
  };

  const rank = first ? "Principal" : `${index + 1}º · reserva`;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-3",
        p.enabled ? "bg-card" : "bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium text-[11px]",
            first ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">
            {meta.label} <span className="font-normal text-muted-foreground">· {meta.product}</span>
          </p>
        </div>
        <Switch
          aria-label={`Ativar ${meta.label}`}
          checked={p.enabled}
          disabled={!p.hasKey}
          onCheckedChange={(enabled) => run({ action: "provider", provider: p.id, enabled })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill p={p} />
        {p.status.state === "error" && p.status.message ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs" title={p.status.message}>
            {p.status.message}
          </span>
        ) : null}
      </div>

      {p.hasKey && !changingKey ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground">••••••••{p.keyLast4}</span>
          <Button onClick={() => setChangingKey(true)} size="sm" variant="ghost">
            Trocar chave
          </Button>
          <Button
            onClick={() => run({ action: "removeKey", provider: p.id })}
            size="sm"
            variant="ghost"
          >
            Remover
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-1.5" onSubmit={saveKey}>
          <label className="text-sm" htmlFor={`key-${p.id}`}>
            API key
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              className="h-10 flex-1 font-mono text-base sm:text-sm"
              id={`key-${p.id}`}
              onChange={(e) => setKey(e.target.value)}
              placeholder={meta.keyHint}
              spellCheck={false}
              type="password"
              value={key}
            />
            <Button className="h-10" disabled={!key.trim() || busy !== null} type="submit">
              {busy === "key" ? <Spinner className="size-4" /> : "Salvar"}
            </Button>
          </div>
          <a
            className="text-primary text-xs underline-offset-2 hover:underline"
            href={meta.consoleUrl}
            rel="noreferrer"
            target="_blank"
          >
            Criar ou recarregar a chave no painel da {meta.label}
          </a>
        </form>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm" htmlFor={`model-${p.id}`}>
          Modelo
        </label>
        <div className="flex gap-2">
          {custom ? (
            <Input
              className="h-10 flex-1 font-mono text-base sm:text-sm"
              id={`model-${p.id}`}
              onBlur={() =>
                customModel.trim() &&
                customModel.trim() !== p.model &&
                run({ action: "provider", provider: p.id, model: customModel.trim() })
              }
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="id do modelo"
              value={customModel}
            />
          ) : (
            <select
              className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base sm:text-sm"
              id={`model-${p.id}`}
              onChange={(e) => {
                if (e.target.value === CUSTOM) {
                  setCustom(true);
                  return;
                }
                run({ action: "provider", provider: p.id, model: e.target.value });
              }}
              value={known ? p.model : CUSTOM}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                  {m.vision === false ? " — sem imagem" : ""}
                </option>
              ))}
              {known ? null : <option value={CUSTOM}>{p.model || "Outro…"}</option>}
              {known ? <option value={CUSTOM}>Outro modelo…</option> : null}
            </select>
          )}
          <Button
            aria-label="Carregar modelos do provedor"
            className="h-10"
            disabled={!p.hasKey || busy !== null}
            onClick={async () => {
              setBusy("models");
              await run({ action: "models", provider: p.id });
              setCustom(false);
              setBusy(null);
            }}
            variant="outline"
          >
            {busy === "models" ? <Spinner className="size-4" /> : <Icon className="size-4" name="IconArrowsRepeat" />}
            <span className="hidden sm:inline">Atualizar lista</span>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {p.modelsAt
            ? `Lista carregada do provedor em ${time(p.modelsAt)}.`
            : "Sugestões; toque em atualizar para carregar os modelos da sua conta."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!p.hasKey || busy !== null} onClick={doTest} size="sm" variant="outline">
          {busy === "test" ? <Spinner className="size-4" /> : <Icon className="size-4" name="IconWifiFull" />}
          Testar conexão
        </Button>
        {first ? null : (
          <Button onClick={onPrimary} size="sm" variant="ghost">
            Tornar principal
          </Button>
        )}
        <span className="ml-auto flex">
          <Button aria-label={`Subir ${meta.label}`} disabled={first} onClick={onUp} size="sm" variant="ghost">
            <Icon className="size-4" name="IconArrowUp" />
          </Button>
          <Button aria-label={`Descer ${meta.label}`} disabled={last} onClick={onDown} size="sm" variant="ghost">
            <Icon className="size-4" name="IconArrowDown" />
          </Button>
        </span>
      </div>
      {test ? (
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {test} <span className="opacity-70">(o teste completo usa poucos tokens)</span>
        </p>
      ) : null}
    </li>
  );
}

function RouterSettings({
  router,
  onChange,
}: {
  router: AiRouterSettings;
  onChange: (patch: Partial<AiRouterSettings>) => void;
}) {
  const toggleKind = (k: AiErrorKind, on: boolean) =>
    onChange({
      fallbackOn: on
        ? [...new Set([...router.fallbackOn, k])]
        : router.fallbackOn.filter((x) => x !== k),
    });
  const kinds = AI_ERROR_KINDS.filter((k) => !AMBIGUOUS_KINDS.includes(k));
  return (
    <section aria-label="Fallback automático" className="flex flex-col gap-3 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Fallback automático</h3>
          <p className="text-muted-foreground text-xs">
            Se o principal falhar, tenta o próximo da lista — cada provedor no
            máximo uma vez por pedido, sem repetir chamadas.
          </p>
        </div>
        <Switch
          aria-label="Fallback automático"
          checked={router.fallbackEnabled}
          onCheckedChange={(fallbackEnabled) => onChange({ fallbackEnabled })}
        />
      </div>
      {router.fallbackEnabled ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm">Trocar de provedor quando houver:</legend>
            {kinds.map((k) => (
              <label className="flex min-h-9 items-center gap-2 text-sm" key={k}>
                <input
                  checked={router.fallbackOn.includes(k)}
                  className="size-4 accent-[var(--primary)]"
                  onChange={(e) => toggleKind(k, e.target.checked)}
                  type="checkbox"
                />
                {AI_ERROR_LABELS[k]}
              </label>
            ))}
          </fieldset>
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>
              Trocar também após tempo esgotado
              <span className="block text-amber-700 text-xs dark:text-amber-300">
                O provedor pode já ter processado e cobrado o pedido: pode cobrar duas vezes.
              </span>
            </span>
            <Switch
              aria-label="Trocar também após tempo esgotado"
              checked={router.allowAmbiguous}
              onCheckedChange={(allowAmbiguous) => onChange({ allowAmbiguous })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Avisar quando trocar de provedor
            <Switch
              aria-label="Avisar quando trocar de provedor"
              checked={router.notifySwitch}
              onCheckedChange={(notifySwitch) => onChange({ notifySwitch })}
            />
          </label>
        </>
      ) : null}
      <label className="flex items-center justify-between gap-3 text-sm" htmlFor="ai-timeout">
        Tempo máximo por provedor
        <select
          className="h-9 rounded-lg border bg-background px-2 text-sm"
          id="ai-timeout"
          onChange={(e) => onChange({ timeoutMs: Number(e.target.value) })}
          value={TIMEOUTS.includes(router.timeoutMs) ? router.timeoutMs : 45_000}
        >
          {TIMEOUTS.map((t) => (
            <option key={t} value={t}>
              {t / 1000} s
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function RequestLog({ log, onRefresh }: { log: AiLogEntry[]; onRefresh: () => void }) {
  return (
    <section aria-label="Histórico de solicitações" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Últimas solicitações</h3>
        <Button onClick={onRefresh} size="sm" variant="ghost">
          <Icon className="size-4" name="IconArrowsRepeat" />
          Atualizar
        </Button>
      </div>
      {log.length ? (
        <ul className="divide-y rounded-2xl border text-sm">
          {log.map((r) => (
            <li className="flex flex-col gap-1 px-3 py-2" key={`${r.requestId}-${r.createdAt}`}>
              <div className="flex items-center gap-2">
                <Pill tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "muted"}>
                  {r.status === "ok" ? "OK" : r.status === "failed" ? "Falhou" : "Em andamento"}
                </Pill>
                <span className="min-w-0 flex-1 truncate">
                  {r.provider ? `${AI_PROVIDERS[r.provider].label} · ${r.model}` : "—"}
                  {r.cached ? " · reaproveitado (sem custo)" : ""}
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">{time(r.createdAt)}</span>
              </div>
              {r.attempts.length > 1 || r.attempts.some((a) => !a.ok) ? (
                <p className="text-muted-foreground text-xs">
                  {r.attempts
                    .map((a) =>
                      a.skipped
                        ? `${AI_PROVIDERS[a.provider].label}: pulado (${a.skipped})`
                        : a.ok
                          ? `${AI_PROVIDERS[a.provider].label} ✓ ${(a.ms / 1000).toFixed(1)} s`
                          : `${AI_PROVIDERS[a.provider].label} ✗ ${a.kind ? AI_ERROR_LABELS[a.kind] : ""}`
                    )
                    .join(" → ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Nenhuma solicitação ainda.</p>
      )}
    </section>
  );
}
