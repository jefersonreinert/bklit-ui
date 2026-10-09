"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { imagePdf, printImage, sharePdf } from "@/lib/pos/print";
import { sendPos, usePos, usePosQuery } from "@/lib/pos/store";
import type { PrinterConfig } from "@/lib/pos/types";
import {
  renderVoucher,
  type VoucherInfo,
  voucherStatus,
  voucherValue,
} from "@/lib/pos/voucher";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { QrScanner } from "./pos-scanner";

type Voucher = VoucherInfo & {
  id: Id<"posVouchers">;
  createdAt: number;
  createdBy: string;
  redemptions: {
    orderNumber: number;
    amount: number;
    userName: string;
    at: number;
  }[];
};

const dateText = (t: number) =>
  new Date(t).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

function useVoucherPrint() {
  const { printers, receipt, settings } = usePos();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const render = (v: VoucherInfo) => (width: number) =>
    renderVoucher(v, {
      business: receipt.businessName,
      currency: settings.currency,
      width,
    });
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      setMsg("Enviado.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(null);
    }
  };
  return {
    busy,
    msg,
    printers: printers.filter((p) => p.receipts !== false),
    print: (p: PrinterConfig, list: VoucherInfo[]) =>
      run(p.id, async () => {
        for (const v of list) {
          await printImage(p, render(v), `voucher-${v.code}`);
        }
      }),
    pdf: (list: VoucherInfo[]) =>
      run("pdf", async () => {
        const { jsPDF } = await import("jspdf");
        if (list.length === 1 && list[0]) {
          const blob = await imagePdf(
            render(list[0])(576 * 2),
            80,
            `voucher-${list[0].code}`
          );
          await sharePdf(blob, `voucher-${list[0].code}.pdf`);
          return;
        }
        // Several: one per page
        const pdf = new jsPDF({ unit: "mm", format: [80, 130] });
        list.forEach((v, i) => {
          if (i) {
            pdf.addPage([80, 130]);
          }
          const c = render(v)(576 * 2);
          pdf.addImage(
            c.toDataURL("image/png"),
            "PNG",
            0,
            0,
            80,
            (c.height / c.width) * 80
          );
        });
        await sharePdf(pdf.output("blob"), "vouchers.pdf");
      }),
  };
}

function PrintRow({ list }: { list: VoucherInfo[] }) {
  const { busy, msg, printers, print, pdf } = useVoucherPrint();
  return (
    <div className="flex flex-col gap-2">
      {printers.map((p) => (
        <Button
          disabled={Boolean(busy)}
          key={p.id}
          onClick={() => print(p, list)}
        >
          {busy === p.id ? (
            <Spinner />
          ) : (
            <Icon className="size-4" name="IconPrinter" />
          )}
          Imprimir em {p.name}
        </Button>
      ))}
      <Button
        disabled={Boolean(busy)}
        onClick={() => pdf(list)}
        variant="outline"
      >
        {busy === "pdf" ? (
          <Spinner />
        ) : (
          <Icon className="size-4" name="IconFileText" />
        )}
        PDF · compartilhar ou imprimir
      </Button>
      {msg ? (
        <p className="text-center text-muted-foreground text-sm">{msg}</p>
      ) : null}
    </div>
  );
}

function VoucherImage({ v }: { v: VoucherInfo }) {
  const { receipt, settings } = usePos();
  const src = useMemo(
    () =>
      renderVoucher(v, {
        business: receipt.businessName,
        currency: settings.currency,
        width: 600,
      }).toDataURL(),
    [v, receipt.businessName, settings.currency]
  );
  return (
    // biome-ignore lint/performance/noImgElement: data URL from a canvas
    <img
      alt={`Voucher ${v.code}`}
      className="mx-auto w-full max-w-64 rounded-2xl bg-white shadow-md ring-1 ring-black/5"
      height={800}
      src={src}
      width={600}
    />
  );
}

function VoucherSheet({
  v,
  onClose,
}: {
  v: Voucher | null;
  onClose: () => void;
}) {
  const can = useCan();
  const cur = usePos().settings.currency;
  const status = v ? voucherStatus(v) : null;
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(v)}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{v?.label}</SheetTitle>
          <p
            className={cn(
              "text-sm",
              status?.ok ? "text-[#3d7a5f]" : "text-destructive"
            )}
          >
            {status?.label}
          </p>
        </SheetHeader>
        {v ? (
          <div className="flex flex-col gap-4 p-5">
            <VoucherImage v={v} />
            <PrintRow list={[v]} />
            {v.redemptions.length ? (
              <ul className="divide-y rounded-2xl border text-sm">
                {v.redemptions.map((r) => (
                  <li className="flex justify-between px-3 py-2" key={r.at}>
                    <span>
                      Pedido {r.orderNumber} · {r.userName}
                      <span className="block text-muted-foreground text-xs">
                        {dateText(r.at)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      −{voucherValue({ kind: "amount", value: r.amount }, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {can("settings") ? (
              <Button
                onClick={() =>
                  sendPos(api.vouchers.setActive, {
                    id: v.id,
                    active: !v.active,
                  })
                }
                variant="ghost"
              >
                {v.active ? "Desativar voucher" : "Reativar voucher"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CreateForm({ onCreated }: { onCreated: (codes: string[]) => void }) {
  const { settings } = usePos();
  const [kind, setKind] = useState<"amount" | "percent">("amount");
  const [value, setValue] = useState("10");
  const [label, setLabel] = useState("Cortesia");
  const [count, setCount] = useState("1");
  const [maxUses, setMaxUses] = useState("1");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(value.replace(",", "."));
  const create = async () => {
    setBusy(true);
    const codes = (await sendPos(api.vouchers.create, {
      kind,
      value: n,
      label,
      count: Number(count) || 1,
      maxUses: Number(maxUses) || 1,
      expiresAt: expires ? new Date(`${expires}T23:59:59`).getTime() : 0,
    })) as string[] | undefined;
    setBusy(false);
    if (codes) {
      onCreated(codes);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" name="IconGiftcard" />
        Criar vouchers
      </p>
      <div className="flex rounded-full bg-muted p-1">
        {(
          [
            ["amount", `Valor (${settings.currency})`],
            ["percent", "Porcentagem"],
          ] as const
        ).map(([id, text]) => (
          <button
            className={cn(
              "flex-1 rounded-full py-1.5 text-sm",
              kind === id ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
            key={id}
            onClick={() => setKind(id)}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1.5" htmlFor="pv-value">
          {kind === "percent" ? "Desconto (%)" : "Valor"}
          <Input
            id="pv-value"
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value)}
            value={value}
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="pv-label">
          Nome
          <Input
            id="pv-label"
            onChange={(e) => setLabel(e.target.value)}
            value={label}
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="pv-count">
          Quantos vouchers
          <Input
            id="pv-count"
            inputMode="numeric"
            onChange={(e) => setCount(e.target.value)}
            value={count}
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="pv-uses">
          Usos por voucher
          <Input
            id="pv-uses"
            inputMode="numeric"
            onChange={(e) => setMaxUses(e.target.value)}
            value={maxUses}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5" htmlFor="pv-exp">
          Válido até (opcional)
          <Input
            id="pv-exp"
            onChange={(e) => setExpires(e.target.value)}
            type="date"
            value={expires}
          />
        </label>
      </div>
      <Button
        className="h-11"
        disabled={busy || !(n > 0) || (kind === "percent" && n > 100)}
        onClick={create}
      >
        {busy ? <Spinner /> : <Icon className="size-4" name="IconQrCode" />}
        Gerar {Number(count) > 1 ? `${count} vouchers` : "voucher"}
      </Button>
    </div>
  );
}

function Checker() {
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [scanning, setScanning] = useState(false);
  const found = usePosQuery(api.vouchers.lookup, { code: code ?? "-" }) as
    | Voucher
    | null
    | undefined;
  const cur = usePos().settings.currency;
  const status = found ? voucherStatus(found) : null;
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" name="IconScanCode" />
        Verificar voucher
      </p>
      {scanning ? (
        <QrScanner
          onCode={(text) => {
            setCode(text);
            setScanning(false);
          }}
        />
      ) : (
        <Button onClick={() => setScanning(true)} variant="outline">
          <Icon className="size-4" name="IconCamera1" />
          Escanear com a câmera
        </Button>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setCode(typed);
        }}
      >
        <Input
          autoCapitalize="characters"
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ou digite o código"
          value={typed}
        />
        <Button type="submit" variant="outline">
          Ver
        </Button>
      </form>
      {code && found === null ? (
        <p className="text-destructive text-sm">Voucher não encontrado.</p>
      ) : null}
      {found ? (
        <div
          className={cn(
            "rounded-2xl p-3 text-sm",
            status?.ok ? "bg-[#3d7a5f]/10" : "bg-destructive/10"
          )}
        >
          <p className="font-semibold">
            {found.label} · {voucherValue(found, cur)}
          </p>
          <p className={status?.ok ? "text-[#3d7a5f]" : "text-destructive"}>
            {status?.label}
          </p>
          <p className="text-muted-foreground text-xs">
            Código {found.code} · usado {found.uses} de {found.maxUses}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function VouchersView() {
  const can = useCan();
  const list = usePosQuery(api.vouchers.list, {}) as
    | Voucher[]
    | null
    | undefined;
  const cur = usePos().settings.currency;
  const [open, setOpen] = useState<Voucher | null>(null);
  const [batch, setBatch] = useState<string[] | null>(null);
  const batchList = (list ?? []).filter((v) => batch?.includes(v.code));
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 pb-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        {can("settings") ? <CreateForm onCreated={setBatch} /> : null}
        <Checker />
      </div>
      <div className="flex flex-col gap-3">
        {batchList.length ? (
          <div className="flex flex-col gap-3 rounded-3xl border border-[#3d7a5f]/40 bg-[#3d7a5f]/5 p-4">
            <p className="font-semibold text-sm">
              {batchList.length} voucher(s) criado(s). Imprima agora:
            </p>
            <PrintRow list={batchList} />
            <Button onClick={() => setBatch(null)} size="sm" variant="ghost">
              Fechar
            </Button>
          </div>
        ) : null}
        <p className="font-semibold text-sm">Vouchers</p>
        {list === undefined ? <Spinner /> : null}
        {list?.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum voucher ainda.</p>
        ) : null}
        <ul className="divide-y rounded-2xl border bg-card">
          {(list ?? []).map((v) => {
            const st = voucherStatus(v);
            return (
              <li key={v.id}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  onClick={() => setOpen(v)}
                  type="button"
                >
                  <Icon className="size-5 shrink-0" name="IconQrCode" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {v.label} · {voucherValue(v, cur)}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {v.code} · {dateText(v.createdAt)} · {v.createdBy}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      st.ok
                        ? "bg-[#3d7a5f]/15 text-[#3d7a5f]"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {st.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <VoucherSheet onClose={() => setOpen(null)} v={open} />
    </div>
  );
}

/** Checkout: scan or type a voucher and apply it to the order. */
export function RedeemVoucher({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redeem = async (code: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const amount = await sendPos(api.vouchers.redeem, { orderId, code });
    setBusy(false);
    if (amount === undefined) {
      setError("Não foi possível usar o voucher (veja o aviso no topo).");
      return;
    }
    onDone();
  };
  return (
    <div className="flex flex-col gap-3">
      <QrScanner onCode={redeem} paused={busy} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          redeem(typed);
        }}
      >
        <Input
          autoCapitalize="characters"
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ou digite o código do voucher"
          value={typed}
        />
        <Button disabled={busy || !typed.trim()} type="submit">
          {busy ? <Spinner /> : "Usar"}
        </Button>
      </form>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
