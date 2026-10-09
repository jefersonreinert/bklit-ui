"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlock } from "@/lib/code/client";
import { Icon } from "@/lib/icons";
import { refreshSyncAuth } from "@/lib/sync/convex-client";

/** The panel's access code, once per device (news and browser use it). */
export function UnlockCard({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mx-auto flex w-full max-w-xs flex-col gap-3 py-16 text-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await unlock(code)) {
          refreshSyncAuth();
          onDone();
        } else {
          setError("Código incorreto.");
        }
      }}
    >
      <Icon className="mx-auto size-8" name="IconShieldCheck" />
      <p className="font-semibold text-lg">Liberar este aparelho</p>
      <p className="text-muted-foreground text-sm">
        Digite o código de acesso do painel.
      </p>
      <Input
        aria-label="Código de acesso"
        onChange={(e) => setCode(e.target.value)}
        type="password"
        value={code}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit">Liberar</Button>
    </form>
  );
}
