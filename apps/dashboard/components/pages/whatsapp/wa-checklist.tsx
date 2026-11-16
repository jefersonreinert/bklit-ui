"use client";

import { useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * A checklist sent as a WhatsApp message: a title and one ☐ line per
 * item (WhatsApp has no checklist of its own; the person replies with
 * the numbers done). Ready-made lists for the bar, all editable.
 */

const TEMPLATES: { name: string; items: string[] }[] = [
  {
    name: "Abertura do bar",
    items: [
      "Ligar as máquinas de vinho e conferir as garrafas",
      "Conferir a temperatura da câmara fria",
      "Repor gelo, limões e guarnições",
      "Conferir o fundo de troco do caixa",
      "Limpar e arrumar as mesas e o balcão",
      "Testar o QR do sommelier nas mesas",
    ],
  },
  {
    name: "Fechamento do bar",
    items: [
      "Fechar o caixa e conferir os pagamentos",
      "Limpar as máquinas de vinho",
      "Lançar as perdas do dia (garrafas quebradas, cortesias)",
      "Guardar perecíveis na câmara fria",
      "Desligar equipamentos e luzes",
      "Trancar portas e ligar o alarme",
    ],
  },
  {
    name: "Contagem de estoque",
    items: [
      "Contar o back bar (cheias + peso das abertas)",
      "Contar a adega",
      "Contar a câmara fria",
      "Revisar as diferenças antes de fechar",
      "Fechar a contagem no app",
    ],
  },
];

/** The message as WhatsApp shows it (*bold*, _italic_). */
export function checklistText(title: string, items: string[]) {
  const lines = items.map((i) => i.trim()).filter(Boolean);
  return [
    `*✅ ${title.trim() || "Checklist"}*`,
    "",
    ...lines.map((l, n) => `☐ ${n + 1}. ${l}`),
    "",
    "_Responda com os números feitos (ex.: 1 2 4)._",
  ].join("\n");
}

export function WaChecklist({
  onSend,
  onClose,
}: {
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(TEMPLATES[0]?.name ?? "Checklist");
  const [items, setItems] = useState((TEMPLATES[0]?.items ?? []).join("\n"));
  const [sending, setSending] = useState(false);
  const text = checklistText(title, items.split("\n"));
  const count = items.split("\n").filter((l) => l.trim()).length;

  const send = async () => {
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) {
      onClose();
    }
  };

  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={sending || !count} onClick={send}>
          {sending ? "Enviando…" : `Enviar checklist (${count} itens)`}
        </Button>
      }
      onClose={onClose}
      open
      title="Enviar checklist"
    >
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                title === t.name ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground"
              )}
              key={t.name}
              onClick={() => {
                setTitle(t.name);
                setItems(t.items.join("\n"));
              }}
              type="button"
            >
              {t.name}
            </button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="font-medium text-sm">Título</span>
          <Input onChange={(e) => setTitle(e.target.value)} value={title} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-sm">Itens (um por linha)</span>
          <Textarea onChange={(e) => setItems(e.target.value)} rows={8} value={items} />
        </label>
        <div className="space-y-1">
          <span className="font-medium text-sm">Como vai chegar</span>
          <pre className="whitespace-pre-wrap rounded-2xl border bg-card p-3 font-sans text-sm">{text}</pre>
        </div>
      </div>
    </FullPage>
  );
}
