"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/lib/icons";
import {
  DESIGN_FONTS,
  FONT_CATEGORIES,
  type FontOption,
  fontStack,
  loadFonts,
} from "@/lib/menu-canvas/fonts";
import {
  iconElement,
  imageElement,
  MENU_ICONS,
  PAGE_SIZES,
  shapeElement,
  TEXT_PRESETS,
  textElement,
} from "@/lib/menu-canvas/model";
import type {
  Design,
  DesignElement,
  DesignPage,
  ImageElement,
  ShapeElement,
  TextElement,
} from "@/lib/menu-canvas/types";
import { cn } from "@/lib/utils";
import { useUploadImage } from "./assets";
import { LibrarySection } from "./extract-sheet";

/** Left (insert) and right (properties, layers) panels of the editor. */

const EMOJIS = [
  "🍕",
  "🍔",
  "🍣",
  "🥩",
  "🍝",
  "🥗",
  "🍤",
  "🦞",
  "🐟",
  "🍰",
  "🍨",
  "☕",
  "🍷",
  "🥂",
  "🍺",
  "🍸",
  "🍹",
  "🌶️",
  "🌿",
  "🥑",
  "🍋",
  "🧀",
  "🥖",
  "⭐",
  "❤️",
  "🔥",
  "✨",
  "🌱",
  "🇧🇷",
  "🇵🇹",
  "🇮🇹",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </p>
      {children}
    </section>
  );
}

/* --------------------------------- insert -------------------------------- */

export function InsertPanel({
  design,
  onAdd,
}: {
  design: Design;
  onAdd: (el: DesignElement) => void;
}) {
  const upload = useUploadImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const center = (w: number, h: number) => ({
    x: Math.round((design.width - w) / 2),
    y: Math.round((design.height - h) / 2),
  });

  useEffect(() => {
    loadFonts(TEXT_PRESETS.map((p) => p.patch.fontFamily ?? "Montserrat"));
  }, []);

  async function addImages(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const file of [...files]) {
        const src = await upload(file);
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = src;
        });
        const ratio = img.width && img.height ? img.height / img.width : 0.75;
        const w = Math.min(design.width * 0.6, 420);
        const h = Math.round(w * ratio);
        onAdd(
          imageElement({
            name: file.name.slice(0, 30) || "Imagem",
            src,
            w,
            h,
            ...center(w, h),
          })
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="Texto">
        <div className="flex flex-col gap-1.5">
          {TEXT_PRESETS.map((p) => (
            <button
              className="rounded-md border px-3 py-2 text-left hover:bg-muted"
              key={p.label}
              onClick={() => {
                const el = textElement(p.patch);
                onAdd({ ...el, ...center(el.w, 40) });
              }}
              style={{
                fontFamily: fontStack(p.patch.fontFamily ?? "Montserrat"),
                fontWeight: p.patch.fontWeight ?? 400,
                fontStyle: p.patch.italic ? "italic" : undefined,
                fontSize: Math.min(22, (p.patch.fontSize ?? 20) * 0.6),
                textTransform: p.patch.uppercase ? "uppercase" : undefined,
                letterSpacing: p.patch.uppercase ? 2 : undefined,
              }}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Meus elementos">
        <LibrarySection center={center} onAdd={onAdd} />
      </Section>

      <Section title="Imagens e logotipo">
        <input
          accept="image/*,.svg"
          className="hidden"
          multiple
          onChange={(e) => {
            addImages(e.target.files);
            e.target.value = "";
          }}
          ref={fileRef}
          type="file"
        />
        <input
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addImages(e.target.files);
            e.target.value = "";
          }}
          ref={cameraRef}
          type="file"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconCloudUpload" />
            {busy ? "Enviando…" : "Carregar"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconCamera1" />
            Foto
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          PNG, JPG, WebP, GIF ou SVG: fotos dos pratos, logotipos, texturas,
          ícones próprios.
        </p>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </Section>

      <Section title="Formas">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["Retângulo", { shape: "rect" }],
              ["Arredondado", { shape: "rect", radius: 24 }],
              ["Círculo", { shape: "ellipse", w: 160, h: 160 }],
              [
                "Moldura",
                {
                  shape: "rect",
                  fill: "",
                  stroke: "#1f1a17",
                  strokeWidth: 3,
                  w: 500,
                  h: 300,
                },
              ],
              [
                "Linha",
                {
                  shape: "line",
                  fill: "",
                  stroke: "#1f1a17",
                  strokeWidth: 2,
                  w: 300,
                  h: 4,
                },
              ],
              [
                "Tracejada",
                {
                  shape: "line",
                  fill: "",
                  stroke: "#1f1a17",
                  strokeWidth: 2,
                  dashed: true,
                  w: 300,
                  h: 4,
                },
              ],
            ] as [string, Partial<ShapeElement>][]
          ).map(([label, patch]) => (
            <button
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-[11px] hover:bg-muted"
              key={label}
              onClick={() => {
                const el = shapeElement({ name: label, ...patch });
                onAdd({ ...el, ...center(el.w, el.h) });
              }}
              type="button"
            >
              <span
                className={cn(
                  "block bg-current opacity-70",
                  patch.shape === "ellipse" && "rounded-full",
                  patch.shape === "line" ? "h-0.5 w-8" : "size-7",
                  patch.radius && "rounded-md",
                  patch.fill === "" &&
                    patch.shape === "rect" &&
                    "border-2 border-current bg-transparent"
                )}
              />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Ícones">
        <div className="grid grid-cols-6 gap-1">
          {MENU_ICONS.map((name) => (
            <button
              aria-label={name.replace("Icon", "")}
              className="flex aspect-square items-center justify-center rounded-md hover:bg-muted"
              key={name}
              onClick={() =>
                onAdd(iconElement({ icon: name, ...center(64, 64) }))
              }
              title={name.replace("Icon", "")}
              type="button"
            >
              <Icon className="size-5" name={name as IconName} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((emoji) => (
            <button
              className="flex aspect-square items-center justify-center rounded-md text-lg hover:bg-muted"
              key={emoji}
              onClick={() =>
                onAdd(
                  textElement({
                    name: `Emoji ${emoji}`,
                    text: emoji,
                    fontSize: 64,
                    align: "center",
                    w: 100,
                    ...center(100, 80),
                  })
                )
              }
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------ properties ------------------------------ */

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-1 text-muted-foreground text-xs">
      <span>{label}</span>
      <Input
        aria-label={label}
        className="h-8 tabular-nums"
        max={max}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) {
            onChange(n);
          }
        }}
        step={step}
        type="number"
        value={Math.round(value * 100) / 100}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  swatches,
  allowNone = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  swatches: string[];
  allowNone?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
      <span>{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          aria-label={label}
          className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
          onChange={(e) => onChange(e.target.value)}
          type="color"
          value={value && value.length === 7 ? value : "#000000"}
        />
        {allowNone ? (
          <button
            aria-label="Sem cor"
            className={cn(
              "size-6 rounded border bg-[linear-gradient(135deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]",
              !value && "ring-2 ring-primary"
            )}
            onClick={() => onChange("")}
            type="button"
          />
        ) : null}
        {swatches.slice(0, 12).map((c) => (
          <button
            aria-label={c}
            className={cn(
              "size-6 rounded border",
              value.toLowerCase() === c.toLowerCase() && "ring-2 ring-primary"
            )}
            key={c}
            onClick={() => onChange(c)}
            style={{ background: c }}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (f: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      loadFonts(DESIGN_FONTS.map((f) => f.family));
    }
  }, [open]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<FontOption["category"], FontOption[]>();
    for (const f of DESIGN_FONTS) {
      if (q && !f.family.toLowerCase().includes(q)) {
        continue;
      }
      map.set(f.category, [...(map.get(f.category) ?? []), f]);
    }
    return [...map.entries()];
  }, [query]);
  const custom = query.trim();
  return (
    <div className="flex flex-col gap-1 text-muted-foreground text-xs">
      <span>Fonte</span>
      <button
        className="flex h-9 items-center justify-between rounded-md border px-2 text-foreground text-sm"
        onClick={() => setOpen((o) => !o)}
        style={{ fontFamily: fontStack(value) }}
        type="button"
      >
        {value}
        <Icon className="size-4" name="IconChevronDownSmall" />
      </button>
      {open ? (
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md border bg-popover p-2">
          <Input
            className="h-8"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ou digitar qualquer Google Font"
            value={query}
          />
          {groups.map(([cat, fonts]) => (
            <div className="flex flex-col" key={cat}>
              <span className="px-1 py-0.5 text-[10px] uppercase">
                {FONT_CATEGORIES[cat]}
              </span>
              {fonts.map((f) => (
                <button
                  className={cn(
                    "rounded px-2 py-1 text-left text-base text-foreground hover:bg-muted",
                    f.family === value && "bg-muted"
                  )}
                  key={f.family}
                  onClick={() => {
                    onChange(f.family);
                    setOpen(false);
                  }}
                  style={{ fontFamily: fontStack(f.family) }}
                  type="button"
                >
                  {f.family}
                </button>
              ))}
            </div>
          ))}
          {custom &&
          !DESIGN_FONTS.some(
            (f) => f.family.toLowerCase() === custom.toLowerCase()
          ) ? (
            <Button
              onClick={() => {
                loadFonts([custom]);
                onChange(custom);
                setOpen(false);
              }}
              size="sm"
              variant="outline"
            >
              Usar “{custom}” do Google Fonts
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      size="icon-sm"
      title={label}
      variant={active ? "secondary" : "ghost"}
    >
      <Icon className="size-4" name={icon} />
    </Button>
  );
}

/** Every color used on the page, for one-click reuse (like Canva). */
export function pageColors(page: DesignPage) {
  const set = new Set<string>([page.background]);
  for (const e of page.elements) {
    if (e.type === "text" || e.type === "icon") {
      set.add(e.color);
    }
    if (e.type === "shape") {
      if (e.fill) {
        set.add(e.fill);
      }
      if (e.stroke) {
        set.add(e.stroke);
      }
    }
  }
  return [...set, "#ffffff", "#000000", "#d4a27f", "#ebdbbc", "#cc785c"].filter(
    (c, i, all) => c && all.indexOf(c) === i
  );
}

function TextProps({
  el,
  set,
  swatches,
}: {
  el: TextElement;
  set: (p: Partial<TextElement>) => void;
  swatches: string[];
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-muted-foreground text-xs">
        Texto
        <textarea
          className="min-h-20 rounded-md border bg-transparent px-2 py-1.5 text-foreground text-sm"
          onChange={(e) => set({ text: e.target.value })}
          value={el.text}
        />
      </label>
      <FontPicker
        onChange={(fontFamily) => set({ fontFamily })}
        value={el.fontFamily}
      />
      <div className="grid grid-cols-3 gap-2">
        <Num
          label="Tamanho"
          min={4}
          onChange={(fontSize) => set({ fontSize })}
          value={el.fontSize}
        />
        <Num
          label="Peso"
          max={900}
          min={100}
          onChange={(fontWeight) => set({ fontWeight })}
          step={100}
          value={el.fontWeight}
        />
        <Num
          label="Espaçamento"
          onChange={(letterSpacing) => set({ letterSpacing })}
          step={0.5}
          value={el.letterSpacing}
        />
        <Num
          label="Entrelinha"
          min={0.6}
          onChange={(lineHeight) => set({ lineHeight })}
          step={0.05}
          value={el.lineHeight}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <Toggle
          active={el.fontWeight >= 600}
          icon="IconBold"
          label="Negrito"
          onClick={() => set({ fontWeight: el.fontWeight >= 600 ? 400 : 700 })}
        />
        <Toggle
          active={el.italic}
          icon="IconItalic"
          label="Itálico"
          onClick={() => set({ italic: !el.italic })}
        />
        <Toggle
          active={el.underline}
          icon="IconStrikeThrough"
          label="Sublinhado"
          onClick={() => set({ underline: !el.underline })}
        />
        <Toggle
          active={el.uppercase}
          icon="IconFontStyle"
          label="Maiúsculas"
          onClick={() => set({ uppercase: !el.uppercase })}
        />
        <span className="mx-1 w-px bg-border" />
        <Toggle
          active={el.align === "left"}
          icon="IconLayoutAlignLeft"
          label="Esquerda"
          onClick={() => set({ align: "left" })}
        />
        <Toggle
          active={el.align === "center"}
          icon="IconLayoutColumn"
          label="Centro"
          onClick={() => set({ align: "center" })}
        />
        <Toggle
          active={el.align === "right"}
          icon="IconLayoutAlignRight"
          label="Direita"
          onClick={() => set({ align: "right" })}
        />
      </div>
      <ColorField
        label="Cor do texto"
        onChange={(color) => set({ color })}
        swatches={swatches}
        value={el.color}
      />
      <ColorField
        allowNone
        label="Fundo do texto"
        onChange={(background) => set({ background })}
        swatches={swatches}
        value={el.background}
      />
    </>
  );
}

function ImageProps({
  el,
  set,
  swatches,
}: {
  el: ImageElement;
  set: (p: Partial<ImageElement>) => void;
  swatches: string[];
}) {
  const upload = useUploadImage();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => ref.current?.click()}
          size="sm"
          variant="outline"
        >
          <Icon className="size-4" name="IconImages1" />
          Trocar imagem
        </Button>
        <Button
          onClick={() => set({ fit: el.fit === "cover" ? "contain" : "cover" })}
          size="sm"
          variant="ghost"
        >
          {el.fit === "cover" ? "Preencher" : "Ajustar"}
        </Button>
        <Button
          onClick={() => set({ flipX: !el.flipX })}
          size="sm"
          variant="ghost"
        >
          Espelhar
        </Button>
        <input
          accept="image/*,.svg"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              set({ src: await upload(f) });
            }
          }}
          ref={ref}
          type="file"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num
          label="Cantos"
          min={0}
          onChange={(radius) => set({ radius })}
          value={el.radius}
        />
        <Num
          label="Borda"
          min={0}
          onChange={(borderWidth) => set({ borderWidth })}
          value={el.borderWidth}
        />
      </div>
      {el.borderWidth ? (
        <ColorField
          label="Cor da borda"
          onChange={(borderColor) => set({ borderColor })}
          swatches={swatches}
          value={el.borderColor}
        />
      ) : null}
      <ColorField
        allowNone
        label="Recolorir (desenhos de uma cor: ícones, ornamentos, logos)"
        onChange={(tint) => set({ tint })}
        swatches={swatches}
        value={el.tint ?? ""}
      />
    </>
  );
}

function ShapeProps({
  el,
  set,
  swatches,
}: {
  el: ShapeElement;
  set: (p: Partial<ShapeElement>) => void;
  swatches: string[];
}) {
  return (
    <>
      {el.shape === "line" ? null : (
        <ColorField
          allowNone
          label="Preenchimento"
          onChange={(fill) => set({ fill })}
          swatches={swatches}
          value={el.fill}
        />
      )}
      <ColorField
        allowNone
        label="Contorno"
        onChange={(stroke) => set({ stroke })}
        swatches={swatches}
        value={el.stroke}
      />
      <div className="grid grid-cols-2 gap-2">
        <Num
          label="Espessura"
          min={0}
          onChange={(strokeWidth) => set({ strokeWidth })}
          step={0.5}
          value={el.strokeWidth}
        />
        {el.shape === "rect" ? (
          <Num
            label="Cantos"
            min={0}
            onChange={(radius) => set({ radius })}
            value={el.radius}
          />
        ) : null}
      </div>
      <Button
        className="self-start"
        onClick={() => set({ dashed: !el.dashed })}
        size="sm"
        variant="ghost"
      >
        {el.dashed ? "Contorno contínuo" : "Contorno tracejado"}
      </Button>
    </>
  );
}

export function PropertiesPanel({
  design,
  page,
  selection,
  onPatch,
  onPage,
  onDesign,
  onAction,
}: {
  design: Design;
  page: DesignPage;
  selection: DesignElement[];
  onPatch: (ids: string[], patch: Partial<DesignElement>) => void;
  onPage: (patch: Partial<DesignPage>) => void;
  onDesign: (patch: Partial<Design>) => void;
  onAction: (
    action:
      | "duplicate"
      | "delete"
      | "front"
      | "back"
      | "forward"
      | "backward"
      | "lock"
      | "center"
  ) => void;
}) {
  const upload = useUploadImage();
  const bgRef = useRef<HTMLInputElement>(null);
  const swatches = useMemo(() => pageColors(page), [page]);
  const el = selection[0];

  if (!el) {
    return (
      <div className="flex flex-col gap-4">
        <Section title="Design">
          <div className="flex flex-col gap-1 text-muted-foreground text-xs">
            <span>Nome</span>
            <Input
              aria-label="Nome do design"
              className="h-8"
              onChange={(e) => onDesign({ name: e.target.value })}
              value={design.name}
            />
          </div>
          <label className="flex flex-col gap-1 text-muted-foreground text-xs">
            Tamanho da página
            <select
              className="h-8 rounded-md border bg-background px-2 text-foreground text-sm"
              onChange={(e) => {
                const s = PAGE_SIZES.find((x) => x.id === e.target.value);
                if (s) {
                  onDesign({ width: s.w, height: s.h });
                }
              }}
              value={
                PAGE_SIZES.find(
                  (s) => s.w === design.width && s.h === design.height
                )?.id ?? ""
              }
            >
              <option disabled value="">
                Personalizado ({design.width}×{design.height})
              </option>
              {PAGE_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </Section>
        <Section title="Página">
          <ColorField
            label="Cor de fundo"
            onChange={(background) => onPage({ background })}
            swatches={swatches}
            value={page.background}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => bgRef.current?.click()}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconImages1" />
              Imagem de fundo
            </Button>
            {page.backgroundImage ? (
              <Button
                onClick={() => onPage({ backgroundImage: "" })}
                size="sm"
                variant="ghost"
              >
                Remover fundo
              </Button>
            ) : null}
            <input
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  onPage({ backgroundImage: await upload(f) });
                }
              }}
              ref={bgRef}
              type="file"
            />
          </div>
        </Section>
        <p className="text-muted-foreground text-xs">
          Clique num elemento para editar. Duplo clique num texto para digitar.
          Shift + clique seleciona vários; Alt ao arrastar desliga o encaixe.
        </p>
      </div>
    );
  }

  const ids = selection.map((s) => s.id);
  const set = (patch: Partial<DesignElement>) => onPatch(ids, patch);
  const same = selection.every((s) => s.type === el.type);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        <Toggle
          active={false}
          icon="IconSquareBehindSquare1"
          label="Duplicar (Ctrl+D)"
          onClick={() => onAction("duplicate")}
        />
        <Toggle
          active={false}
          icon="IconArrowUp"
          label="Trazer para frente"
          onClick={() => onAction("forward")}
        />
        <Toggle
          active={false}
          icon="IconArrowDown"
          label="Enviar para trás"
          onClick={() => onAction("backward")}
        />
        <Toggle
          active={false}
          icon="IconLayoutColumn"
          label="Centralizar na página"
          onClick={() => onAction("center")}
        />
        <Toggle
          active={el.locked}
          icon="IconLock"
          label="Travar"
          onClick={() => onAction("lock")}
        />
        <Toggle
          active={false}
          icon="IconTrashCan"
          label="Apagar (Delete)"
          onClick={() => onAction("delete")}
        />
      </div>
      {selection.length === 1 ? (
        <Section title="Posição">
          <div className="grid grid-cols-3 gap-2">
            <Num label="X" onChange={(x) => set({ x })} value={el.x} />
            <Num label="Y" onChange={(y) => set({ y })} value={el.y} />
            <Num
              label="Rotação"
              onChange={(rotation) => set({ rotation })}
              value={el.rotation}
            />
            <Num
              label="Largura"
              min={4}
              onChange={(w) => set({ w })}
              value={el.w}
            />
            {el.type === "text" ? null : (
              <Num
                label="Altura"
                min={2}
                onChange={(h) => set({ h })}
                value={el.h}
              />
            )}
            <Num
              label="Opacidade %"
              max={100}
              min={5}
              onChange={(n) => set({ opacity: n / 100 })}
              value={el.opacity * 100}
            />
          </div>
        </Section>
      ) : (
        <p className="text-muted-foreground text-xs">
          {selection.length} elementos selecionados
        </p>
      )}
      {same && el.type === "text" ? (
        <Section title="Texto">
          <TextProps
            el={el}
            set={(p) => set(p as Partial<DesignElement>)}
            swatches={swatches}
          />
        </Section>
      ) : null}
      {same && el.type === "image" ? (
        <Section title="Imagem">
          <ImageProps
            el={el}
            set={(p) => set(p as Partial<DesignElement>)}
            swatches={swatches}
          />
        </Section>
      ) : null}
      {same && el.type === "shape" ? (
        <Section title="Forma">
          <ShapeProps
            el={el}
            set={(p) => set(p as Partial<DesignElement>)}
            swatches={swatches}
          />
        </Section>
      ) : null}
      {same && el.type === "icon" ? (
        <Section title="Ícone">
          <ColorField
            label="Cor"
            onChange={(color) => set({ color } as Partial<DesignElement>)}
            swatches={swatches}
            value={el.color}
          />
          <Num
            label="Traço"
            min={0.5}
            onChange={(strokeWidth) =>
              set({ strokeWidth } as Partial<DesignElement>)
            }
            step={0.25}
            value={el.strokeWidth}
          />
          <div className="grid grid-cols-8 gap-1">
            {MENU_ICONS.map((name) => (
              <button
                aria-label={name}
                className={cn(
                  "flex aspect-square items-center justify-center rounded hover:bg-muted",
                  el.icon === name && "bg-muted"
                )}
                key={name}
                onClick={() => set({ icon: name } as Partial<DesignElement>)}
                type="button"
              >
                <Icon className="size-4" name={name as IconName} />
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* --------------------------------- layers -------------------------------- */

const TYPE_ICON: Record<DesignElement["type"], IconName> = {
  text: "IconFontStyle",
  image: "IconImages1",
  shape: "IconShapesPlusXSquareCircle",
  icon: "IconStar",
};

export function LayersPanel({
  page,
  selected,
  onSelect,
  onPatch,
  onMove,
}: {
  page: DesignPage;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onPatch: (ids: string[], patch: Partial<DesignElement>) => void;
  onMove: (id: string, dir: 1 | -1) => void;
}) {
  const layers = [...page.elements].reverse();
  if (layers.length === 0) {
    return <p className="text-muted-foreground text-xs">Página vazia.</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {layers.map((e) => (
        <li
          className={cn(
            "group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs",
            selected.includes(e.id) ? "bg-muted" : "hover:bg-muted/50"
          )}
          key={e.id}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={(ev) =>
              onSelect(ev.shiftKey ? [...new Set([...selected, e.id])] : [e.id])
            }
            type="button"
          >
            <Icon
              className="size-3.5 shrink-0 text-muted-foreground"
              name={TYPE_ICON[e.type]}
            />
            <span className={cn("truncate", e.hidden && "opacity-40")}>
              {e.type === "text" ? e.text.split("\n")[0] || e.name : e.name}
            </span>
          </button>
          <button
            aria-label="Subir camada"
            className="opacity-60 hover:opacity-100"
            onClick={() => onMove(e.id, 1)}
            type="button"
          >
            <Icon className="size-3.5" name="IconArrowUp" />
          </button>
          <button
            aria-label="Descer camada"
            className="opacity-60 hover:opacity-100"
            onClick={() => onMove(e.id, -1)}
            type="button"
          >
            <Icon className="size-3.5" name="IconArrowDown" />
          </button>
          <button
            aria-label={e.locked ? "Destravar" : "Travar"}
            className={cn(
              "hover:opacity-100",
              e.locked ? "opacity-100" : "opacity-40"
            )}
            onClick={() => onPatch([e.id], { locked: !e.locked })}
            type="button"
          >
            <Icon className="size-3.5" name="IconLock" />
          </button>
          <button
            aria-label={e.hidden ? "Mostrar" : "Esconder"}
            className="opacity-60 hover:opacity-100"
            onClick={() => onPatch([e.id], { hidden: !e.hidden })}
            type="button"
          >
            <Icon
              className="size-3.5"
              name={e.hidden ? "IconEyeClosed" : "IconEyeOpen"}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
