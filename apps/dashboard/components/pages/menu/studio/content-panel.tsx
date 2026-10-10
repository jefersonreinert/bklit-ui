"use client";

import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import {
  Field,
  numOrNull,
  splitList,
} from "@/components/pages/beverages/wine-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CELLAR_STYLES } from "@/lib/cellar/types";
import { Icon, type IconName } from "@/lib/icons";
import {
  blankItem,
  blankSection,
  defaultWineSource,
} from "@/lib/menu-studio/store";
import type {
  MenuDoc,
  MenuItem,
  MenuSection,
  WineGrouping,
  WineSource,
} from "@/lib/menu-studio/types";
import { cn } from "@/lib/utils";

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) {
    return list;
  }
  const [item] = next.splice(index, 1);
  if (item !== undefined) {
    next.splice(target, 0, item);
  }
  return next;
}

function IconButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(danger && "text-destructive")}
      onClick={(e) => {
        // Inside <summary>: act without opening/closing the section
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      <Icon name={icon} />
    </Button>
  );
}

function ItemEditor({
  item,
  onChange,
  onMove,
  onRemove,
}: {
  item: MenuItem;
  onChange: (item: MenuItem) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<MenuItem>) => onChange({ ...item, ...patch });
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2.5",
        item.hidden && "opacity-50"
      )}
    >
      <div className="flex items-center gap-1">
        <Input
          aria-label="Nome do item"
          className="h-8 font-medium"
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Nome"
          value={item.name}
        />
        <Input
          aria-label="Preço"
          className="h-8 w-20 tabular-nums"
          inputMode="decimal"
          onChange={(e) => set({ price: numOrNull(e.target.value) })}
          placeholder="Preço"
          value={item.price ?? ""}
        />
        <IconButton
          icon="IconArrowUp"
          label="Subir"
          onClick={() => onMove(-1)}
        />
        <IconButton
          icon="IconArrowDown"
          label="Descer"
          onClick={() => onMove(1)}
        />
        <IconButton
          icon={item.hidden ? "IconLock" : "IconCheckmark1Small"}
          label={item.hidden ? "Mostrar" : "Esconder"}
          onClick={() => set({ hidden: !item.hidden })}
        />
        <IconButton
          danger
          icon="IconTrashCan"
          label="Remover"
          onClick={onRemove}
        />
      </div>
      <Textarea
        aria-label="Descrição"
        className="min-h-0 text-xs"
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Descrição"
        rows={2}
        value={item.description}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <Input
          aria-label="Segundo preço"
          className="h-8 text-xs"
          inputMode="decimal"
          onChange={(e) => set({ secondaryPrice: numOrNull(e.target.value) })}
          placeholder="2º preço"
          value={item.secondaryPrice ?? ""}
        />
        <Input
          aria-label="Rótulo do segundo preço"
          className="h-8 text-xs"
          onChange={(e) => set({ secondaryLabel: e.target.value })}
          placeholder="taça, meia…"
          value={item.secondaryLabel}
        />
        <Input
          aria-label="Etiquetas"
          className="h-8 text-xs"
          defaultValue={item.tags.join(", ")}
          key={`t-${item.id}`}
          onBlur={(e) => set({ tags: splitList(e.target.value) })}
          placeholder="V, GF, picante"
        />
      </div>
      <Input
        aria-label="Detalhes"
        className="h-8 text-xs"
        onChange={(e) => set({ details: e.target.value })}
        placeholder="Detalhes (uva, região, safra…)"
        value={item.details}
      />
    </div>
  );
}

function WineSourceEditor({
  src,
  onChange,
}: {
  src: WineSource;
  onChange: (src: WineSource) => void;
}) {
  const set = (patch: Partial<WineSource>) => onChange({ ...src, ...patch });
  const toggleStyle = (style: string) =>
    set({
      styles: src.styles.includes(style)
        ? src.styles.filter((s) => s !== style)
        : [...src.styles, style],
    });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground text-xs">
        Lista gerada da Adega (Bebidas → Adega). Muda sozinha quando um vinho
        entra, sai ou muda de preço.
      </p>
      <Field label="Organizar por">
        <FilterSelect
          className="sm:w-full"
          items={[
            { value: "style", label: "Estilo (tinto, branco…)" },
            { value: "grape", label: "Uva" },
            { value: "country", label: "País de origem" },
            { value: "price", label: "Faixa de preço" },
          ]}
          onChange={(v) => set({ groupBy: v as WineGrouping })}
          value={src.groupBy}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {CELLAR_STYLES.map((s) => (
          <button
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              (src.styles.length === 0 || src.styles.includes(s.value)) &&
                "border-primary bg-primary/10"
            )}
            key={s.value}
            onClick={() => toggleStyle(s.value)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label="Rótulo taça"
          className="h-8 text-xs"
          onChange={(e) => set({ glassLabel: e.target.value })}
          value={src.glassLabel}
        />
        <Input
          aria-label="Rótulo garrafa"
          className="h-8 text-xs"
          onChange={(e) => set({ bottleLabel: e.target.value })}
          value={src.bottleLabel}
        />
      </div>
      {(
        [
          ["showGlass", "Mostrar preço da taça"],
          ["showGrapes", "Mostrar uvas"],
          ["showNotes", "Mostrar nota de degustação"],
        ] as const
      ).map(([key, label]) => (
        <div className="flex items-center justify-between text-sm" key={key}>
          <span>{label}</span>
          <Switch
            checked={src[key]}
            onCheckedChange={(v) => set({ [key]: v } as Partial<WineSource>)}
          />
        </div>
      ))}
    </div>
  );
}

function SectionEditor({
  section,
  language,
  onChange,
  onMove,
  onRemove,
}: {
  section: MenuSection;
  language: string;
  onChange: (s: MenuSection) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<MenuSection>) =>
    onChange({ ...section, ...patch });
  const setItems = (items: MenuItem[]) => set({ items });
  const count = section.wineSource ? "Adega" : `${section.items.length} itens`;
  return (
    <details className="group rounded-xl border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
        <Icon
          className="size-4 transition-transform group-open:rotate-90"
          name="IconChevronRight"
        />
        <span className="flex-1 truncate font-medium text-sm">
          {section.title || "Sem título"}
        </span>
        <span className="text-muted-foreground text-xs">{count}</span>
        <IconButton
          icon="IconArrowUp"
          label="Subir seção"
          onClick={() => onMove(-1)}
        />
        <IconButton
          icon="IconArrowDown"
          label="Descer seção"
          onClick={() => onMove(1)}
        />
        <IconButton
          danger
          icon="IconTrashCan"
          label="Remover seção"
          onClick={onRemove}
        />
      </summary>
      <div className="flex flex-col gap-3 border-t p-3">
        <Input
          aria-label="Título da seção"
          onChange={(e) => set({ title: e.target.value })}
          value={section.title}
        />
        <Input
          aria-label="Observação da seção"
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Observação (ex.: servido das 12h às 15h)"
          value={section.note}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Carta de vinhos automática (da Adega)</span>
          <Switch
            checked={section.wineSource !== null}
            onCheckedChange={(on) =>
              set({
                wineSource: on ? defaultWineSource(language) : null,
                kind: on ? "wine" : section.kind,
              })
            }
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Começar em nova página</span>
          <Switch
            checked={section.breakBefore}
            onCheckedChange={(breakBefore) => set({ breakBefore })}
          />
        </div>
        {section.wineSource ? (
          <WineSourceEditor
            onChange={(wineSource) => set({ wineSource })}
            src={section.wineSource}
          />
        ) : (
          <>
            {section.items.map((item, i) => (
              <ItemEditor
                item={item}
                key={item.id}
                onChange={(next) =>
                  setItems(
                    section.items.map((x) => (x.id === item.id ? next : x))
                  )
                }
                onMove={(d) => setItems(move(section.items, i, d))}
                onRemove={() =>
                  setItems(section.items.filter((x) => x.id !== item.id))
                }
              />
            ))}
            <Button
              onClick={() => setItems([...section.items, blankItem()])}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconPlusSmall" />
              Adicionar item
            </Button>
          </>
        )}
      </div>
    </details>
  );
}

export function ContentPanel({
  doc,
  onChange,
}: {
  doc: MenuDoc;
  onChange: (doc: MenuDoc) => void;
}) {
  const set = (patch: Partial<MenuDoc>) => onChange({ ...doc, ...patch });
  const setSections = (sections: MenuSection[]) => set({ sections });
  const text = (field: "name" | "restaurantName" | "tagline" | "footer") => ({
    onChange: (e: { target: { value: string } }) =>
      set({ [field]: e.target.value }),
    value: doc[field],
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field className="col-span-2" label="Nome do arquivo">
          <Input {...text("name")} />
        </Field>
        <Field className="col-span-2" label="Nome do restaurante (título)">
          <Input {...text("restaurantName")} />
        </Field>
        <Field className="col-span-2" label="Subtítulo">
          <Input {...text("tagline")} />
        </Field>
        <Field label="Moeda">
          <Input
            maxLength={3}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
            value={doc.currency}
          />
        </Field>
        <Field label="Idioma">
          <FilterSelect
            className="sm:w-full"
            items={[
              { value: "pt", label: "Português" },
              { value: "en", label: "English" },
              { value: "it", label: "Italiano" },
              { value: "es", label: "Español" },
              { value: "mt", label: "Malti" },
            ]}
            onChange={(language) => set({ language })}
            value={doc.language}
          />
        </Field>
        <Field className="col-span-2" label="Rodapé">
          <Input
            {...text("footer")}
            placeholder="Ex.: Preços com IVA incluído · Informe alergias"
          />
        </Field>
      </div>

      {doc.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          language={doc.language}
          onChange={(next) =>
            setSections(doc.sections.map((x) => (x.id === s.id ? next : x)))
          }
          onMove={(d) => setSections(move(doc.sections, i, d))}
          onRemove={() =>
            setSections(doc.sections.filter((x) => x.id !== s.id))
          }
          section={s}
        />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => setSections([...doc.sections, blankSection()])}
          variant="outline"
        >
          <Icon className="size-4" name="IconPlusSmall" />
          Nova seção
        </Button>
        <Button
          onClick={() =>
            setSections([
              ...doc.sections,
              blankSection({
                title: doc.language.startsWith("pt") ? "Vinhos" : "Wines",
                kind: "wine",
                wineSource: defaultWineSource(doc.language),
              }),
            ])
          }
          variant="outline"
        >
          <Icon className="size-4" name="IconGlass" />
          Carta de vinhos
        </Button>
      </div>
    </div>
  );
}
