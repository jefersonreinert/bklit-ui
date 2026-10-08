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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { TILE_COLORS } from "@/lib/pos/seed";
import { saveSettings, sendPos, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { type PosPerm, type PosUser, useCan, usePosUser } from "./pos-auth";

const NON_DIGITS = /\D/g;
const PIN4 = /^\d{4}$/;

const PERMS: { id: PosPerm; label: string; hint: string }[] = [
  {
    id: "orders",
    label: "Fazer pedidos",
    hint: "Abrir mesas, lançar itens, enviar à cozinha",
  },
  {
    id: "charge",
    label: "Receber pagamentos",
    hint: "Cobrar em dinheiro, cartão, QR ou link",
  },
  {
    id: "void",
    label: "Cancelar",
    hint: "Cancelar pedidos e tirar itens já enviados",
  },
  {
    id: "history",
    label: "Ver pedidos fechados",
    hint: "Histórico de hoje e ontem, reimprimir recibo",
  },
  {
    id: "reports",
    label: "Relatórios",
    hint: "Faturamento, lucro e mais vendidos",
  },
  {
    id: "products",
    label: "Produtos e preços",
    hint: "Criar, editar e excluir produtos",
  },
  { id: "stock", label: "Estoque", hint: "Entradas, contagens e perdas" },
  { id: "tables", label: "Mesas", hint: "Editar o mapa de mesas" },
  {
    id: "settings",
    label: "Ajustes",
    hint: "Recibo, pagamentos e configurações",
  },
  {
    id: "users",
    label: "Administrador",
    hint: "Gerenciar usuários e permissões",
  },
];

const ROLES: { id: string; label: string; perms: PosPerm[] }[] = [
  { id: "admin", label: "Administrador", perms: PERMS.map((p) => p.id) },
  {
    id: "manager",
    label: "Gerente",
    perms: PERMS.map((p) => p.id).filter((p) => p !== "users"),
  },
  { id: "cashier", label: "Caixa", perms: ["orders", "charge", "history"] },
  { id: "waiter", label: "Garçom", perms: ["orders"] },
  { id: "custom", label: "Personalizado", perms: [] },
];

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;

interface Draft {
  id?: Id<"posUsers">;
  name: string;
  role: string;
  perms: PosPerm[];
  color: string;
  active: boolean;
}

function UserForm({ user, onClose }: { user: Draft; onClose: () => void }) {
  const [d, setD] = useState(user);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !d.id;
  const pinOk = pin === "" ? !isNew : PIN4.test(pin);
  const perms =
    d.role === "custom"
      ? d.perms
      : (ROLES.find((r) => r.id === d.role)?.perms ?? []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await sendPos(api.staff.save, {
      id: d.id,
      name: d.name,
      role: d.role,
      perms,
      color: d.color,
      active: d.active,
      pin: pin || undefined,
    });
    setBusy(false);
    if (ok === undefined) {
      setError("Não foi possível salvar. Veja o aviso no topo.");
      return;
    }
    onClose();
  };

  const togglePerm = (p: PosPerm, on: boolean) => {
    const next = on
      ? [...new Set([...perms, p])]
      : perms.filter((x) => x !== p);
    setD({ ...d, role: "custom", perms: next });
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{isNew ? "Novo usuário" : d.name}</SheetTitle>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-5" onSubmit={save}>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="pu-name">
            Nome
            <Input
              autoFocus={isNew}
              id="pu-name"
              onChange={(e) => setD({ ...d, name: e.target.value })}
              value={d.name}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="pu-pin">
            {isNew ? "PIN (4 dígitos)" : "Novo PIN (deixe vazio para manter)"}
            <Input
              autoComplete="off"
              id="pu-pin"
              inputMode="numeric"
              maxLength={4}
              onChange={(e) =>
                setPin(e.target.value.replace(NON_DIGITS, "").slice(0, 4))
              }
              placeholder="••••"
              type="password"
              value={pin}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            Função
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm",
                    d.role === r.id
                      ? "bg-foreground text-background"
                      : "bg-muted"
                  )}
                  key={r.id}
                  onClick={() =>
                    setD({
                      ...d,
                      role: r.id,
                      perms: r.id === "custom" ? perms : r.perms,
                    })
                  }
                  type="button"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col divide-y rounded-2xl border">
            {PERMS.map((p) => (
              <span className="flex items-center gap-3 px-3 py-2.5" key={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{p.label}</span>
                  <span className="block text-muted-foreground text-xs">
                    {p.hint}
                  </span>
                </span>
                <Switch
                  aria-label={p.label}
                  checked={perms.includes(p.id)}
                  onCheckedChange={(on) => togglePerm(p.id, on)}
                />
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {TILE_COLORS.map((c) => (
              <button
                aria-label={`Cor ${c}`}
                className={cn(
                  "size-7 rounded-full border-2",
                  d.color === c
                    ? "scale-110 border-foreground"
                    : "border-transparent"
                )}
                key={c}
                onClick={() => setD({ ...d, color: c })}
                style={{ background: c }}
                type="button"
              />
            ))}
          </div>
          <span className="flex items-center justify-between text-sm">
            Ativo
            <Switch
              aria-label="Ativo"
              checked={d.active}
              onCheckedChange={(active) => setD({ ...d, active })}
            />
          </span>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button
            className="h-11"
            disabled={busy || !d.name.trim() || !pinOk}
            type="submit"
          >
            Salvar
          </Button>
          {isNew || !d.id ? null : (
            <Button
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                const id = d.id;
                if (id) {
                  await sendPos(api.staff.remove, { id });
                }
                onClose();
              }}
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
            >
              {confirmDelete ? "Toque de novo para remover" : "Remover usuário"}
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

const LOCK_OPTIONS = [0, 1, 3, 5, 15];

function AutoLock() {
  const { settings } = usePos();
  const value = settings.autoLockMin ?? 0;
  return (
    <div className="flex flex-col gap-2 text-sm">
      Bloquear sozinho sem uso (todos os aparelhos)
      <div className="flex flex-wrap gap-2">
        {LOCK_OPTIONS.map((m) => (
          <button
            className={cn(
              "rounded-full px-3 py-1.5",
              value === m ? "bg-foreground text-background" : "bg-muted"
            )}
            key={m}
            onClick={() => saveSettings({ autoLockMin: m })}
            type="button"
          >
            {m === 0 ? "Nunca" : `${m} min`}
          </button>
        ))}
      </div>
    </div>
  );
}

function Activity() {
  const items = usePosQuery(api.staff.activity, {});
  if (!items?.length) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" name="IconHistory" />
        Atividade
      </p>
      <ul className="divide-y text-sm">
        {items.slice(0, 60).map((a) => (
          <li
            className="flex items-baseline justify-between gap-3 py-2"
            key={a._id}
          >
            <span className="min-w-0">
              <b className="font-medium">{a.userName}</b> · {a.action}
              {a.detail ? (
                <span className="text-muted-foreground"> · {a.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {new Date(a.at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UsersCard() {
  const can = useCan();
  const me = usePosUser();
  const users = usePosQuery(api.staff.list, {}) as PosUser[] | null | undefined;
  const [editing, setEditing] = useState<Draft | null>(null);
  if (!can("users")) {
    return (
      <p className="text-center text-muted-foreground text-sm">
        Só o administrador gerencia usuários.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-semibold">
            <Icon className="size-4" name="IconUserGroup" />
            Usuários
          </p>
          <Button
            onClick={() =>
              setEditing({
                name: "",
                role: "waiter",
                perms: ["orders"],
                color: TILE_COLORS[5] ?? "#4a6fa5",
                active: true,
              })
            }
            size="sm"
          >
            <Icon className="size-4" name="IconPlusSmall" />
            Adicionar
          </Button>
        </div>
        <ul className="divide-y rounded-2xl border">
          {(users ?? []).map((u) => (
            <li key={u.id}>
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() =>
                  setEditing({
                    id: u.id,
                    name: u.name,
                    role: u.role,
                    perms: u.perms as PosPerm[],
                    color: u.color,
                    active: u.active,
                  })
                }
                type="button"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm text-white"
                  style={{ background: u.color }}
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      !u.active && "line-through"
                    )}
                  >
                    {u.name}
                    {u.id === me?.id ? " (você)" : ""}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {roleLabel(u.role)} · {u.perms.length} permissões
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
        <AutoLock />
      </div>
      <Activity />
      {editing ? (
        <UserForm onClose={() => setEditing(null)} user={editing} />
      ) : null}
    </div>
  );
}
