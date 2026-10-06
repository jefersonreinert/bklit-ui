"use client";

import { Icon } from "@bklitui/icons";
import { type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  type ImportOutcome,
  importStatement,
} from "@/lib/personal-finance/store";
import { cn } from "@/lib/utils";

const ACCEPT = ".csv,.pdf,text/csv,application/pdf";

/** Imports statements one by one; returns the outcomes for the notice. */
export function useStatementImport() {
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const run = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])];
    if (list.length === 0) {
      return;
    }
    setBusy(true);
    const results: ImportOutcome[] = [];
    for (const file of list) {
      results.push(await importStatement(file));
    }
    setOutcomes(results);
    setBusy(false);
  };
  return { busy, outcomes, run, dismiss: () => setOutcomes([]) };
}

export type StatementImport = ReturnType<typeof useStatementImport>;

export function ImportButton({ importer }: { importer: StatementImport }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        accept={ACCEPT}
        className="hidden"
        multiple
        onChange={(e) => {
          importer.run(e.target.files);
          e.target.value = "";
        }}
        ref={input}
        type="file"
      />
      <Button disabled={importer.busy} onClick={() => input.current?.click()}>
        {importer.busy ? (
          <Spinner className="size-4" />
        ) : (
          <Icon className="size-4" name="IconCloudUpload" />
        )}
        Importar extrato
      </Button>
    </>
  );
}

/** Large drop area shown before the first import. */
export function Dropzone({ importer }: { importer: StatementImport }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    importer.run(e.dataTransfer.files);
  };
  return (
    <Card
      className={cn(
        "border-2 border-dashed transition-colors",
        over && "border-primary bg-primary/5"
      )}
      onDragLeave={() => setOver(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDrop={onDrop}
    >
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          {importer.busy ? (
            <Spinner className="size-6" />
          ) : (
            <Icon className="size-7" name="IconReceiptBill" />
          )}
        </span>
        <div className="flex max-w-md flex-col gap-1">
          <p className="font-semibold text-lg tracking-tight">
            {importer.busy ? "Lendo o extrato…" : "Envie seu extrato bancário"}
          </p>
          <p className="text-muted-foreground text-sm">
            Arraste aqui ou escolha um arquivo <b>PDF</b> ou <b>CSV</b>{" "}
            (Revolut, Nubank, Inter e outros). O dashboard é montado
            automaticamente.
          </p>
        </div>
        <input
          accept={ACCEPT}
          className="hidden"
          multiple
          onChange={(e) => {
            importer.run(e.target.files);
            e.target.value = "";
          }}
          ref={input}
          type="file"
        />
        <Button
          disabled={importer.busy}
          onClick={() => input.current?.click()}
          size="lg"
        >
          <Icon className="size-4" name="IconCloudUpload" />
          Escolher arquivo
        </Button>
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Icon className="size-3.5" name="IconLock" />
          Os dados ficam só neste aparelho — nada é enviado para servidores.
        </p>
      </CardContent>
    </Card>
  );
}

export function ImportNotice({ importer }: { importer: StatementImport }) {
  if (importer.outcomes.length === 0) {
    return null;
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0" name="IconReceiptCheck" />
      <ul className="flex flex-1 flex-col gap-0.5">
        {importer.outcomes.map((o) => (
          <li key={o.name}>
            <span className="font-medium">{o.name}</span>
            {": "}
            {o.error ? (
              <span className="text-destructive">{o.error}</span>
            ) : (
              <span className="text-muted-foreground">
                {o.added} transações novas
                {o.duplicates > 0 ? ` · ${o.duplicates} já importadas` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button
        aria-label="Fechar"
        className="text-muted-foreground hover:text-foreground"
        onClick={importer.dismiss}
        type="button"
      >
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}
