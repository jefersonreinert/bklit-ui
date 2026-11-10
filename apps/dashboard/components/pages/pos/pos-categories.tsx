"use client";

import { type FormEvent, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import type { CategoryNode } from "@/lib/pos/categories";
import { TILE_COLORS } from "@/lib/pos/seed";
import { sendPos, useCompany } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

const asId = (id: string | null) =>
  id ? (id as Id<"posCategories">) : undefined;

/**
 * Organize the category tree as a full page: create categories and
 * subcategories, rename (renames every item too), color, reorder and
 * delete (items move to another category, or out of the subcategory).
 */
export function CategoriesManager({
  open,
  onClose,
  tree,
}: {
  open: boolean;
  onClose: () => void;
  tree: CategoryNode[];
}) {
  const company = useCompany();
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      return;
    }
    await sendPos(api.categories.save, { company, name: clean });
    setName("");
  };

  const move = (index: number, dir: -1 | 1) => {
    const names = tree.map((c) => c.name);
    const j = index + dir;
    if (j < 0 || j >= names.length) {
      return;
    }
    [names[index], names[j]] = [names[j] as string, names[index] as string];
    sendPos(api.categories.reorder, { company, names });
  };

  return (
    <FullPage
      backLabel="Itens"
      onClose={onClose}
      open={open}
      subtitle={`${tree.length} categorias`}
      title="Categorias"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-10">
        <form className="flex gap-2" onSubmit={add}>
          <Input
            aria-label="Nova categoria"
            className="h-11 flex-1 text-base sm:text-sm"
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova categoria (ex.: Cervejas)"
            value={name}
          />
          <Button className="h-11" disabled={!name.trim()} type="submit">
            <Icon className="size-4" name="IconPlusSmall" />
            Criar
          </Button>
        </form>
        <p className="text-muted-foreground text-xs">
          Toque numa categoria para ver as subcategorias. Renomear muda o nome em
          todos os itens dela.
        </p>
        <ul className="flex flex-col gap-2">
          {tree.map((c, i) => (
            <CategoryCard
              canDown={i < tree.length - 1}
              canUp={i > 0}
              company={company}
              expanded={expanded === c.name}
              key={c.name}
              node={c}
              onDown={() => move(i, 1)}
              onToggle={() => setExpanded(expanded === c.name ? null : c.name)}
              onUp={() => move(i, -1)}
              others={tree.filter((x) => x.name !== c.name).map((x) => x.name)}
            />
          ))}
        </ul>
      </div>
    </FullPage>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  onClick: () => void;
  disabled?: boolean;
  tone?: "bad";
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-30",
        tone === "bad" && "text-destructive"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" name={icon} />
    </button>
  );
}

function CategoryCard({
  node,
  company,
  expanded,
  onToggle,
  onUp,
  onDown,
  canUp,
  canDown,
  others,
}: {
  node: CategoryNode;
  company: string;
  expanded: boolean;
  onToggle: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
  others: string[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState(others[0] ?? "");
  const [newSub, setNewSub] = useState("");

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (clean && clean !== node.name) {
      await sendPos(api.categories.save, {
        company,
        id: asId(node.id),
        from: node.name,
        name: clean,
        color: node.color,
      });
    }
    setRenaming(false);
  };

  const setColor = (color: string) =>
    sendPos(api.categories.save, {
      company,
      id: asId(node.id),
      from: node.name,
      name: node.name,
      color,
    });

  const remove = async () => {
    await sendPos(api.categories.remove, {
      company,
      name: node.name,
      moveTo: node.count ? moveTo : undefined,
    });
    setDeleting(false);
  };

  const addSub = async (e: FormEvent) => {
    e.preventDefault();
    const clean = newSub.trim();
    if (clean) {
      await sendPos(api.categories.save, { company, name: clean, parent: node.name });
      setNewSub("");
    }
  };

  const moveSub = (index: number, dir: -1 | 1) => {
    const names = node.subs.map((s) => s.name);
    const j = index + dir;
    if (j < 0 || j >= names.length) {
      return;
    }
    [names[index], names[j]] = [names[j] as string, names[index] as string];
    sendPos(api.categories.reorder, { company, parent: node.name, names });
  };

  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-1 pr-1">
        {renaming ? (
          <form className="flex flex-1 gap-2 p-2" onSubmit={rename}>
            <Input
              aria-label="Novo nome"
              autoFocus
              className="h-10 flex-1 text-base sm:text-sm"
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              value={draft}
            />
            <Button className="h-10" type="submit">
              Salvar
            </Button>
          </form>
        ) : (
          <button
            aria-expanded={expanded}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left"
            onClick={onToggle}
            type="button"
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full bg-muted-foreground/40"
              style={node.color ? { background: node.color } : undefined}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[15px]">{node.name}</span>
              <span className="block text-muted-foreground text-xs">
                {node.count} itens · {node.subs.length} subcategorias
              </span>
            </span>
            <Icon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90"
              )}
              name="IconChevronRight"
            />
          </button>
        )}
        {renaming ? null : (
          <>
            <IconButton disabled={!canUp} icon="IconArrowUp" label={`Subir ${node.name}`} onClick={onUp} />
            <IconButton
              disabled={!canDown}
              icon="IconArrowDown"
              label={`Descer ${node.name}`}
              onClick={onDown}
            />
          </>
        )}
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t p-3">
          <div className="flex flex-wrap items-center gap-2">
            {TILE_COLORS.map((c) => (
              <button
                aria-label={`Cor ${c}`}
                aria-pressed={node.color === c}
                className={cn(
                  "size-7 rounded-full border-2",
                  node.color === c ? "border-foreground" : "border-transparent"
                )}
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                type="button"
              />
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Subcategorias
            </p>
            {node.subs.length ? (
              <ul className="divide-y rounded-xl border">
                {node.subs.map((s, i) => (
                  <SubRow
                    canDown={i < node.subs.length - 1}
                    canUp={i > 0}
                    company={company}
                    key={s.name}
                    onDown={() => moveSub(i, 1)}
                    onUp={() => moveSub(i, -1)}
                    parent={node.name}
                    sub={s}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma ainda.</p>
            )}
            <form className="mt-1 flex gap-2" onSubmit={addSub}>
              <Input
                aria-label={`Nova subcategoria de ${node.name}`}
                className="h-10 flex-1 text-base sm:text-sm"
                maxLength={60}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder="Nova subcategoria (ex.: IPA)"
                value={newSub}
              />
              <Button className="h-10" disabled={!newSub.trim()} type="submit" variant="outline">
                Adicionar
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setDraft(node.name);
                setRenaming(true);
              }}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconPencil" />
              Renomear
            </Button>
            <Button onClick={() => setDeleting(!deleting)} size="sm" variant="ghost">
              <Icon className="size-4" name="IconTrashCan" />
              Excluir
            </Button>
          </div>

          {deleting ? (
            <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {node.count ? (
                <label className="flex flex-col gap-1.5" htmlFor={`move-${node.name}`}>
                  Mover os {node.count} itens para
                  <select
                    className="h-10 rounded-lg border bg-background px-3 text-base sm:text-sm"
                    id={`move-${node.name}`}
                    onChange={(e) => setMoveTo(e.target.value)}
                    value={moveTo}
                  >
                    {others.length ? null : <option value="Outros">Outros</option>}
                    {others.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>A categoria está vazia.</p>
              )}
              <Button onClick={remove} size="sm" variant="destructive">
                Excluir “{node.name}”
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SubRow({
  sub,
  parent,
  company,
  onUp,
  onDown,
  canUp,
  canDown,
}: {
  sub: CategoryNode["subs"][number];
  parent: string;
  company: string;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sub.name);
  const [confirm, setConfirm] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (clean && clean !== sub.name) {
      await sendPos(api.categories.save, {
        company,
        id: asId(sub.id),
        from: sub.name,
        name: clean,
        parent,
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <li>
        <form className="flex gap-2 p-2" onSubmit={save}>
          <Input
            aria-label="Novo nome da subcategoria"
            autoFocus
            className="h-9 flex-1 text-base sm:text-sm"
            onChange={(e) => setDraft(e.target.value)}
            value={draft}
          />
          <Button size="sm" type="submit">
            Salvar
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-1 pl-3">
      <span className="min-w-0 flex-1 truncate text-sm">
        {sub.name}
        <span className="text-muted-foreground text-xs"> · {sub.count}</span>
      </span>
      <IconButton disabled={!canUp} icon="IconArrowUp" label={`Subir ${sub.name}`} onClick={onUp} />
      <IconButton disabled={!canDown} icon="IconArrowDown" label={`Descer ${sub.name}`} onClick={onDown} />
      <IconButton icon="IconPencil" label={`Renomear ${sub.name}`} onClick={() => setEditing(true)} />
      <IconButton
        icon={confirm ? "IconCheckmark1" : "IconTrashCan"}
        label={confirm ? `Confirmar exclusão de ${sub.name}` : `Excluir ${sub.name}`}
        onClick={() => {
          if (confirm) {
            sendPos(api.categories.remove, { company, name: sub.name, parent });
          }
          setConfirm(!confirm);
        }}
        tone="bad"
      />
    </li>
  );
}
