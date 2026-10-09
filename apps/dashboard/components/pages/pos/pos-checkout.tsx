"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon, type IconName } from "@/lib/icons";
import { paymentLinkUrl, sumupPayUrl } from "@/lib/pos/payments";
import { receiptDoc } from "@/lib/pos/receipt";
import {
  money,
  orderTotals,
  payOrder,
  readPos,
  updateOrder,
} from "@/lib/pos/store";
import type { PaymentMethod, PosData, PosOrder } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { orderLabel } from "./pos-cart";
import { SumupQrStep, useSumupQrAvailable } from "./pos-qr";
import { autoPrint, PrintButtons, ReceiptPreview } from "./pos-receipt";
import { RedeemVoucher } from "./pos-vouchers";

const TIPS = [0, 5, 10, 15];
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Step = "choose" | "qr" | "cash" | "link" | "other" | "voucher" | "done";

function MethodButton({
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: IconName;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-6" name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground text-xs">{hint}</span>
      </span>
      <Icon className="size-4 text-muted-foreground" name="IconChevronRight" />
    </button>
  );
}

function CashStep({
  due,
  currency,
  onPaid,
}: {
  due: number;
  currency: string;
  onPaid: () => void;
}) {
  const [received, setReceived] = useState("");
  const value = Number(received.replace(",", ".")) || 0;
  const change = value - due;
  const quick = [
    due,
    Math.ceil(due / 5) * 5,
    Math.ceil(due / 10) * 10,
    Math.ceil(due / 50) * 50,
  ];
  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        className="h-12 text-lg"
        inputMode="decimal"
        onChange={(e) => setReceived(e.target.value)}
        placeholder="Valor recebido"
        value={received}
      />
      <div className="flex flex-wrap gap-2">
        {[...new Set(quick)].map((q) => (
          <button
            className="rounded-full border bg-card px-3 py-1.5 text-sm"
            key={q}
            onClick={() => setReceived(q.toFixed(2))}
            type="button"
          >
            {money(q, currency)}
          </button>
        ))}
      </div>
      <p className="text-center text-lg">
        Troco:{" "}
        <b className={cn("tabular-nums", change < 0 && "text-destructive")}>
          {money(Math.max(0, change), currency)}
        </b>
      </p>
      <Button
        className="h-12 rounded-full text-base"
        disabled={change < -0.004}
        onClick={onPaid}
      >
        Confirmar pagamento em dinheiro
      </Button>
    </div>
  );
}

function PaidReceipt({ data, orderId }: { data: PosData; orderId: string }) {
  const [show, setShow] = useState(false);
  const paid = data.orders.find((o) => o.id === orderId);
  if (!paid) {
    return null;
  }
  const doc = receiptDoc(paid, data);
  return (
    <div className="flex w-full flex-col gap-2">
      {show ? <ReceiptPreview doc={doc} settings={data.receipt} /> : null}
      <Button onClick={() => setShow(!show)} variant="ghost">
        <Icon className="size-4" name="IconReceiptBill" />
        {show ? "Esconder recibo" : "Ver recibo"}
      </Button>
      <PrintButtons doc={doc} />
    </div>
  );
}

export function CheckoutSheet({
  order,
  data,
  open,
  onClose,
  onDone,
}: {
  order: PosOrder;
  data: PosData;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [tipRate, setTipRate] = useState(0);
  const { settings } = data;
  const currency = settings.currency;
  const total = orderTotals(order).total;
  const tip = Math.round(total * tipRate) / 100;
  const due = total + tip;

  const qrAvailable = useSumupQrAvailable();
  // Prints on the automatic printers once the payment is saved
  const printPaid = useCallback((orderId: string) => {
    const d = readPos();
    const paid = d.orders.find((o) => o.id === orderId);
    if (paid) {
      autoPrint(receiptDoc(paid, d), d.printers, d.receipt).catch(() => null);
    }
  }, []);
  // Stable so the QR step's status polling isn't restarted on every render
  const onQrPaid = useCallback(
    (txCode: string | null) => {
      payOrder(order.id, {
        method: "qr",
        amount: due,
        tip,
        ref: txCode ?? undefined,
      });
      printPaid(order.id);
      setStep("done");
    },
    [order.id, due, tip, printPaid]
  );

  const pay = (method: PaymentMethod, ref?: string) => {
    payOrder(order.id, { method, amount: due, tip, ref });
    printPaid(order.id);
    setStep("done");
  };

  const tapToPay = () => {
    updateOrder(order.id, {
      status: "paying",
      payment: { method: "card", amount: due, tip, at: Date.now() },
    });
    window.location.href = sumupPayUrl({
      order,
      amount: due,
      settings,
      callbackBase: `${window.location.origin}${BASE_PATH}/pos/`,
    });
  };

  const link = settings.paymentLink
    ? paymentLinkUrl(settings.paymentLink, due, order)
    : null;
  const shareLink = async () => {
    if (!link) {
      return;
    }
    if (navigator.share) {
      await navigator
        .share({ title: `Pedido ${order.number}`, url: link })
        .catch(() => null);
    } else {
      window.open(link, "_blank", "noopener");
    }
  };

  const close = () => {
    setStep("choose");
    setTipRate(0);
    if (step === "done") {
      onDone();
    } else {
      onClose();
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : close())} open={open}>
      <SheetContent
        className="acrylic max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl bg-popover sm:mx-auto sm:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="items-center border-b pb-4 text-center">
          <SheetDescription>{orderLabel(order, data)}</SheetDescription>
          <SheetTitle className="font-semibold text-4xl tabular-nums">
            {money(due, currency)}
          </SheetTitle>
          {tip > 0 ? (
            <p className="text-muted-foreground text-xs">
              {money(total, currency)} + gorjeta {money(tip, currency)}
            </p>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          {step === "choose" ? (
            <>
              <div className="flex items-center justify-center gap-2">
                <span className="text-muted-foreground text-sm">Gorjeta</span>
                {TIPS.map((r) => (
                  <button
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      tipRate === r
                        ? "bg-foreground text-background"
                        : "bg-muted"
                    )}
                    key={r}
                    onClick={() => setTipRate(r)}
                    type="button"
                  >
                    {r === 0 ? "Sem" : `${r}%`}
                  </button>
                ))}
              </div>
              {qrAvailable ? (
                <MethodButton
                  hint="Cliente paga no celular dele: cartão, Apple Pay ou Google Pay"
                  icon="IconQrCode"
                  onClick={() => setStep("qr")}
                  title="QR code SumUp"
                />
              ) : null}
              <MethodButton
                disabled={!settings.sumupAffiliateKey}
                hint={
                  settings.sumupAffiliateKey
                    ? "Tap to Pay no telefone pelo app SumUp"
                    : "Configure a chave da SumUp em Produtos → Configurações"
                }
                icon="IconNfc1"
                onClick={tapToPay}
                title="Cartão por aproximação"
              />
              <MethodButton
                hint="Calcula o troco"
                icon="IconBanknote1"
                onClick={() => setStep("cash")}
                title="Dinheiro"
              />
              <MethodButton
                disabled={!link}
                hint={
                  link
                    ? "Envie o link — o cliente paga no celular dele"
                    : "Configure o link em Produtos → Configurações"
                }
                icon="IconQrCode"
                onClick={() => setStep("link")}
                title="Link de pagamento"
              />
              <MethodButton
                hint="Escaneie o QR ou digite o código: o desconto entra no pedido"
                icon="IconGiftcard"
                onClick={() => setStep("voucher")}
                title="Usar voucher"
              />
              <MethodButton
                hint="Maquininha, transferência, voucher…"
                icon="IconCreditCard1"
                onClick={() => setStep("other")}
                title="Outro meio"
              />
            </>
          ) : null}

          {step === "cash" ? (
            <CashStep
              currency={currency}
              due={due}
              onPaid={() => pay("cash")}
            />
          ) : null}

          {step === "link" && link ? (
            <div className="flex flex-col gap-3">
              <p className="break-all rounded-xl bg-muted p-3 font-mono text-xs">
                {link}
              </p>
              <Button
                className="h-12 rounded-full"
                onClick={shareLink}
                variant="outline"
              >
                <Icon className="size-5" name="IconPaperPlane" />
                Enviar link
              </Button>
              <Button
                className="h-12 rounded-full text-base"
                onClick={() => pay("link")}
              >
                Cliente pagou
              </Button>
            </div>
          ) : null}

          {step === "voucher" ? (
            <RedeemVoucher
              onDone={() => setStep("choose")}
              orderId={order.id}
            />
          ) : null}

          {step === "qr" ? (
            <SumupQrStep
              amount={due}
              currency={currency}
              onPaid={onQrPaid}
              order={order}
            />
          ) : null}

          {step === "other" ? (
            <div className="flex flex-col gap-3">
              <p className="text-center text-muted-foreground text-sm">
                Cobre {money(due, currency)} na maquininha ou outro meio e
                confirme.
              </p>
              <Button
                className="h-12 rounded-full text-base"
                onClick={() => pay("other")}
              >
                Confirmar pagamento
              </Button>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#3d7a5f] text-white">
                <Icon className="size-8" name="IconCheckmark1" />
              </span>
              <p className="font-semibold text-lg">Pagamento registrado</p>
              <PaidReceipt data={data} orderId={order.id} />
              <Button
                className="h-12 w-full rounded-full text-base"
                onClick={close}
              >
                Novo pedido
              </Button>
            </div>
          ) : null}

          {step !== "choose" && step !== "done" ? (
            <Button onClick={() => setStep("choose")} variant="ghost">
              Voltar
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
