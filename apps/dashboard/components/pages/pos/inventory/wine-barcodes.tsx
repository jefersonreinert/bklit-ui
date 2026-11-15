"use client";

import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { getSession, sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "../scan/barcode-scanner";
import { CARD, num, Pill, Tag } from "./shared";

/**
 * Barcodes of the dispenser wines: an agent looks each wine up (Open Food
 * Facts and the web) and brings the code with its source; a person
 * accepts it — or scans the bottle. Accepting puts the code on the wine's
 * stock item (created when missing) and links the dispenser wine to it.
 */

type Row = FunctionReturnType<typeof api.barcodes.context>[number];
type Filter = "review" | "missing" | "done" | "all";

const BATCH = 5;

export function WineBarcodes({ onClose }: { onClose: () => void }) {
  const company = useCompany();
  const rows = usePosQuery(api.barcodes.context, { company });
  const [filter, setFilter] = useState<Filter>("review");
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [usage, setUsage] = useState({ searches: 0, tokens: 0 });
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<Row | null>(null);
  const stop = useRef(false);

  const hasCode = (r: Row) => r.barcodes.length > 0 || r.find?.status === "accepted";
  const toReview = (rows ?? []).filter((r) => !hasCode(r) && r.find?.status === "found");
  const missing = (rows ?? []).filter((r) => !hasCode(r) && r.find?.status !== "found");
  const shown = (rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "review" ? toReview.includes(r) : filter === "missing" ? missing.includes(r) : hasCode(r)
  );

  const search = async (retry: boolean) => {
    const todo = (rows ?? []).filter((r) => !hasCode(r) && (retry ? r.find?.status !== "found" : !r.find));
    if (!todo.length) {
      return;
    }
    stop.current = false;
    setError(null);
    setRunning({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length && !stop.current; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      try {
        const res = await fetch(`${BASE_PATH}/api/inv/barcodes`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-pos-session": getSession() ?? "" },
          body: JSON.stringify({ company, skus: batch.map((r) => r.sku) }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error ?? "A busca falhou.");
        }
        setUsage((u) => ({
          searches: u.searches + (body.searches ?? 0),
          tokens: u.tokens + (body.inputTokens ?? 0) + (body.outputTokens ?? 0),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "A busca falhou.");
        break;
      }
      setRunning({ done: Math.min(todo.length, i + BATCH), total: todo.length });
    }
    setRunning(null);
  };

  const accept = (r: Row, gtin: string, scanned = false) =>
    sendPos(api.barcodes.accept, { company, sku: r.sku, gtin, scanned });
  const acceptSure = async () => {
    for (const r of toReview.filter((x) => (x.find?.confidence ?? 0) >= 0.9 && x.find?.gtin)) {
      await accept(r, r.find?.gtin ?? "");
    }
  };
  const sure = toReview.filter((x) => (x.find?.confidence ?? 0) >= 0.9).length;

  return (
    <FullPage
      onClose={onClose}
      open
      subtitle="O agente procura o código (GTIN/EAN) de cada vinho das máquinas e traz a fonte. Você aprova ou escaneia a garrafa."
      title="Códigos de barras dos vinhos das máquinas"
    >
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {rows === undefined ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            <div className={cn(CARD, "space-y-3")}>
              <p className="text-sm">
                {rows?.length ?? 0} vinhos · {(rows ?? []).filter(hasCode).length} com código · {toReview.length} para
                aprovar · {missing.length} sem código
              </p>
              <div className="flex flex-wrap gap-2">
                {running ? (
                  <>
                    <span className="flex items-center gap-2 text-sm">
                      <Spinner /> Procurando… {running.done} de {running.total}
                    </span>
                    <Button onClick={() => (stop.current = true)} size="sm" variant="outline">
                      Parar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button disabled={!(rows ?? []).some((r) => !hasCode(r) && !r.find)} onClick={() => search(false)}>
                      Procurar códigos ({(rows ?? []).filter((r) => !hasCode(r) && !r.find).length})
                    </Button>
                    {missing.some((r) => r.find) ? (
                      <Button onClick={() => search(true)} variant="outline">
                        Procurar de novo os não encontrados
                      </Button>
                    ) : null}
                    {sure ? (
                      <Button onClick={acceptSure} variant="outline">
                        Aceitar os {sure} com 90% ou mais
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
              {usage.searches || usage.tokens ? (
                <p className="text-muted-foreground text-xs">
                  Nesta busca: {usage.searches} pesquisas na web · {num(usage.tokens / 1000, 0)} mil tokens
                </p>
              ) : null}
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <p className="text-muted-foreground text-xs">
                Cada lote de {BATCH} vinhos leva cerca de 1 minuto. Deixe esta tela aberta; pode parar e continuar
                depois. O scanner continua funcionando normalmente em Itens e na Contagem.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={filter === "review"} onClick={() => setFilter("review")}>
                Para aprovar ({toReview.length})
              </Pill>
              <Pill active={filter === "missing"} onClick={() => setFilter("missing")}>
                Sem código ({missing.length})
              </Pill>
              <Pill active={filter === "done"} onClick={() => setFilter("done")}>
                Com código
              </Pill>
              <Pill active={filter === "all"} onClick={() => setFilter("all")}>
                Todos
              </Pill>
            </div>

            <ul className="divide-y rounded-2xl border bg-card">
              {shown.map((r) => (
                <WineRow accept={accept} key={r.sku} onScan={() => setScanning(r)} row={r} />
              ))}
              {shown.length ? null : <li className="px-4 py-6 text-center text-muted-foreground text-sm">Nada aqui.</li>}
            </ul>
          </>
        )}
      </div>
      <BarcodeScanner
        onClose={() => setScanning(null)}
        onCode={(c) => {
          const r = scanning;
          setScanning(null);
          if (r) {
            void accept(r, c.code, true);
          }
        }}
        open={scanning !== null}
        title={scanning ? `Escanear ${scanning.wine}` : "Escanear"}
      />
    </FullPage>
  );
}

function WineRow({
  row: r,
  accept,
  onScan,
}: {
  row: Row;
  accept: (r: Row, gtin: string, scanned?: boolean) => Promise<unknown>;
  onScan: () => void;
}) {
  const company = useCompany();
  const [typed, setTyped] = useState("");
  const done = r.barcodes.length > 0 || r.find?.status === "accepted";
  const f = r.find;
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{r.wine}</p>
          <p className="text-muted-foreground text-xs">
            {[r.grape, r.origin, r.vintage, `${r.volumeMl} ml`].filter(Boolean).join(" · ")}
          </p>
          <p className="text-muted-foreground text-xs">
            {r.itemName ? `Item: ${r.itemName}${r.linked ? "" : " (será ligado)"}` : "Item novo será criado ao aceitar"}
          </p>
        </div>
        {done ? <Tag tone="muted">{r.barcodes.join(", ") || f?.gtin}</Tag> : null}
      </div>
      {!done && f ? (
        <div className={cn("rounded-xl border px-3 py-2 text-sm", f.status === "found" ? "border-emerald-500/40" : "border-border")}>
          {f.gtin ? (
            <p>
              <span className="font-medium tabular-nums">{f.gtin}</span>{" "}
              <Tag tone={f.confidence >= 0.9 ? "muted" : "warn"}>{Math.round(f.confidence * 100)}%</Tag>
            </p>
          ) : (
            <p className="text-muted-foreground">{f.status === "rejected" ? "Rejeitado" : "Não encontrado"}</p>
          )}
          {f.note ? <p className="text-muted-foreground text-xs">{f.note}</p> : null}
          {f.source ? (
            <a className="block truncate text-xs underline" href={f.source} rel="noreferrer" target="_blank">
              {f.source}
            </a>
          ) : null}
        </div>
      ) : null}
      {done ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {f?.gtin && f.status === "found" ? (
            <>
              <Button onClick={() => accept(r, f.gtin ?? "")} size="sm">
                Aceitar
              </Button>
              <Button onClick={() => sendPos(api.barcodes.reject, { company, sku: r.sku })} size="sm" variant="outline">
                Rejeitar
              </Button>
            </>
          ) : null}
          <Button onClick={onScan} size="sm" variant="outline">
            Escanear a garrafa
          </Button>
          <Input
            className="h-8 w-40"
            inputMode="numeric"
            onChange={(e) => setTyped(e.target.value)}
            placeholder="ou digite o código"
            value={typed}
          />
          {typed.trim() ? (
            <Button onClick={() => accept(r, typed.trim(), true).then(() => setTyped(""))} size="sm" variant="outline">
              Salvar
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
