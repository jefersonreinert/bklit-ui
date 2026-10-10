"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { Field } from "@/components/pages/beverages/wine-sheet";
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
import { cn } from "@/lib/utils";

export interface KeysInfo {
  x: boolean;
  grok: boolean;
  xSource: "env" | "panel" | null;
  grokSource: "env" | "panel" | null;
  xHint: string | null;
  grokHint: string | null;
  model: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
}

function Saved({
  on,
  hint,
  source,
}: {
  on: boolean;
  hint: string | null;
  source: string | null;
}) {
  if (!on) {
    return <span className="text-destructive text-xs">Não configurada</span>;
  }
  return (
    <span className="text-success text-xs">
      Guardada {hint} {source === "env" ? "(variável do Convex)" : ""}
    </span>
  );
}

function Result({ label, r }: { label: string; r: TestResult }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        r.ok
          ? "border-success/40 bg-success/10"
          : "border-destructive/40 bg-destructive/10"
      )}
    >
      <span className="font-medium">
        {r.ok ? "✓" : "✗"} {label}:
      </span>{" "}
      {r.message}
    </div>
  );
}

/**
 * Paste the X and xAI keys from the phone. They go to the server only
 * (Convex), are never sent back to the browser, and can be tested here.
 */
export function IctKeysSheet({
  open,
  onClose,
  info,
}: {
  open: boolean;
  onClose: () => void;
  info: KeysInfo;
}) {
  const save = useAction(api.ict.saveKeys);
  const test = useAction(api.ict.testKeys);
  const [xBearer, setXBearer] = useState("");
  const [xApiKey, setXApiKey] = useState("");
  const [xApiSecret, setXApiSecret] = useState("");
  const [xaiKey, setXaiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<TestResult | null>(null);
  const [results, setResults] = useState<{
    x: TestResult;
    grok: TestResult;
  } | null>(null);

  const hasInput = Boolean(xBearer || (xApiKey && xApiSecret) || xaiKey);

  async function onSave() {
    setBusy("A guardar…");
    setMessage(null);
    setResults(null);
    try {
      const r = await save({
        xBearer: xBearer || undefined,
        xApiKey: xApiKey || undefined,
        xApiSecret: xApiSecret || undefined,
        xaiKey: xaiKey || undefined,
      });
      setMessage(r);
      if (r.ok) {
        setXBearer("");
        setXApiKey("");
        setXApiSecret("");
        setXaiKey("");
        setBusy("A testar…");
        setResults(await test({}));
      }
    } catch (err) {
      setMessage({
        ok: false,
        message: err instanceof Error ? err.message : "Falhou.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("A testar…");
    setResults(null);
    try {
      setResults(await test({}));
    } catch (err) {
      setMessage({
        ok: false,
        message: err instanceof Error ? err.message : "Falhou.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      onOpenChange={(o) => {
        if (!(o || busy)) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Chaves das APIs</SheetTitle>
          <SheetDescription>
            Ficam guardadas só no servidor (Convex) e nunca voltam a aparecer no
            navegador. Deixe em branco o que não quer mudar.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-3 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">API do X (recolha)</p>
              <Saved hint={info.xHint} on={info.x} source={info.xSource} />
            </div>
            <Field label="Bearer Token (developer.x.com → app → Keys and tokens)">
              <Input
                autoComplete="off"
                onChange={(e) => setXBearer(e.target.value)}
                placeholder="AAAAAAAAAAAAAAAAAAAAA…"
                type="password"
                value={xBearer}
              />
            </Field>
            <p className="text-muted-foreground text-xs">
              Ou, se só tiver a API Key e a API Key Secret da app:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="API Key"
                autoComplete="off"
                onChange={(e) => setXApiKey(e.target.value)}
                placeholder="API Key"
                type="password"
                value={xApiKey}
              />
              <Input
                aria-label="API Key Secret"
                autoComplete="off"
                onChange={(e) => setXApiSecret(e.target.value)}
                placeholder="API Key Secret"
                type="password"
                value={xApiSecret}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">xAI / Grok (análise)</p>
              <Saved
                hint={info.grokHint}
                on={info.grok}
                source={info.grokSource}
              />
            </div>
            <Field label="API key (console.x.ai → API Keys, começa por xai-)">
              <Input
                autoComplete="off"
                onChange={(e) => setXaiKey(e.target.value)}
                placeholder="xai-…"
                type="password"
                value={xaiKey}
              />
            </Field>
          </div>

          {message ? <Result label="Guardar" r={message} /> : null}
          {results ? (
            <div className="flex flex-col gap-2">
              <Result label="API do X" r={results.x} />
              <Result label="Grok" r={results.grok} />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!hasInput || Boolean(busy)} onClick={onSave}>
              <Icon
                className="size-4"
                name={busy ? "IconLoader" : "IconLock"}
              />
              {busy ?? "Guardar e testar"}
            </Button>
            <Button
              disabled={Boolean(busy) || !(info.x || info.grok)}
              onClick={onTest}
              variant="outline"
            >
              <Icon className="size-4" name="IconShieldCheck" />
              Testar ligação
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            O teste faz um pedido real a cada API (ler a conta do ICT e 5
            publicações; uma resposta de 1 palavra do Grok).
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
