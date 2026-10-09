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
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/lib/icons";
import { money, uid } from "@/lib/pos/store";
import type { ItemMod, ModifierGroup, PosProduct } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

/** Product options ("steps": ice, lemon, doneness) and kitchen notes. */

export const activeGroups = (p: PosProduct) =>
  (p.modifiers ?? [])
    .filter((g) => g.active)
    .map((g) => ({ ...g, options: g.options.filter((o) => o.active) }))
    .filter((g) => g.options.length > 0);

import { itemDetail } from "@/lib/pos/receipt";

export const lineDetail = itemDetail;

const QUICK_NOTES = [
  "Sem cebola",
  "Sem tomate",
  "Bem passado",
  "Ao ponto",
  "Para viagem",
  "Sem glúten",
];

/** Chooses options, quantity and a note before adding the product. */
export function ModifierSheet({
  product,
  currency,
  onClose,
  onAdd,
}: {
  product: PosProduct | null;
  currency: string;
  onClose: () => void;
  onAdd: (extra: { mods: ItemMod[]; note: string; qty: number }) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const groups = product ? activeGroups(product) : [];
  const toggle = (g: ModifierGroup, optionId: string) => {
    const cur = picked[g.id] ?? [];
    let next: string[];
    if (g.multiple) {
      next = cur.includes(optionId)
        ? cur.filter((x) => x !== optionId)
        : [...cur, optionId];
    } else {
      next = cur.includes(optionId) && !g.required ? [] : [optionId];
    }
    setPicked({ ...picked, [g.id]: next });
  };
  const mods: ItemMod[] = groups.flatMap((g) =>
    g.options
      .filter((o) => (picked[g.id] ?? []).includes(o.id))
      .map((o) => ({ group: g.name, name: o.name, price: o.price }))
  );
  const missing = groups.filter(
    (g) => g.required && !(picked[g.id] ?? []).length
  );
  const unit = (product?.price ?? 0) + mods.reduce((a, m) => a + m.price, 0);
  const close = () => {
    setPicked({});
    setNote("");
    setQty(1);
    onClose();
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : close())} open={Boolean(product)}>
      <SheetContent
        className="acrylic max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl bg-popover sm:mx-auto sm:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle>{product?.name}</SheetTitle>
          <p className="text-muted-foreground text-sm">
            {money(product?.price ?? 0, currency)}
          </p>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          {groups.map((g) => (
            <div className="flex flex-col gap-2" key={g.id}>
              <p className="flex items-center gap-2 font-medium text-sm">
                {g.name}
                <span className="text-muted-foreground text-xs">
                  {g.required ? "obrigatório" : "opcional"}
                  {g.multiple ? " · vários" : ""}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => {
                  const on = (picked[g.id] ?? []).includes(o.id);
                  return (
                    <button
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-sm transition-colors",
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "bg-card hover:bg-muted"
                      )}
                      key={o.id}
                      onClick={() => toggle(g, o.id)}
                      type="button"
                    >
                      {o.name}
                      {o.price ? ` +${money(o.price, currency)}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <p className="font-medium text-sm">Observação para a cozinha</p>
            <Input
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: sem tomate, molho à parte…"
              value={note}
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_NOTES.map((q) => (
                <button
                  className="rounded-full bg-muted px-2.5 py-1 text-xs"
                  key={q}
                  onClick={() =>
                    setNote(note ? `${note}, ${q.toLowerCase()}` : q)
                  }
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-muted p-1">
              <button
                aria-label="Menos"
                className="flex size-10 items-center justify-center rounded-full bg-background"
                onClick={() => setQty(Math.max(1, qty - 1))}
                type="button"
              >
                <Icon className="size-4" name="IconMinusSmall" />
              </button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button
                aria-label="Mais"
                className="flex size-10 items-center justify-center rounded-full bg-background"
                onClick={() => setQty(qty + 1)}
                type="button"
              >
                <Icon className="size-4" name="IconPlusSmall" />
              </button>
            </div>
            <Button
              className="h-12 flex-1 rounded-full text-base"
              disabled={missing.length > 0}
              onClick={() => {
                onAdd({ mods, note, qty });
                close();
              }}
            >
              {missing.length
                ? `Escolha: ${missing[0]?.name}`
                : `Adicionar ${money(unit * qty, currency)}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------ product editor --------------------------- */

const blankGroup = (): ModifierGroup => ({
  id: uid(),
  name: "",
  required: false,
  multiple: false,
  active: true,
  options: [{ id: uid(), name: "", price: 0, active: true }],
});

function GroupEditor({
  g,
  onChange,
  onRemove,
}: {
  g: ModifierGroup;
  onChange: (g: ModifierGroup) => void;
  onRemove: () => void;
}) {
  const setOption = (
    id: string,
    patch: Partial<ModifierGroup["options"][number]>
  ) =>
    onChange({
      ...g,
      options: g.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        !g.active && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Nome do grupo"
          className="flex-1"
          onChange={(e) => onChange({ ...g, name: e.target.value })}
          placeholder="Ex.: Gelo, Limão, Ponto da carne"
          value={g.name}
        />
        <Switch
          aria-label="Grupo ativo"
          checked={g.active}
          onCheckedChange={(active) => onChange({ ...g, active })}
        />
        <button
          aria-label="Remover grupo"
          className="p-1 text-muted-foreground"
          onClick={onRemove}
          type="button"
        >
          <Icon className="size-4" name="IconTrashCan" />
        </button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <Switch
            aria-label="Obrigatório"
            checked={g.required}
            onCheckedChange={(required) => onChange({ ...g, required })}
          />
          Obrigatório
        </span>
        <span className="flex items-center gap-1.5">
          <Switch
            aria-label="Vários"
            checked={g.multiple}
            onCheckedChange={(multiple) => onChange({ ...g, multiple })}
          />
          Pode escolher vários
        </span>
      </div>
      {g.options.map((o) => (
        <div className="flex items-center gap-2" key={o.id}>
          <Input
            aria-label="Opção"
            className="flex-1"
            onChange={(e) => setOption(o.id, { name: e.target.value })}
            placeholder="Ex.: Com gelo"
            value={o.name}
          />
          <Input
            aria-label="Preço extra"
            className="w-20"
            inputMode="decimal"
            onChange={(e) =>
              setOption(o.id, {
                price: Number(e.target.value.replace(",", ".")) || 0,
              })
            }
            placeholder="+0,00"
            value={o.price ? String(o.price).replace(".", ",") : ""}
          />
          <Switch
            aria-label="Opção ativa"
            checked={o.active}
            onCheckedChange={(active) => setOption(o.id, { active })}
          />
          <button
            aria-label="Remover opção"
            className="p-1 text-muted-foreground"
            onClick={() =>
              onChange({
                ...g,
                options: g.options.filter((x) => x.id !== o.id),
              })
            }
            type="button"
          >
            <Icon className="size-4" name="IconCrossSmall" />
          </button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() =>
          onChange({
            ...g,
            options: [
              ...g.options,
              { id: uid(), name: "", price: 0, active: true },
            ],
          })
        }
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon className="size-4" name="IconPlusSmall" />
        Opção
      </Button>
    </div>
  );
}

export function ModifiersEditor({
  value,
  onChange,
}: {
  value: ModifierGroup[];
  onChange: (v: ModifierGroup[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Ex.: Coca-Cola → “Gelo” (com/sem) e “Limão”. Ao tocar no produto no
          caixa, aparecem as opções para escolher.
        </p>
      ) : null}
      {value.map((g) => (
        <GroupEditor
          g={g}
          key={g.id}
          onChange={(next) =>
            onChange(value.map((x) => (x.id === g.id ? next : x)))
          }
          onRemove={() => onChange(value.filter((x) => x.id !== g.id))}
        />
      ))}
      <Button
        className="self-start"
        onClick={() => onChange([...value, blankGroup()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Icon className="size-4" name="IconPlusSmall" />
        Grupo de opções
      </Button>
    </div>
  );
}

/** Cleans empty names before saving. */
export const cleanModifiers = (groups: ModifierGroup[]) =>
  groups
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      options: g.options
        .map((o) => ({ ...o, name: o.name.trim() }))
        .filter((o) => o.name),
    }))
    .filter((g) => g.name && g.options.length);
