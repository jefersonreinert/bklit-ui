"use client";

import { useRef } from "react";
import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import { Field } from "@/components/pages/beverages/wine-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/lib/icons";
import { templateStyle } from "@/lib/menu-studio/store";
import { FONTS, TEMPLATES } from "@/lib/menu-studio/templates";
import type {
  MenuDoc,
  MenuStyle,
  Ornament,
  Paper,
  PriceStyle,
} from "@/lib/menu-studio/types";
import { thumbnail } from "@/lib/upload";
import { cn } from "@/lib/utils";

const fontItems = (current: string) =>
  [...new Set([current, ...FONTS])].map((f) => ({ value: f, label: f }));

const COLORS: { key: keyof MenuStyle; label: string }[] = [
  { key: "background", label: "Fundo" },
  { key: "text", label: "Texto" },
  { key: "accent", label: "Destaque" },
  { key: "muted", label: "Descrições" },
];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
          onChange={(e) => onChange(e.target.value)}
          type="color"
          value={value}
        />
        <Input
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
      </div>
    </Field>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LogoField({
  logo,
  onChange,
}: {
  logo: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Field label="Logotipo">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-24 items-center justify-center rounded-md border bg-muted/40">
          {logo ? (
            // biome-ignore lint/performance/noImgElement: local data URL
            <img
              alt="Logo"
              className="max-h-12 max-w-20 object-contain"
              height={48}
              src={logo}
              width={80}
            />
          ) : (
            <Icon
              className="size-5 text-muted-foreground"
              name="IconAddImage"
            />
          )}
        </div>
        <input
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              onChange(await thumbnail(file, 480, "image/png"));
            }
          }}
          ref={ref}
          type="file"
        />
        <Button
          onClick={() => ref.current?.click()}
          size="sm"
          variant="outline"
        >
          Enviar
        </Button>
        {logo ? (
          <Button onClick={() => onChange("")} size="sm" variant="ghost">
            Remover
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

export function StylePanel({
  doc,
  onChange,
}: {
  doc: MenuDoc;
  onChange: (doc: MenuDoc) => void;
}) {
  const st = doc.style;
  const set = (patch: Partial<MenuStyle>) =>
    onChange({ ...doc, style: { ...st, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-2 text-left text-xs transition-colors hover:bg-muted/50",
              st.template === t.id && "border-primary ring-1 ring-primary"
            )}
            key={t.id}
            onClick={() =>
              set(
                templateStyle(t.id, {
                  logo: st.logo,
                  paper: st.paper,
                  landscape: st.landscape,
                })
              )
            }
            type="button"
          >
            <span
              className="flex h-10 items-center justify-center rounded"
              style={{
                background: t.style.background,
                color: t.style.accent,
                fontFamily: t.style.headingFont,
              }}
            >
              Menu
            </span>
            <span className="font-medium">{t.name}</span>
          </button>
        ))}
      </div>

      <LogoField logo={st.logo} onChange={(logo) => set({ logo })} />
      <Field label={`Altura do logo (${st.logoHeight}px)`}>
        <Slider
          max={200}
          min={30}
          onValueChange={(v) => set({ logoHeight: Number(v) })}
          value={st.logoHeight}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c) => (
          <ColorField
            key={c.key}
            label={c.label}
            onChange={(v) => set({ [c.key]: v } as Partial<MenuStyle>)}
            value={String(st[c.key])}
          />
        ))}
      </div>

      <Field label="Fonte dos títulos">
        <FilterSelect
          className="sm:w-full"
          items={fontItems(st.headingFont)}
          onChange={(headingFont) => set({ headingFont })}
          value={st.headingFont}
        />
      </Field>
      <Field label="Fonte do texto">
        <FilterSelect
          className="sm:w-full"
          items={fontItems(st.bodyFont)}
          onChange={(bodyFont) => set({ bodyFont })}
          value={st.bodyFont}
        />
      </Field>
      <Field label={`Tamanho do texto (${st.baseSize}px)`}>
        <Slider
          max={22}
          min={10}
          onValueChange={(v) => set({ baseSize: Number(v) })}
          value={st.baseSize}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Colunas">
          <FilterSelect
            className="sm:w-full"
            items={[
              { value: "1", label: "1 coluna" },
              { value: "2", label: "2 colunas" },
              { value: "3", label: "3 colunas" },
            ]}
            onChange={(v) => set({ columns: Number(v) as 1 | 2 | 3 })}
            value={String(st.columns)}
          />
        </Field>
        <Field label="Preços">
          <FilterSelect
            className="sm:w-full"
            items={[
              { value: "right", label: "À direita" },
              { value: "inline", label: "Junto ao nome" },
              { value: "below", label: "Abaixo" },
            ]}
            onChange={(v) => set({ priceStyle: v as PriceStyle })}
            value={st.priceStyle}
          />
        </Field>
        <Field label="Ornamento">
          <FilterSelect
            className="sm:w-full"
            items={[
              { value: "none", label: "Nenhum" },
              { value: "line", label: "Linha" },
              { value: "dots", label: "Pontos" },
              { value: "double", label: "Linha dupla" },
            ]}
            onChange={(v) => set({ ornament: v as Ornament })}
            value={st.ornament}
          />
        </Field>
        <Field label="Papel">
          <FilterSelect
            className="sm:w-full"
            items={(["A4", "A3", "A5", "Letter"] as Paper[]).map((p) => ({
              value: p,
              label: p,
            }))}
            onChange={(v) => set({ paper: v as Paper })}
            value={st.paper}
          />
        </Field>
        <Field label="Casas decimais">
          <FilterSelect
            className="sm:w-full"
            items={[
              { value: "0", label: "32" },
              { value: "2", label: "32.00" },
            ]}
            onChange={(v) => set({ decimals: Number(v) as 0 | 2 })}
            value={String(st.decimals)}
          />
        </Field>
      </div>

      <ToggleRow
        checked={st.uppercaseHeadings}
        label="Títulos em maiúsculas"
        onChange={(uppercaseHeadings) => set({ uppercaseHeadings })}
      />
      <ToggleRow
        checked={st.showCurrency}
        label="Mostrar símbolo da moeda"
        onChange={(showCurrency) => set({ showCurrency })}
      />
      <ToggleRow
        checked={st.landscape}
        label="Paisagem"
        onChange={(landscape) => set({ landscape })}
      />
    </div>
  );
}
