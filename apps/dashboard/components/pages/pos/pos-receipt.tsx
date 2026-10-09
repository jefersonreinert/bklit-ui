"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import { pdfName, printReceipt, receiptPdf, sharePdf } from "@/lib/pos/print";
import { type ReceiptDoc, receiptDoc, renderReceipt } from "@/lib/pos/receipt";
import { getDevicePrefs, usePos } from "@/lib/pos/store";
import type { PosOrder, PrinterConfig, ReceiptSettings } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

/** Live image of the receipt (the same canvas that prints). */
export function ReceiptPreview({
  doc,
  settings,
  className,
}: {
  doc: ReceiptDoc;
  settings: ReceiptSettings;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify([doc, settings]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      renderReceipt(doc, settings, {
        width: settings.paper === "a4" ? 1240 : 576 * 1.5,
      })
        .then((c) => {
          if (alive) {
            setSrc(c.toDataURL("image/png"));
          }
        })
        .catch(() => null);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]);
  const width = { "58": 230, "80": 300, a4: 520 }[settings.paper];
  return (
    <div
      className={cn(
        "mx-auto w-full overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5",
        className
      )}
      style={{ maxWidth: width }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: data URL from a canvas
        <img
          alt="Pré-visualização do recibo"
          className="block h-auto w-full"
          height={1000}
          src={src}
          width={600}
        />
      ) : (
        <div className="flex aspect-[1/1.6] items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}

export function usePrintActions(doc: ReceiptDoc | null) {
  const { receipt } = usePos();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const r = await fn();
      if (r !== "cancelled") {
        setMessage({ ok: true, text: ok });
      }
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Falhou.",
      });
    } finally {
      setBusy(null);
    }
  };
  return {
    busy,
    message,
    print: (p: PrinterConfig) =>
      doc
        ? run(
            p.id,
            () => printReceipt(p, doc, receipt),
            p.kind === "epos" ? `Impresso em ${p.name}.` : "PDF enviado."
          )
        : undefined,
    pdf: () =>
      doc
        ? run(
            "pdf",
            async () => sharePdf(await receiptPdf(doc, receipt), pdfName(doc)),
            "PDF pronto."
          )
        : undefined,
  };
}

/** Prints on this device's automatic receipt printer, if one is chosen. */
export function autoPrint(
  doc: ReceiptDoc,
  printers: PrinterConfig[],
  receipt: ReceiptSettings
) {
  const id = getDevicePrefs().autoReceipt;
  const printer = printers.find((p) => p.id === id && p.kind === "epos");
  return printer ? printReceipt(printer, doc, receipt) : Promise.resolve(null);
}

export function PrintButtons({
  doc,
  onSettings,
}: {
  doc: ReceiptDoc;
  onSettings?: () => void;
}) {
  const printers = usePos().printers.filter((p) => p.receipts !== false);
  const { busy, message, print, pdf } = usePrintActions(doc);
  return (
    <div className="flex flex-col gap-2">
      {printers.map((p) => (
        <Button
          className="h-11 rounded-full"
          disabled={Boolean(busy)}
          key={p.id}
          onClick={() => print(p)}
        >
          {busy === p.id ? (
            <Spinner />
          ) : (
            <Icon className="size-4" name="IconPrinter" />
          )}
          Imprimir · {p.name}
        </Button>
      ))}
      <Button
        className="h-11 rounded-full"
        disabled={Boolean(busy)}
        onClick={pdf}
        variant={printers.length ? "outline" : "default"}
      >
        {busy === "pdf" ? (
          <Spinner />
        ) : (
          <Icon className="size-4" name="IconFileText" />
        )}
        PDF · compartilhar ou imprimir
      </Button>
      {printers.length === 0 && onSettings ? (
        <Button onClick={onSettings} variant="ghost">
          <Icon className="size-4" name="IconPlusSmall" />
          Adicionar impressora
        </Button>
      ) : null}
      {message ? (
        <p
          className={cn(
            "text-center text-sm",
            message.ok ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Receipt of an order: preview, print, PDF. */
export function ReceiptSheet({
  order,
  onClose,
  onSettings,
}: {
  order: PosOrder | null;
  onClose: () => void;
  onSettings?: () => void;
}) {
  const data = usePos();
  const doc = order ? receiptDoc(order, data) : null;
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(order)}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Recibo {order ? `nº ${order.number}` : ""}</SheetTitle>
        </SheetHeader>
        {doc ? (
          <div className="flex flex-col gap-5 bg-muted/40 p-5">
            <ReceiptPreview doc={doc} settings={data.receipt} />
            <PrintButtons doc={doc} onSettings={onSettings} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
