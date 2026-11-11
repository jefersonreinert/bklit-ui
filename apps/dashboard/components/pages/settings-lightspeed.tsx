"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { LSK_ENVS, type LskEnv } from "@/lib/lightspeed/k-series";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "./telegram/telegram-shared";

/**
 * Settings → Lightspeed K-Series: API client (from the Lightspeed
 * developer portal), OAuth connection, and which Lightspeed location
 * feeds which of our businesses in the POS "Lightspeed" mode.
 */
export function LightspeedCard() {
  return (
    <TelegramProvider
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Lightspeed K-Series</CardTitle>
          </CardHeader>
          <CardContent>
            <Notice>O banco central do painel está indisponível agora.</Notice>
          </CardContent>
        </Card>
      }
    >
      <LightspeedSettings />
    </TelegramProvider>
  );
}

const when = (t: number | null) =>
  t
    ? new Date(t).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" })
    : "nunca";

function LightspeedSettings() {
  const st = useQuery(api.lightspeed.status, {});
  const configure = useMutation(api.lightspeed.configure);
  const startAuth = useMutation(api.lightspeed.startAuth);
  const disconnect = useMutation(api.lightspeed.disconnect);
  const mapLocation = useMutation(api.lightspeed.mapLocation);
  const syncNow = useMutation(api.lightspeed.syncNow);
  const [env, setEnv] = useState<LskEnv>("trial");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st) {
      setEnv(st.env);
    }
  }, [st]);

  // Back from the Lightspeed login
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("lightspeed");
    if (!r) {
      return;
    }
    setMsg(
      r === "ok"
        ? { tone: "ok", text: "Lightspeed conectado. Agora ligue cada local a um bar abaixo." }
        : { tone: "bad", text: r === "denied" ? "A autorização foi recusada no Lightspeed." : "A conexão falhou. Veja o erro abaixo e tente de novo." }
    );
    q.delete("lightspeed");
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    document.getElementById("lightspeed")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) {
        setMsg({ tone: "ok", text: ok });
      }
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0] ?? "Erro." : "Erro." });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await configure({ env, clientId: clientId.trim(), clientSecret: secret });
      setSecret("");
    }, "Credenciais salvas. Agora clique em Conectar com Lightspeed.");
  };

  const connect = () =>
    run(async () => {
      const url = await startAuth({ returnTo: `${window.location.origin}/configuracoes` });
      window.location.href = url;
    });

  if (st === undefined) {
    return null;
  }

  return (
    <Card id="lightspeed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5" name="IconChainLink1" />
          Lightspeed K-Series
        </CardTitle>
        <CardDescription>
          Liga o app ao seu Lightspeed para controlá-lo pelo POS no modo
          “Lightspeed”: pedidos nas mesas, fechar contas, itens, estoque pelas
          vendas, vendas e recibos, e importar cardápio e mesas para o sistema
          independente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {st === null ? (
          <Notice>Disponível para quem entrou com o código de acesso do painel.</Notice>
        ) : (
          <>
            {msg ? (
              <p
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  msg.tone === "bad"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-emerald-500/30 bg-emerald-500/10"
                )}
                role={msg.tone === "bad" ? "alert" : "status"}
              >
                {msg.text}
              </p>
            ) : null}

            <ol className="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-4 py-3 text-xs">
              <li>
                1. No portal de desenvolvedor da Lightspeed (
                <a className="text-primary underline" href={LSK_ENVS[env].portal} rel="noreferrer" target="_blank">
                  {LSK_ENVS[env].portal.replace("https://", "")}
                </a>
                ), peça um <b>API client</b> com os escopos <code>orders-api</code>,{" "}
                <code>financial-api</code>, <code>items</code>, <code>staff-api</code> e{" "}
                <code>offline_access</code>. A Lightspeed precisa aprovar.
              </li>
              <li className="flex flex-wrap items-center gap-1">
                2. Cadastre este endereço de retorno (redirect URI):
                <code className="break-all rounded bg-background px-1.5 py-0.5">{st.redirectUri}</code>
                <button
                  className="text-primary underline"
                  onClick={() => navigator.clipboard?.writeText(st.redirectUri)}
                  type="button"
                >
                  copiar
                </button>
              </li>
              <li>3. Cole o Client ID e o Client Secret abaixo e clique em Conectar.</li>
            </ol>

            <form className="flex flex-col gap-3" onSubmit={save}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-env">
                  Ambiente
                  <select
                    className="h-10 rounded-lg border bg-background px-3 text-base sm:text-sm"
                    id="lsk-env"
                    onChange={(e) => setEnv(e.target.value as LskEnv)}
                    value={env}
                  >
                    <option value="trial">{LSK_ENVS.trial.label}</option>
                    <option value="prod">{LSK_ENVS.prod.label}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-id">
                  Client ID
                  <Input
                    autoComplete="off"
                    className="h-10 font-mono text-base sm:text-sm"
                    id="lsk-id"
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder={st.clientIdHint ?? "client id"}
                    value={clientId}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-secret">
                  Client Secret
                  <Input
                    autoComplete="off"
                    className="h-10 font-mono text-base sm:text-sm"
                    id="lsk-secret"
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={st.hasClient ? "•••••••• (salvo)" : "client secret"}
                    type="password"
                    value={secret}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !(clientId.trim() && (secret.trim() || st.hasClient))} type="submit" variant="outline">
                  Salvar credenciais
                </Button>
                <Button disabled={busy || !st.hasClient} onClick={connect} type="button">
                  <Icon className="size-4" name="IconChainLink1" />
                  {st.connected ? "Reconectar com Lightspeed" : "Conectar com Lightspeed"}
                </Button>
                {st.connected ? (
                  <Button disabled={busy} onClick={() => run(() => disconnect({}), "Desconectado.")} type="button" variant="ghost">
                    Desconectar
                  </Button>
                ) : null}
              </div>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  st.connected
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {st.connected ? `Conectado (${LSK_ENVS[st.env].label})` : "Não conectado"}
              </span>
              {st.connected ? (
                <span className="text-muted-foreground text-xs">
                  Última sincronização: {when(st.lastSyncAt)} · a cada 10 min
                </span>
              ) : null}
              {st.connected ? (
                <Button disabled={busy} onClick={() => run(() => syncNow({}), "Sincronização iniciada.")} size="sm" variant="ghost">
                  <Icon className="size-4" name="IconArrowsRepeat" />
                  Sincronizar agora
                </Button>
              ) : null}
            </div>
            {st.error || st.syncError ? (
              <p className="text-destructive text-xs" role="alert">
                {st.error ?? st.syncError}
              </p>
            ) : null}

            {st.locations.length ? (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold text-sm">Locais do Lightspeed → bares do app</h3>
                <ul className="divide-y rounded-2xl border">
                  {st.locations.map((l) => (
                    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center" key={l.locationId}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{l.name}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          {l.businessName} · #{l.locationId}
                          {l.company ? ` · vendas até ${when(l.salesAt)}` : ""}
                        </p>
                        {l.error ? <p className="text-destructive text-xs">{l.error}</p> : null}
                      </div>
                      <select
                        aria-label={`Bar ligado a ${l.name}`}
                        className="h-10 rounded-lg border bg-background px-3 text-base sm:text-sm"
                        disabled={busy}
                        onChange={(e) =>
                          run(() =>
                            mapLocation({
                              locationId: l.locationId,
                              company: e.target.value || null,
                              enabled: Boolean(e.target.value),
                            })
                          )
                        }
                        value={l.company ?? ""}
                      >
                        <option value="">Não ligado</option>
                        {st.companies.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {l.company ? (
                        <span className="flex items-center gap-2 text-xs">
                          Sincronizar
                          <Switch
                            aria-label={`Sincronizar ${l.name}`}
                            checked={l.enabled}
                            onCheckedChange={(enabled) =>
                              run(() => mapLocation({ locationId: l.locationId, company: l.company, enabled }))
                            }
                          />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : st.connected ? (
              <p className="text-muted-foreground text-sm">Buscando os locais do Lightspeed…</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
