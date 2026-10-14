"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlock } from "@/lib/code/client";
import { Icon } from "@/lib/icons";
import { refreshSyncAuth, useSyncStatus } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/**
 * Pages whose data lives in Convex need the panel's access code once per
 * device. This asks for it right where the data would be; once accepted the
 * Convex client signs in again and the page's queries load by themselves.
 * When the database still refuses (its settings point to another address),
 * it says exactly what to set instead of failing silently.
 */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;
const WAIT_MS = 8000;

interface Check {
  configured: boolean;
  issuer: string | null;
  unlocked: boolean;
}

type Phase = "idle" | "checking" | "refused";

function Refused({ check }: { check: Check | null }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (check && !check.configured) {
    return (
      <p className="text-left text-sm">
        O código está certo, mas <b>este endereço</b> ({origin}) não tem a chave
        do banco configurada. No projeto da Vercel (ou Cloudflare) deste
        endereço, defina <code>PANEL_JWT_PRIVATE_KEY</code> e{" "}
        <code>PANEL_AUTH_ISSUER</code> como no projeto que funciona e faça o
        Redeploy.
      </p>
    );
  }
  const issuer = check?.issuer ?? origin;
  return (
    <div className="flex flex-col gap-2 text-left text-sm">
      <p>
        O código está certo, mas o <b>banco (Convex) recusou a chave</b> deste
        endereço. No painel do Convex → Settings → Environment Variables, use:
      </p>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-xs">
        {`PANEL_AUTH_ISSUER = ${issuer}\nPANEL_AUTH_JWKS_URL = ${issuer}/api/convex/jwks/`}
      </pre>
      <p className="text-muted-foreground text-xs">
        Endereço aberto agora: {origin}. Se você usa mais de um endereço (Vercel
        e Cloudflare), todos precisam da mesma{" "}
        <code>PANEL_JWT_PRIVATE_KEY</code> e do mesmo{" "}
        <code>PANEL_AUTH_ISSUER</code>.
      </p>
    </div>
  );
}

export function PanelUnlock({
  what,
  className,
}: {
  /** What the code unlocks, e.g. "usar o Telegram". */
  what: string;
  className?: string;
}) {
  const sync = useSyncStatus();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [check, setCheck] = useState<Check | null>(null);

  // After the code: give Convex a few seconds to accept the new token
  useEffect(() => {
    if (phase !== "checking") {
      return;
    }
    if (sync === "synced") {
      setPhase("idle");
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`${API}/convex/check/`, {
        cache: "no-store",
      }).catch(() => null);
      setCheck(res?.ok ? ((await res.json()) as Check) : null);
      setPhase("refused");
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [phase, sync]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCheck(null);
    setPhase("checking");
    if (await unlock(code)) {
      refreshSyncAuth();
      setCode("");
    } else {
      setPhase("idle");
      setError("Código incorreto.");
    }
  };

  return (
    <form
      className={cn(
        "mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-5 text-center",
        className
      )}
      onSubmit={submit}
    >
      <Icon className="mx-auto size-8" name="IconShieldCheck" />
      <div>
        <p className="font-semibold text-lg">Liberar este aparelho</p>
        <p className="text-muted-foreground text-sm">
          Digite o código de acesso do painel (o mesmo do WhatsApp, POS e Code)
          para {what}. É só uma vez neste aparelho.
        </p>
      </div>
      <Input
        aria-label="Código de acesso"
        autoComplete="current-password"
        onChange={(e) => setCode(e.target.value)}
        placeholder="Código de acesso"
        type="password"
        value={code}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {phase === "refused" ? <Refused check={check} /> : null}
      <Button disabled={!code || phase === "checking"} type="submit">
        {phase === "checking" ? "Liberando…" : "Liberar"}
      </Button>
    </form>
  );
}
