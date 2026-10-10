"use client";

import { useRef, useState } from "react";
import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import { Field } from "@/components/pages/beverages/wine-sheet";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import {
  addExtractedInvoice,
  findCompany,
  findDuplicate,
  invoiceStore,
  newCompany,
  saveCompany,
  useInvoices,
} from "@/lib/invoices/store";
import type { ExtractedInvoice } from "@/lib/invoices/types";
import { callExtract, type PreparedFile, prepareFile } from "@/lib/upload";

const AUTO = "auto";

/** Picks (or creates) the company the invoice was billed to. */
function resolveCompany(x: ExtractedInvoice, chosen: string) {
  const data = invoiceStore.get();
  const picked = data.companies.find((c) => c.id === chosen);
  if (picked) {
    return picked;
  }
  const found = findCompany(data, x.buyer);
  if (found) {
    return found;
  }
  const created = newCompany(x.buyer.name || "Minha empresa", x.buyer.taxId);
  saveCompany(created);
  return created;
}

/**
 * One invoice per upload (its pages as photos or a PDF). Claude reads the
 * header and lines; the lines are linked to known ingredients and the
 * invoice opens for review.
 */
export function UploadSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}) {
  const { companies } = useInvoices();
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [company, setCompany] = useState(AUTO);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = companies.find((c) => c.id === company);

  async function add(list: FileList | null) {
    if (!list?.length) {
      return;
    }
    setError(null);
    try {
      const prepared = await Promise.all([...list].map(prepareFile));
      setFiles((prev) => [...prev, ...prepared]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arquivo inválido.");
    }
  }

  async function run() {
    setBusy("A IA está lendo a nota… (até 1–2 minutos)");
    setError(null);
    try {
      const x = await callExtract<ExtractedInvoice>("invoice", files);
      const dup = findDuplicate(invoiceStore.get(), x);
      if (dup) {
        setError(
          `Esta nota (${x.number}, ${x.date}) já foi lançada. Abra-a na lista.`
        );
        return;
      }
      const co = resolveCompany(x, company);
      const loc =
        co.locations.find((l) => l.id === location)?.id ??
        co.locations[0]?.id ??
        "";
      const id = addExtractedInvoice(
        x,
        co.id,
        loc,
        files.map((f) => f.name).join(", ")
      );
      setFiles([]);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na leitura.");
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
          <SheetTitle>Lançar nota fiscal / invoice</SheetTitle>
          <SheetDescription>
            Fotografe ou envie o PDF. Uma nota por vez (todas as páginas dela).
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Empresa">
              <FilterSelect
                className="sm:w-full"
                items={[
                  { value: AUTO, label: "Detectar pela nota" },
                  ...companies.map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(v) => {
                  setCompany(v);
                  setLocation("");
                }}
                value={company}
              />
            </Field>
            <Field label="Local">
              <FilterSelect
                className="sm:w-full"
                items={
                  selected
                    ? selected.locations.map((l) => ({
                        value: l.id,
                        label: l.name,
                      }))
                    : [{ value: "", label: "Principal" }]
                }
                onChange={setLocation}
                value={location || selected?.locations[0]?.id || ""}
              />
            </Field>
          </div>

          <input
            accept="image/*,application/pdf"
            className="hidden"
            multiple
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={pickRef}
            type="file"
          />
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={cameraRef}
            type="file"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={Boolean(busy)}
              onClick={() => cameraRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCamera1" />
              Tirar foto
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => pickRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCloudUpload" />
              Fotos ou PDF
            </Button>
          </div>
          {files.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {files.map((f, i) => (
                <li
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  key={`${f.name}-${i}`}
                >
                  <Icon
                    className="size-4 shrink-0"
                    name={f.preview ? "IconImages1" : "IconFilePdf"}
                  />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button
                    aria-label="Remover"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    type="button"
                  >
                    <Icon className="size-4" name="IconCrossSmall" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button disabled={!files.length || Boolean(busy)} onClick={run}>
            <Icon
              className="size-4"
              name={busy ? "IconLoader" : "IconSparklesSoft"}
            />
            {busy ?? "Ler com IA"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
