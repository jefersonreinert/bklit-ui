"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Journal data controls: load fictitious trades to preview the charts,
 * remove them, or wipe every operation from the journal database.
 */

type Busy = null | "seed" | "demo" | "all";

const MAX_ROUNDS = 200;

function useJournalData() {
  const hasDemo = useQuery(api.journal.hasDemo, {}) ?? false;
  const seed = useMutation(api.journal.seedDemo);
  const clear = useMutation(api.journal.clearJournal);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");

  const run = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setMessage("");
    try {
      if (kind === "seed") {
        const n = await seed({});
        setMessage(`${Math.round(n / 2)} operações fictícias carregadas.`);
        return;
      }
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

/** Header shortcut: load the demo, or a badge to remove it. */
export function JournalDemoToggle() {
  const { hasDemo, busy, run } = useJournalData();
  if (hasDemo) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-dashed px-2 py-0.5 text-muted-foreground text-xs">
          Dados fictícios
        </span>
        <ConfirmButton
          armedLabel="Toque de novo para remover"
          disabled={busy !== null}
          label={busy === "demo" ? "Removendo…" : "Remover"}
          onConfirm={() => run("demo")}
          size="xs"
        />
      </div>
    );
  }
  return (
    <Button
      disabled={busy !== null}
      onClick={() => run("seed")}
      size="xs"
      variant="outline"
    >
      <Icon className="size-3.5" name="IconSparklesSoft" />
      {busy === "seed" ? "Carregando…" : "Carregar dados fictícios"}
    </Button>
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
          Carregue cerca de 14 meses de operações fictícias (conta DEMO) para
          ver os gráficos cheios. Elas podem ser removidas sem tocar nas suas
          operações reais. “Limpar tudo” apaga todas as operações, notas e
          alertas; o token e os URLs continuam os mesmos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => run("seed")} size="sm">
          <Icon className="size-3.5" name="IconSparklesSoft" />
          {busy === "seed" ? "Carregando…" : "Carregar dados fictícios"}
        </Button>
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
