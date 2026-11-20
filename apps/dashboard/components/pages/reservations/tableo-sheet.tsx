"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { TABLEO_ENVS, type TableoEnv } from "@/lib/reservations/tableo";
import { cn } from "@/lib/utils";
import { errText, VENUE_KEYS, VENUE_NAMES } from "./reservations-shared";

/**
 * Tableo link of a venue: token, webhook, sending bookings made here,
 * and which Tableo table is which POS table.
 */

type Status = NonNullable<FunctionReturnType<typeof api.tableo.status>>;

const STATE: Record<string, { label: string; tone: string }> = {
  active: {
    label: "Sincronizando",
    tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  connecting: {
    label: "Conectando…",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  error: { label: "Erro", tone: "bg-destructive/15 text-destructive" },
};

const when = (ts: number | null) =>
  ts
    ? new Date(ts).toLocaleString("pt-PT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

export function TableoSheet({
  company: initial,
  onClose,
}: {
  company: string;
  onClose: () => void;
}) {
  // Opened from "Todos os bares": pick the venue inside the sheet
  const [company, setCompany] = useState(
    initial === "all" ? (VENUE_KEYS[0] ?? "main") : initial
  );
  const data = useQuery(api.tableo.status, { company });
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-xl!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            <Icon className="size-5" name="IconArrowsRepeat" />
            Tableo · {VENUE_NAMES[company] ?? company}
          </SheetTitle>
          <SheetDescription>
            Reservas do Tableo em tempo real nas Reservas e nas mesas do POS
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap gap-1.5 border-b px-5 py-3">
          {VENUE_KEYS.map((k) => (
            <button
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                company === k
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted"
              )}
              key={k}
              onClick={() => setCompany(k)}
              type="button"
            >
              {VENUE_NAMES[k]}
            </button>
          ))}
        </div>
        {data === undefined ? (
          <p className="p-5 text-muted-foreground text-sm">Carregando…</p>
        ) : null}
        {data === null ? (
          <p className="p-5 text-muted-foreground text-sm">
            Entre com o código do painel.
          </p>
        ) : null}
        {data ? (
          <div className="flex flex-col gap-5 p-5" key={company}>
            {data.link ? <Linked company={company} data={data} /> : null}
            <Connect company={company} linked={Boolean(data.link)} />
            {data.link ? <Activity data={data} /> : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Connect({ company, linked }: { company: string; linked: boolean }) {
  const connect = useMutation(api.tableo.connect);
  const [open, setOpen] = useState(!linked);
  const [env, setEnv] = useState<TableoEnv>("production");
  const [token, setToken] = useState("");
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button
        className="self-start"
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
      >
        <Icon className="size-4" name="IconKey1" />
        Trocar token
      </Button>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await connect({ company, env, token, push });
      setToken("");
      setOpen(false);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm">
      <p className="font-medium">
        {linked ? "Novo token" : "Conectar ao Tableo"}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-xs">
        <li>
          No Tableo: <b>Restaurant Settings → API Integration</b> → gerar token
          (plano Expand, ou Grow + add-on API).
        </li>
        <li>Cole o token aqui. Ele fica só no servidor, nunca no navegador.</li>
        <li>
          O app confere o token, lê as áreas e mesas, registra o webhook e traz
          as reservas dos próximos 60 dias.
        </li>
      </ol>
      <div className="flex gap-1.5">
        {(Object.keys(TABLEO_ENVS) as TableoEnv[]).map((k) => (
          <button
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              env === k ? "border-foreground bg-foreground text-background" : ""
            )}
            key={k}
            onClick={() => setEnv(k)}
            type="button"
          >
            {TABLEO_ENVS[k].label}
          </button>
        ))}
      </div>
      <Input
        autoComplete="off"
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token da API do Tableo"
        type="password"
        value={token}
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          checked={push}
          onChange={(e) => setPush(e.target.checked)}
          type="checkbox"
        />
        Enviar ao Tableo as reservas feitas aqui e no POS
      </label>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          disabled={busy || token.trim().length < 20}
          onClick={save}
          size="sm"
        >
          {busy ? "Conectando…" : "Conectar"}
        </Button>
        {linked ? (
          <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
            Cancelar
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Linked({ company, data }: { company: string; data: Status }) {
  const link = data.link;
  const syncNow = useMutation(api.tableo.syncNow);
  const test = useMutation(api.tableo.testWebhook);
  const disconnect = useMutation(api.tableo.disconnect);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  if (!link) {
    return null;
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
  };
  const state = STATE[link.state] ?? STATE.error;
  const tables = link.areas.reduce((n, a) => n + a.tables.length, 0);
  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {link.restaurantName ?? "Restaurante Tableo"}
            </p>
            <p className="text-muted-foreground text-xs">
              {TABLEO_ENVS[link.env]?.label ?? link.env} · token …
              {link.tokenEnd}
              {link.timezone ? ` · ${link.timezone}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs",
              state?.tone
            )}
          >
            {state?.label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Áreas · mesas"
            value={`${link.areas.length} · ${tables}`}
          />
          <Stat label="Reservas futuras" value={String(data.upcoming)} />
          <Stat label="Último evento" value={when(link.lastEvent)} />
          <Stat label="Última leitura" value={when(link.lastPull)} />
        </div>
        <p className="flex items-center gap-1.5 text-xs">
          <Icon
            className={cn(
              "size-4",
              link.webhook ? "text-emerald-600" : "text-muted-foreground"
            )}
            name={link.webhook ? "IconCheckmark1" : "IconClock"}
          />
          {link.webhook
            ? "Webhook ativo: novas reservas, mudanças, cancelamentos e chegadas chegam na hora."
            : "Webhook ainda não registrado."}
        </p>
        {link.lastError ? (
          <p className="rounded-xl bg-destructive/10 p-2 text-destructive text-xs">
            {link.lastError}
          </p>
        ) : null}
        {data.failed ? (
          <p className="text-amber-700 text-xs dark:text-amber-300">
            {data.failed} reserva(s) não foram enviadas ao Tableo — veja o
            cartão da reserva para tentar de novo.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run(() => syncNow({ company }))}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconArrowsRepeat" />
            Sincronizar agora
          </Button>
          <Button
            disabled={!link.webhook}
            onClick={() => run(() => test({ company }))}
            size="sm"
            variant="outline"
          >
            Testar webhook
          </Button>
          <Button
            onClick={() => {
              if (sure) {
                run(() => disconnect({ company }));
              } else {
                setSure(true);
              }
            }}
            size="sm"
            variant={sure ? "destructive" : "ghost"}
          >
            {sure ? "Confirmar: desligar (reservas ficam)" : "Desconectar"}
          </Button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </section>
      <Mapping
        company={company}
        data={data}
        key={JSON.stringify(link.tableMap) + link.push}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate font-medium text-xs tabular-nums">{value}</p>
    </div>
  );
}

function Mapping({ company, data }: { company: string; data: Status }) {
  const link = data.link;
  const save = useMutation(api.tableo.saveOptions);
  const [map, setMap] = useState<Record<string, string>>(link?.tableMap ?? {});
  const [push, setPush] = useState(link?.push ?? true);
  const [area, setArea] = useState<number | null>(link?.defaultArea ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!link) {
    return null;
  }
  const used = new Set(Object.values(map));
  const linkedCount = Object.keys(map).length;
  const all = link.areas.reduce((n, a) => n + a.tables.length, 0);
  const submit = async () => {
    setMsg(null);
    try {
      await save({
        company,
        push,
        tableMap: map,
        defaultArea: area ?? undefined,
      });
      setMsg("Salvo.");
    } catch (e) {
      setMsg(errText(e));
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm">
      <div>
        <p className="font-medium">Mesas Tableo → mesas do POS</p>
        <p className="text-muted-foreground text-xs">
          {linkedCount} de {all} ligadas (pelo nome, ajuste se precisar). Uma
          reserva do Tableo aparece na mesa ligada do POS; mudar a mesa aqui ou
          no POS muda no Tableo.
        </p>
      </div>
      {link.areas.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nenhuma área recebida ainda. Toque em Sincronizar agora.
        </p>
      ) : null}
      {link.areas.map((a) => (
        <div className="flex flex-col gap-1.5" key={a.id}>
          <p className="font-medium text-xs">{a.name}</p>
          {a.tables.map((t) => {
            const cur = map[String(t.id)] ?? "";
            return (
              <div className="flex items-center gap-2" key={t.id}>
                <span className="w-24 shrink-0 truncate text-xs">
                  {t.name}{" "}
                  <span className="text-muted-foreground">
                    {t.min}–{t.max}p
                  </span>
                </span>
                <Icon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  name="IconArrowRight"
                />
                <select
                  className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs"
                  onChange={(e) => {
                    const next = { ...map };
                    if (e.target.value) {
                      next[String(t.id)] = e.target.value;
                    } else {
                      delete next[String(t.id)];
                    }
                    setMap(next);
                  }}
                  value={cur}
                >
                  <option value="">— sem mesa no POS —</option>
                  {data.posTables.map((p) => (
                    <option
                      disabled={used.has(p.id) && p.id !== cur}
                      key={p.id}
                      value={p.id}
                    >
                      {p.area} · {p.name} ({p.seats}p)
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      ))}
      {link.areas.length ? (
        <label className="flex flex-col gap-1 text-xs">
          Área do Tableo para reservas sem mesa
          <select
            className="h-8 rounded-md border bg-transparent px-2"
            onChange={(e) => setArea(Number(e.target.value))}
            value={area ?? ""}
          >
            {link.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-xs">
        <input
          checked={push}
          onChange={(e) => setPush(e.target.checked)}
          type="checkbox"
        />
        Enviar ao Tableo as reservas feitas aqui e no POS (criar, editar,
        cancelar, chegada, no-show)
      </label>
      <div className="flex items-center gap-2">
        <Button onClick={submit} size="sm">
          Salvar
        </Button>
        {msg ? (
          <span className="text-muted-foreground text-xs">{msg}</span>
        ) : null}
      </div>
    </section>
  );
}

function Activity({ data }: { data: Status }) {
  if (!data.events.length) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2 text-sm">
      <p className="font-medium">Atividade</p>
      <ul className="flex flex-col gap-1">
        {data.events.map((e) => (
          <li className="flex items-start gap-2 text-xs" key={e.id}>
            <span
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                e.ok ? "bg-emerald-500" : "bg-destructive"
              )}
            />
            <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
              {when(e.at)}
            </span>
            <span className="min-w-0 break-words">
              <b className="font-medium">{e.kind}</b>
              {e.note ? ` · ${e.note}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
