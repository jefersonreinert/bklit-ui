"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlock } from "@/lib/code/client";
import { Icon } from "@/lib/icons";
import { refreshSyncAuth } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/**
 * Pages whose data lives in Convex need the panel's access code once per
 * device. This asks for it right where the data would be; once accepted the
 * Convex client signs in again and the page's queries load by themselves.
 */
export function PanelUnlock({
  what,
  className,
}: {
  /** What the code unlocks, e.g. "usar o Telegram". */
  what: string;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await unlock(code);
    setBusy(false);
    if (ok) {
      refreshSyncAuth();
      setCode("");
    } else {
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
      <Button disabled={!code || busy} type="submit">
        {busy ? "Verificando…" : "Liberar"}
      </Button>
    </form>
  );
}
