"use client";

import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Icon, type IconName } from "@/lib/icons";
import { sampleDoc } from "@/lib/pos/receipt";
import { DEFAULT_RECEIPT } from "@/lib/pos/seed";
import { saveReceipt, usePos } from "@/lib/pos/store";
import type {
  Align,
  PaperSize,
  ReceiptSettings,
  ReceiptTemplate,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { PrintButtons, ReceiptPreview } from "./pos-receipt";

const TEMPLATES: { id: ReceiptTemplate; name: string; hint: string }[] = [
  { id: "modern", name: "Moderno", hint: "Faixas de cor e total em destaque" },
  {
    id: "classic",
    name: "Clássico",
    hint: "Fonte de máquina, linhas pontilhadas",
  },
  {
    id: "compact",
    name: "Compacto",
    hint: "Uma linha por item, gasta menos papel",
  },
];

const PAPERS: { id: PaperSize; name: string }[] = [
  { id: "80", name: "80 mm" },
  { id: "58", name: "58 mm" },
  { id: "a4", name: "A4 (fatura)" },
];

const ALIGNS: { id: Align; icon: IconName; label: string }[] = [
  { id: "left", icon: "IconLayoutAlignLeft", label: "Esquerda" },
  { id: "center", icon: "IconLayoutColumn", label: "Centro" },
  { id: "right", icon: "IconLayoutAlignRight", label: "Direita" },
];

const ACCENTS = [
  "#c96442",
  "#111111",
  "#3d7a5f",
  "#4a6fa5",
  "#8e5ea2",
  "#b03a2e",
];

/** Logo resized to at most 480 px wide, kept as PNG (transparency). */
function readLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 480 / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas
        .getContext("2d")
        ?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Imagem inválida"));
    img.src = URL.createObjectURL(file);
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <legend className="sr-only">{title}</legend>
      <p className="font-semibold text-sm">{title}</p>
      {children}
    </fieldset>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; name: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-muted p-1">
      {options.map((o) => (
        <button
          aria-pressed={value === o.id}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 text-sm transition-colors",
            value === o.id ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
          key={o.id}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      <span className="flex justify-between">
        {label}
        <span className="text-muted-foreground tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        className="w-full accent-foreground"
        id={id}
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      {label}
      {multiline ? (
        <textarea
          className="min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <Input
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
    </label>
  );
}

function LogoSection({ r }: { r: ReceiptSettings }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Logo">
      <div className="flex items-center gap-3">
        <button
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-white"
          onClick={() => input.current?.click()}
          type="button"
        >
          {r.logo ? (
            // biome-ignore lint/performance/noImgElement: data URL logo
            <img
              alt="Logo"
              className="max-h-full max-w-full object-contain"
              height={80}
              src={r.logo}
              width={80}
            />
          ) : (
            <Icon
              className="size-7 text-muted-foreground"
              name="IconAddImage"
            />
          )}
        </button>
        <div className="flex flex-col gap-1.5">
          <Button
            onClick={() => input.current?.click()}
            size="sm"
            variant="outline"
          >
            {r.logo ? "Trocar logo" : "Enviar logo"}
          </Button>
          {r.logo ? (
            <Button
              onClick={() => saveReceipt({ logo: "" })}
              size="sm"
              variant="ghost"
            >
              Remover
            </Button>
          ) : null}
          <span className="text-muted-foreground text-xs">
            PNG com fundo transparente fica melhor.
          </span>
        </div>
        <input
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) {
              return;
            }
            try {
              setError(null);
              saveReceipt({ logo: await readLogo(file) });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Falhou.");
            }
          }}
          ref={input}
          type="file"
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="flex gap-2">
        {ALIGNS.map((a) => (
          <button
            aria-label={`Logo à ${a.label.toLowerCase()}`}
            aria-pressed={r.logoAlign === a.id}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm",
              r.logoAlign === a.id
                ? "border-foreground bg-muted"
                : "text-muted-foreground"
            )}
            key={a.id}
            onClick={() => saveReceipt({ logoAlign: a.id })}
            type="button"
          >
            <Icon className="size-4" name={a.icon} />
            {a.label}
          </button>
        ))}
      </div>
      <Range
        label="Tamanho"
        max={100}
        min={10}
        onChange={(logoWidth) => saveReceipt({ logoWidth })}
        unit="%"
        value={r.logoWidth}
      />
      <Range
        label="Espaço acima"
        max={20}
        min={0}
        onChange={(logoOffset) => saveReceipt({ logoOffset })}
        unit=" mm"
        value={r.logoOffset}
      />
    </Section>
  );
}

function LayoutSection({ r }: { r: ReceiptSettings }) {
  return (
    <Section title="Modelo e papel">
      <div className="grid gap-2 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            aria-pressed={r.template === t.id}
            className={cn(
              "flex flex-col gap-0.5 rounded-2xl border p-3 text-left",
              r.template === t.id
                ? "border-foreground bg-muted"
                : "hover:bg-muted/60"
            )}
            key={t.id}
            onClick={() => saveReceipt({ template: t.id })}
            type="button"
          >
            <span className="font-medium text-sm">{t.name}</span>
            <span className="text-muted-foreground text-xs">{t.hint}</span>
          </button>
        ))}
      </div>
      <Segmented
        onChange={(paper) => saveReceipt({ paper })}
        options={PAPERS}
        value={r.paper}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Cor</span>
        {ACCENTS.map((c) => (
          <button
            aria-label={`Cor ${c}`}
            className={cn(
              "size-7 rounded-full border-2",
              r.accent === c
                ? "scale-110 border-foreground"
                : "border-transparent"
            )}
            key={c}
            onClick={() => saveReceipt({ accent: c })}
            style={{ background: c }}
            type="button"
          />
        ))}
        <input
          aria-label="Outra cor"
          className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
          onChange={(e) => saveReceipt({ accent: e.target.value })}
          type="color"
          value={r.accent}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Nas impressoras térmicas a cor sai em preto; no PDF sai colorida.
      </p>
    </Section>
  );
}

function BusinessSection({ r }: { r: ReceiptSettings }) {
  const set =
    (k: keyof ReceiptSettings) =>
    (v: string): void =>
      saveReceipt({ [k]: v } as Partial<ReceiptSettings>);
  return (
    <Section title="Empresa">
      <Field
        label="Nome no recibo"
        onChange={set("businessName")}
        value={r.businessName}
      />
      <Field
        label="Razão social"
        onChange={set("legalName")}
        value={r.legalName}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="NIF / CNPJ" onChange={set("taxId")} value={r.taxId} />
        <Field label="Telefone" onChange={set("phone")} value={r.phone} />
      </div>
      <Field label="Endereço" onChange={set("address")} value={r.address} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mail" onChange={set("email")} value={r.email} />
        <Field label="Site" onChange={set("website")} value={r.website} />
      </div>
    </Section>
  );
}

function TextsSection({ r }: { r: ReceiptSettings }) {
  const toggles: {
    k: "showTaxId" | "showTable" | "showPayment";
    label: string;
  }[] = [
    { k: "showTaxId", label: "Mostrar NIF" },
    { k: "showTable", label: "Mostrar mesa" },
    { k: "showPayment", label: "Mostrar forma de pagamento" },
  ];
  return (
    <Section title="Textos">
      <Field
        label="Mensagem no topo"
        multiline
        onChange={(headerNote) => saveReceipt({ headerNote })}
        placeholder="Ex.: Happy hour todos os dias das 17h às 19h"
        value={r.headerNote}
      />
      <Field
        label="Rodapé"
        multiline
        onChange={(footer) => saveReceipt({ footer })}
        value={r.footer}
      />
      <Field
        label="Nota legal"
        onChange={(legalNote) => saveReceipt({ legalNote })}
        value={r.legalNote}
      />
      <Field
        label="QR code no final (link)"
        onChange={(qrUrl) => saveReceipt({ qrUrl: qrUrl.trim() })}
        placeholder="Ex.: link de avaliação no Google ou Instagram"
        value={r.qrUrl}
      />
      {toggles.map((t) => (
        <span className="flex items-center justify-between text-sm" key={t.k}>
          {t.label}
          <Switch
            aria-label={t.label}
            checked={r[t.k]}
            onCheckedChange={(v) => saveReceipt({ [t.k]: v })}
          />
        </span>
      ))}
      <Button
        className="self-start"
        onClick={() => saveReceipt({ ...DEFAULT_RECEIPT, logo: r.logo })}
        size="sm"
        variant="ghost"
      >
        Restaurar padrão
      </Button>
    </Section>
  );
}

/** Receipt / invoice layout editor with a live preview. */
export function ReceiptDesigner() {
  const data = usePos();
  const r = data.receipt;
  const doc = useMemo(() => sampleDoc(data), [data]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="order-2 flex flex-col gap-4 lg:order-1">
        <LayoutSection r={r} />
        <LogoSection r={r} />
        <BusinessSection r={r} />
        <TextsSection r={r} />
      </div>
      <div className="order-1 lg:order-2">
        <div className="flex flex-col gap-4 rounded-3xl bg-muted/50 p-4 lg:sticky lg:top-4">
          <p className="text-center text-muted-foreground text-xs">
            Pré-visualização (exemplo)
          </p>
          <ReceiptPreview doc={doc} settings={r} />
          <PrintButtons doc={doc} />
        </div>
      </div>
    </div>
  );
}
