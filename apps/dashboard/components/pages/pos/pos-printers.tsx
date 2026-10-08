"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Icon, type IconName } from "@/lib/icons";
import { printReceipt } from "@/lib/pos/print";
import { sampleDoc } from "@/lib/pos/receipt";
import { deletePrinter, savePrinter, uid, usePos } from "@/lib/pos/store";
import type { PrinterConfig, PrinterKind } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

const KINDS: { id: PrinterKind; icon: IconName; name: string; hint: string }[] =
  [
    {
      id: "epos",
      icon: "IconWifiFull",
      name: "Epson Wi-Fi / rede",
      hint: "TM-m30, TM-m30III, TM-T88, TM-T20… imprime direto, sem app",
    },
    {
      id: "share",
      icon: "IconBluetooth",
      name: "Bluetooth / AirPrint",
      hint: "Gera o PDF e abre o compartilhar: escolha o app Epson TM Print Assistant ou Imprimir",
    },
  ];

const IP = /^[a-z0-9.-]+(:\d+)?$/i;

const blank = (): PrinterConfig => ({
  id: uid(),
  name: "Caixa",
  kind: "epos",
  host: "",
  deviceId: "local_printer",
  paper: "80",
  autoPrint: true,
  copies: 1,
  drawer: false,
});

function PrinterForm({
  printer,
  onClose,
}: {
  printer: PrinterConfig;
  onClose: () => void;
}) {
  const data = usePos();
  const [p, setP] = useState(printer);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !data.printers.some((x) => x.id === p.id);
  const hostOk = p.kind === "share" || IP.test(p.host.trim());
  const valid = p.name.trim() && hostOk;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      await printReceipt(p, sampleDoc(data), data.receipt);
      setResult({ ok: true, text: "Teste enviado. Saiu o recibo?" });
    } catch (err) {
      setResult({
        ok: false,
        text: err instanceof Error ? err.message : "Falhou.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{isNew ? "Nova impressora" : p.name}</SheetTitle>
        </SheetHeader>
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              savePrinter({ ...p, name: p.name.trim(), host: p.host.trim() });
              onClose();
            }
          }}
        >
          <div className="flex flex-col gap-2">
            {KINDS.map((k) => (
              <button
                aria-pressed={p.kind === k.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 text-left",
                  p.kind === k.id
                    ? "border-foreground bg-muted"
                    : "hover:bg-muted/60"
                )}
                key={k.id}
                onClick={() =>
                  setP({
                    ...p,
                    kind: k.id,
                    autoPrint: k.id === "epos" && p.autoPrint,
                  })
                }
                type="button"
              >
                <Icon className="mt-0.5 size-5 shrink-0" name={k.icon} />
                <span>
                  <span className="block font-medium text-sm">{k.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {k.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppr-1">
            Nome
            <Input
              id="ppr-1"
              onChange={(e) => setP({ ...p, name: e.target.value })}
              placeholder="Caixa, Bar, Cozinha…"
              value={p.name}
            />
          </label>
          {p.kind === "epos" ? (
            <EposFields p={p} setP={setP} />
          ) : (
            <BluetoothHelp />
          )}
          <div className="flex flex-col gap-1.5 text-sm">
            Largura do papel
            <div className="flex rounded-full bg-muted p-1">
              {(["80", "58"] as const).map((w) => (
                <button
                  aria-pressed={p.paper === w}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-sm",
                    p.paper === w
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground"
                  )}
                  key={w}
                  onClick={() => setP({ ...p, paper: w })}
                  type="button"
                >
                  {w} mm
                </button>
              ))}
            </div>
          </div>
          {result ? (
            <p
              className={cn(
                "rounded-xl p-3 text-sm",
                result.ok ? "bg-muted" : "bg-destructive/10 text-destructive"
              )}
            >
              {result.text}
            </p>
          ) : null}
          <Button
            disabled={!valid || testing}
            onClick={test}
            type="button"
            variant="outline"
          >
            {testing ? (
              <Spinner />
            ) : (
              <Icon className="size-4" name="IconPrinter" />
            )}
            Imprimir teste
          </Button>
          <Button className="h-11" disabled={!valid} type="submit">
            Salvar
          </Button>
          {isNew ? null : (
            <Button
              onClick={() => {
                if (confirmDelete) {
                  deletePrinter(p.id);
                  onClose();
                }
                setConfirmDelete(true);
              }}
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
            >
              {confirmDelete
                ? "Toque de novo para remover"
                : "Remover impressora"}
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EposFields({
  p,
  setP,
}: {
  p: PrinterConfig;
  setP: (p: PrinterConfig) => void;
}) {
  const host = p.host.trim();
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppr-2">
        Endereço IP da impressora
        <Input
          autoCapitalize="off"
          id="ppr-2"
          inputMode="decimal"
          onChange={(e) => setP({ ...p, host: e.target.value })}
          placeholder="192.168.1.50"
          value={p.host}
        />
        <span className="text-muted-foreground text-xs">
          Segure o botão FEED ao ligar a impressora: ela imprime uma folha com o
          IP. O celular precisa estar no mesmo Wi-Fi.
        </span>
      </label>
      <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-xs">
        <p>
          <b>Primeira vez:</b> o site é seguro (https) e a impressora usa um
          certificado próprio. Toque abaixo, depois em{" "}
          <b>Mostrar detalhes → visitar este site</b>, volte aqui e imprima o
          teste.
        </p>
        <a
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-full border bg-background text-sm",
            !IP.test(host) && "pointer-events-none opacity-50"
          )}
          href={`https://${host}/`}
          rel="noopener"
          target="_blank"
        >
          <Icon className="size-4" name="IconShieldCheck" />
          Autorizar conexão
        </a>
        <p className="text-muted-foreground">
          Se não abrir, ative o SSL/TLS e o ePOS-Print da impressora no app
          Epson TM Utility (Configurações → Rede).
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppr-3">
        ID do dispositivo
        <Input
          autoCapitalize="off"
          id="ppr-3"
          onChange={(e) => setP({ ...p, deviceId: e.target.value })}
          value={p.deviceId}
        />
      </label>
      <span className="flex items-center justify-between text-sm">
        Imprimir sozinho ao receber
        <Switch
          aria-label="Imprimir ao receber"
          checked={p.autoPrint}
          onCheckedChange={(autoPrint) => setP({ ...p, autoPrint })}
        />
      </span>
      <span className="flex items-center justify-between text-sm">
        Abrir gaveta de dinheiro
        <Switch
          aria-label="Abrir gaveta"
          checked={p.drawer}
          onCheckedChange={(drawer) => setP({ ...p, drawer })}
        />
      </span>
      <label
        className="flex items-center justify-between text-sm"
        htmlFor="ppr-4"
      >
        Cópias
        <Input
          className="w-20"
          id="ppr-4"
          inputMode="numeric"
          onChange={(e) =>
            setP({
              ...p,
              copies: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
            })
          }
          value={String(p.copies)}
        />
      </label>
    </>
  );
}

function BluetoothHelp() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-xs">
      <p>
        O Safari do iPhone não fala Bluetooth direto com impressoras. Para as
        Epson Bluetooth (TM-m30, TM-P20, TM-P80…):
      </p>
      <ol className="list-decimal pl-4">
        <li>
          Instale o app gratuito <b>Epson TM Print Assistant</b> e emparelhe a
          impressora nele.
        </li>
        <li>
          Aqui, toque em imprimir: abre o compartilhar com o PDF do recibo.
        </li>
        <li>Escolha o TM Print Assistant (ou Imprimir, para AirPrint).</li>
      </ol>
      <a
        className="flex h-9 items-center justify-center gap-2 rounded-full border bg-background text-sm"
        href="https://apps.apple.com/app/epson-tm-print-assistant/id1324935555"
        rel="noopener"
        target="_blank"
      >
        Baixar TM Print Assistant
        <Icon className="size-4" name="IconArrowUpRight" />
      </a>
    </div>
  );
}

export function PrintersCard() {
  const { printers } = usePos();
  const [editing, setEditing] = useState<PrinterConfig | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="size-4" name="IconPrinter" />
          Impressoras
        </p>
        <Button onClick={() => setEditing(blank())} size="sm">
          <Icon className="size-4" name="IconPlusSmall" />
          Adicionar
        </Button>
      </div>
      {printers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma impressora. Sem impressora, o recibo sai em PDF para
          compartilhar ou imprimir.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {printers.map((p) => (
            <li key={p.id}>
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => setEditing(p)}
                type="button"
              >
                <Icon
                  className="size-5 shrink-0"
                  name={p.kind === "epos" ? "IconWifiFull" : "IconBluetooth"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {p.kind === "epos" ? p.host : "PDF → app Epson / AirPrint"}{" "}
                    · {p.paper} mm{p.autoPrint ? " · automática" : ""}
                  </span>
                </span>
                <Icon
                  className="size-4 text-muted-foreground"
                  name="IconChevronRight"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <PrinterForm onClose={() => setEditing(null)} printer={editing} />
      ) : null}
    </div>
  );
}
