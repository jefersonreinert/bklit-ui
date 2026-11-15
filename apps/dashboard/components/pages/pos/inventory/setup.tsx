"use client";

import { useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sendPos, useCompanies, useCompany } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { useCan } from "../pos-auth";
import { CARD, Field, type InvArea, type InvOverview } from "./shared";

/**
 * Areas of this bar (with the items in shelf order, so a count follows
 * the shelves) and, for the administrator, the group of bars that share
 * one catalog.
 */

export function SetupSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const can = useCan();
  const [editing, setEditing] = useState<InvArea | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className={cn(CARD, "space-y-3")}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Áreas de estoque</p>
            <p className="text-muted-foreground text-sm">
              Back bar, adega, câmara fria, cozinha, depósito. A contagem segue a ordem das prateleiras.
            </p>
          </div>
          <Button onClick={() => setEditing("new")} size="sm">
            Nova área
          </Button>
        </div>
        {data.areas.length ? (
          <ul className="divide-y rounded-xl border">
            {data.areas.map((a) => (
              <li className="flex items-center justify-between px-3 py-2.5" key={a._id}>
                <span className="text-sm">
                  {a.name} <span className="text-muted-foreground">· {a.items.length} itens</span>
                </span>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(a)} size="sm" variant="outline">
                    Editar
                  </Button>
                  <Button
                    onClick={() => {
                      if (window.confirm(`Remover a área ${a.name}?`)) {
                        void sendPos(api.inv.removeArea, { company, id: a._id });
                      }
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {can("users") ? <GroupCard data={data} /> : null}
      {editing ? (
        <AreaEditor area={editing === "new" ? null : editing} data={data} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function GroupCard({ data }: { data: InvOverview }) {
  const companies = useCompanies();
  const current = useCompany();
  const [name, setName] = useState(data.group?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(data.group?.companies ?? [current])
  );
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const key = await sendPos(api.inv.saveGroup, {
      key: data.group?.key ?? (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "grupo"),
      name: name.trim() || "Grupo",
      companies: [...picked],
    });
    setSaved(key !== undefined);
  };
  return (
    <div className={cn(CARD, "space-y-3")}>
      <div>
        <p className="font-medium">Grupo de bares</p>
        <p className="text-muted-foreground text-sm">
          Bares do mesmo dono compartilham o catálogo de itens (cada um com seu saldo) e podem
          transferir estoque entre si.
        </p>
      </div>
      <Field label="Nome do grupo">
        <Input onChange={(e) => setName(e.target.value)} placeholder="Ex.: Grupo Malta" value={name} />
      </Field>
      <div className="space-y-1.5">
        {(companies ?? []).map((c) => (
          <label className="flex items-center gap-2 text-sm" key={c.key}>
            <input
              checked={picked.has(c.key)}
              onChange={() =>
                setPicked((s) => {
                  const next = new Set(s);
                  if (next.has(c.key)) {
                    next.delete(c.key);
                  } else {
                    next.add(c.key);
                  }
                  return next;
                })
              }
              type="checkbox"
            />
            {c.name ?? c.key}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={!picked.size} onClick={save} size="sm">
          Salvar grupo
        </Button>
        {saved ? <span className="text-muted-foreground text-sm">Salvo.</span> : null}
      </div>
      {data.items.length && !data.group ? (
        <p className="text-amber-600 text-xs dark:text-amber-400">
          Crie o grupo antes de cadastrar itens: itens criados agora ficam só neste bar.
        </p>
      ) : null}
    </div>
  );
}

function AreaEditor({
  area,
  data,
  onClose,
}: {
  area: InvArea | null;
  data: InvOverview;
  onClose: () => void;
}) {
  const company = useCompany();
  const [name, setName] = useState(area?.name ?? "");
  const [items, setItems] = useState<Id<"invItems">[]>(area?.items ?? []);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(data.items.map((i) => [i._id as string, i])), [data.items]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.items
      .filter((i) => i.active && !items.includes(i._id))
      .filter((i) => !s || i.name.toLowerCase().includes(s))
      .slice(0, 30);
  }, [q, data.items, items]);
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) {
        return list;
      }
      const a = next.at(i);
      const b = next.at(j);
      if (a && b) {
        next[i] = b;
        next[j] = a;
      }
      return next;
    });
  const save = async () => {
    const id = await sendPos(api.inv.saveArea, { company, id: area?._id, name, items });
    if (id) {
      onClose();
    }
  };
  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={!name.trim()} onClick={save}>
          Salvar área
        </Button>
      }
      onClose={onClose}
      open
      subtitle="Adicione os itens na ordem em que estão nas prateleiras."
      title={area ? area.name : "Nova área"}
    >
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Field label="Nome">
          <Input onChange={(e) => setName(e.target.value)} placeholder="Ex.: Back bar" value={name} />
        </Field>
        <div className="space-y-2">
          <p className="font-medium text-sm">Itens desta área ({items.length})</p>
          {items.length ? (
            <ol className="divide-y rounded-xl border bg-card">
              {items.map((id, i) => (
                <li className="flex items-center gap-2 px-3 py-2 text-sm" key={id}>
                  <span className="w-6 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{byId.get(id)?.name ?? "Item"}</span>
                  <button aria-label="Subir" className="px-1" onClick={() => move(i, -1)} type="button">
                    ↑
                  </button>
                  <button aria-label="Descer" className="px-1" onClick={() => move(i, 1)} type="button">
                    ↓
                  </button>
                  <button
                    aria-label="Tirar da área"
                    className="px-1 text-muted-foreground"
                    onClick={() => setItems((l) => l.filter((x) => x !== id))}
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
        <div className="space-y-2">
          <Input onChange={(e) => setQ(e.target.value)} placeholder="Adicionar item…" value={q} />
          <ul className="divide-y rounded-xl border bg-card">
            {hits.map((i) => (
              <li key={i._id}>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() => setItems((l) => [...l, i._id])}
                  type="button"
                >
                  + {i.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FullPage>
  );
}
