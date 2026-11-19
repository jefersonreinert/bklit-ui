"use client";

import { useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { BOTTLE_SIZES, nameWithSize, sizeLabel } from "@/lib/inventory/sizes";
import { cn } from "@/lib/utils";
import { NumberInput } from "./shared";

/**
 * "Duplicar com outro tamanho": pick a size (or type one) and the copy
 * is created with the size in its name and description.
 */
export function SizeCopy({
  name,
  current,
  what,
  onPick,
  onClose,
}: {
  name: string;
  /** Size of the original, in ml (left out of the choices). */
  current?: number;
  /** "item" or "produto", for the texts. */
  what: string;
  onPick: (ml: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const [ml, setMl] = useState<number | undefined>(
    current === 1000 ? 700 : 1000
  );
  const [busy, setBusy] = useState(false);
  const ok = ml !== undefined && ml > 0 && ml !== current;
  const create = async () => {
    if (!ok) {
      return;
    }
    setBusy(true);
    await onPick(ml);
    setBusy(false);
  };
  return (
    <FullPage
      footer={
        <Button
          className="h-12 w-full text-base"
          disabled={busy || !ok}
          onClick={create}
        >
          <Icon name="IconSquareBehindSquare1" size={18} />
          Criar {ok ? nameWithSize(name, ml) : `o ${what}`}
        </Button>
      }
      onClose={onClose}
      open
      subtitle={`Cria outro ${what} igual, com o tamanho no nome e na descrição. Código de barras e estoque começam vazios.`}
      title="Duplicar com outro tamanho"
    >
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <p className="text-muted-foreground text-sm">
          Original: <span className="font-medium text-foreground">{name}</span>
          {current ? ` · ${sizeLabel(current)}` : null}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BOTTLE_SIZES.filter((s) => s !== current).map((s) => (
            <button
              aria-pressed={ml === s}
              className={cn(
                "rounded-xl border px-3 py-3 font-medium text-sm tabular-nums",
                ml === s
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card"
              )}
              key={s}
              onClick={() => setMl(s)}
              type="button"
            >
              {sizeLabel(s)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span>Outro tamanho (ml)</span>
          <NumberInput onChange={setMl} placeholder="Ex.: 1750" value={ml} />
        </div>
        {ok ? (
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground text-xs">Novo {what}</p>
            <p className="font-medium">{nameWithSize(name, ml)}</p>
          </div>
        ) : null}
      </div>
    </FullPage>
  );
}
