"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import { resetPos, saveSettings } from "@/lib/pos/store";
import type { PosSettings } from "@/lib/pos/types";

const CURRENCIES = ["EUR", "BRL", "USD", "GBP"];

export function PosSettingsCard({ settings }: { settings: PosSettings }) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" name="IconSettingsGear1" />
        Configurações do POS
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-currency">
          Moeda
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="pos-currency"
            onChange={(e) => saveSettings({ currency: e.target.value })}
            value={settings.currency}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-tax">
          Taxa de serviço (%)
          <Input
            id="pos-tax"
            inputMode="decimal"
            onChange={(e) =>
              saveSettings({
                taxRate: Number(e.target.value.replace(",", ".")) || 0,
              })
            }
            value={String(settings.taxRate)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-sumup">
        Chave de afiliado SumUp (cartão por aproximação)
        <Input
          autoComplete="off"
          id="pos-sumup"
          onChange={(e) =>
            saveSettings({ sumupAffiliateKey: e.target.value.trim() })
          }
          placeholder="Gere em me.sumup.com → Developers"
          value={settings.sumupAffiliateKey}
        />
        <span className="text-muted-foreground text-xs">
          Com o app SumUp instalado e o Tap to Pay ativado, o botão “Cartão por
          aproximação” abre a cobrança no telefone e volta com o resultado.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-link">
        Link de pagamento
        <Input
          autoComplete="off"
          id="pos-link"
          onChange={(e) => saveSettings({ paymentLink: e.target.value.trim() })}
          placeholder="https://… use {amount} e {ref}"
          value={settings.paymentLink}
        />
        <span className="text-muted-foreground text-xs">
          Ex.: um link de pagamento do Stripe, SumUp ou Revolut. {"{amount}"}{" "}
          vira o valor e {"{ref}"} o número do pedido.
        </span>
      </label>
      <Button
        className="self-start"
        onClick={() => {
          if (confirmReset) {
            resetPos();
          }
          setConfirmReset(!confirmReset);
        }}
        size="sm"
        variant={confirmReset ? "destructive" : "ghost"}
      >
        {confirmReset
          ? "Toque de novo: apaga pedidos, mesas e produtos"
          : "Restaurar dados de exemplo"}
      </Button>
    </div>
  );
}
