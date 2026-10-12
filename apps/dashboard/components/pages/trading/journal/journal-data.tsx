"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Journal data controls. The journal only shows what the EA sends from
 * MT5; these remove fictitious trades left by older versions of the panel
 * or wipe the journal database (the EA then re-sends the real history).
 */

type Busy = null | "demo" | "all";

const MAX_ROUNDS = 200;

function useJournalData() {
  const hasDemo = useQuery(api.journal.hasDemo, {}) ?? false;
  const clear = useMutation(api.journal.clearJournal);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");

  const run = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setMessage("");
    try {
      // Big journals are cleared in batches
      for (let i = 0; i < MAX_ROUNDS; i++) {
        const { done } = await clear({ scope: kind });
        if (done) {
          break;
        }
      }
      setMessage(
        kind === "demo"
          ? "Dados fictícios removidos."
          : "Diário limpo: todas as operações, notas e alertas foram apagados."
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falhou. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  return { hasDemo, busy, message, run };
}

/** Two-tap destructive button (no browser confirm dialogs). */
function ConfirmButton({
  label,
  armedLabel,
  onConfirm,
  disabled,
  size = "sm",
}: {
  label: string;
  armedLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "xs";
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onMouseLeave={() => setArmed(false)}
      size={size}
      variant={armed ? "destructive" : "outline"}
    >
      <Icon className="size-3.5" name="IconTrashCan" />
      {armed ? armedLabel : label}
    </Button>
  );
}

/** Warning while fictitious data of older versions is still stored. */
export function JournalDemoNotice() {
  const { hasDemo, busy, run } = useJournalData();
  if (!hasDemo) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border border-[var(--down)] border-dashed p-2 text-xs">
      <span className="text-[var(--down)]">
        Há operações fictícias (conta DEMO) guardadas de uma versão anterior.
        Elas não vêm do seu MT5.
      </span>
      <ConfirmButton
        armedLabel="Toque de novo para remover"
        disabled={busy !== null}
        label={busy === "demo" ? "Removendo…" : "Remover fictícios"}
        onConfirm={() => run("demo")}
        size="xs"
      />
    </div>
  );
}

/** Full section (Conector tab and the empty journal). */
export function JournalData({ className }: { className?: string }) {
  const { hasDemo, busy, message, run } = useJournalData();
  return (
    <section
      className={cn("flex flex-col gap-3 rounded-xl border p-3", className)}
    >
      <div>
        <p className="font-medium text-sm">Banco de dados do diário</p>
        <p className="text-muted-foreground text-xs">
          O diário mostra só o que o EA envia do seu MT5. “Limpar tudo” apaga
          todas as operações, depósitos, notas e alertas; o token e os URLs
          continuam os mesmos. Para voltar a carregar o histórico real, remova e
          volte a anexar o EA no gráfico: ele reenvia tudo e o painel ignora o
          que já tiver.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {hasDemo ? (
          <ConfirmButton
            armedLabel="Toque de novo: remove só a conta DEMO"
            disabled={busy !== null}
            label={busy === "demo" ? "Removendo…" : "Remover fictícios"}
            onConfirm={() => run("demo")}
          />
        ) : null}
        <ConfirmButton
          armedLabel="Toque de novo: apaga TODAS as operações"
          disabled={busy !== null}
          label={busy === "all" ? "Limpando…" : "Limpar tudo"}
          onConfirm={() => run("all")}
        />
      </div>
      {message ? (
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {message}
        </p>
      ) : null}
    </section>
  );
}
