"use client";

import { useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { sendPos, useCompanies, useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import {
  CARD,
  dateText,
  Field,
  type InvItem,
  type InvOverview,
  NumberInput,
  Pill,
  qtyText,
  SELECT,
  useMoney,
} from "./shared";

/** The ledger of this bar, and manual movements (waste, adjust, transfer). */

const KIND_LABEL: Record<Doc<"invMoves">["kind"], string> = {
  opening: "Estoque inicial",
  purchase: "Compra",
  sale: "Venda",
  waste: "Perda",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  count: "Contagem",
  adjust: "Ajuste",
};

export function MovesSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const fmt = useMoney();
  const moves = usePosQuery(api.inv.moves, { company, limit: 300 });
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("");
  const byId = useMemo(() => new Map(data.items.map((i) => [i._id as string, i])), [data.items]);
  const shown = (moves ?? []).filter((m) => !kind || m.kind === kind);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
          <Pill active={!kind} onClick={() => setKind("")}>
            Todos
          </Pill>
          {(["waste", "count", "transfer_in", "transfer_out", "adjust", "opening"] as const).map((k) => (
            <Pill active={kind === k} key={k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </Pill>
          ))}
        </div>
        <Button onClick={() => setAdding(true)}>Lançar movimento</Button>
      </div>
      {moves === undefined ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : shown.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {shown.map((m) => {
            const item = byId.get(m.itemId);
            return (
              <li className="flex items-start gap-3 px-4 py-3" key={m._id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item?.name ?? "Item"}</p>
                  <p className="text-muted-foreground text-xs">
                    {KIND_LABEL[m.kind]} · {dateText(m.at)} · {m.userName}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  <p className={cn("font-medium", m.qty < 0 ? "text-destructive" : "text-emerald-600")}>
                    {m.qty > 0 ? "+" : ""}
                    {item ? qtyText(m.qty, item) : m.qty}
                  </p>
                  {data.seeCosts && m.unitCost ? (
                    <p className="text-muted-foreground text-xs">{fmt(m.qty * m.unitCost)}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>Nenhum movimento ainda.</p>
      )}
      {adding ? <MoveDialog data={data} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

type Kind = "waste" | "transfer" | "adjust" | "opening";

const WASTE_REASONS = ["Quebra", "Derramado", "Vencido", "Consumo da equipe", "Cortesia", "Erro de preparo"];

function MoveDialog({ data, onClose }: { data: InvOverview; onClose: () => void }) {
  const company = useCompany();
  const companies = useCompanies();
  const [kind, setKind] = useState<Kind>("waste");
  const [q, setQ] = useState("");
  const [item, setItem] = useState<InvItem | null>(null);
  const [containers, setContainers] = useState<number | undefined>(undefined);
  const [base, setBase] = useState<number | undefined>(undefined);
  const [negative, setNegative] = useState(false);
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const others = (data.group?.companies ?? []).filter((c) => c !== company);
  const nameOf = (key: string) => companies?.find((c) => c.key === key)?.name ?? key;
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? data.items.filter((i) => i.active && i.name.toLowerCase().includes(s)).slice(0, 8) : [];
  }, [q, data.items]);
  const qty = item ? (containers ?? 0) * (item.unit === "un" ? 1 : item.size) + (base ?? 0) : 0;

  const save = async () => {
    if (!item || qty <= 0) {
      return;
    }
    setBusy(true);
    const ok =
      kind === "transfer"
        ? await sendPos(api.inv.transfer, { from: company, to, itemId: item._id, qty, note })
        : await sendPos(api.inv.addMove, {
            company,
            itemId: item._id,
            kind,
            qty: kind === "adjust" && negative ? -qty : qty,
            note,
          });
    setBusy(false);
    if (ok !== undefined) {
      onClose();
    }
  };

  return (
    <FullPage
      footer={
        <Button
          className="w-full"
          disabled={busy || !item || qty <= 0 || (kind === "transfer" && !to) || (kind !== "opening" && !note.trim())}
          onClick={save}
        >
          Lançar {item && qty > 0 ? `· ${qtyText(qty, item)}` : ""}
        </Button>
      }
      onClose={onClose}
      open
      title="Lançar movimento"
    >
      <div className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill active={kind === "waste"} onClick={() => setKind("waste")}>
            Perda
          </Pill>
          {others.length ? (
            <Pill active={kind === "transfer"} onClick={() => setKind("transfer")}>
              Transferir para outro bar
            </Pill>
          ) : null}
          <Pill active={kind === "adjust"} onClick={() => setKind("adjust")}>
            Ajuste
          </Pill>
          <Pill active={kind === "opening"} onClick={() => setKind("opening")}>
            Estoque inicial
          </Pill>
        </div>

        {item ? (
          <div className={cn(CARD, "flex items-center justify-between")}>
            <div>
              <p className="font-medium text-sm">{item.name}</p>
              <p className="text-muted-foreground text-xs">Saldo: {qtyText(item.qty, item)}</p>
            </div>
            <button className="text-sm underline" onClick={() => setItem(null)} type="button">
              Trocar
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Input autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Buscar item…" value={q} />
            {hits.length ? (
              <ul className="divide-y rounded-xl border bg-card">
                {hits.map((i) => (
                  <li key={i._id}>
                    <button className="w-full px-3 py-2 text-left text-sm" onClick={() => setItem(i)} type="button">
                      {i.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {item ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={item.unit === "un" ? "Unidades" : `${item.container}s`}>
              <NumberInput onChange={setContainers} value={containers} />
            </Field>
            {item.unit !== "un" ? (
              <Field label={`+ ${item.unit}`}>
                <NumberInput onChange={setBase} value={base} />
              </Field>
            ) : null}
          </div>
        ) : null}

        {kind === "adjust" ? (
          <div className="flex gap-1.5">
            <Pill active={!negative} onClick={() => setNegative(false)}>
              Entrada (+)
            </Pill>
            <Pill active={negative} onClick={() => setNegative(true)}>
              Saída (−)
            </Pill>
          </div>
        ) : null}

        {kind === "transfer" ? (
          <Field label="Para">
            <select className={SELECT} onChange={(e) => setTo(e.target.value)} value={to}>
              <option value="">Escolha o bar…</option>
              {others.map((c) => (
                <option key={c} value={c}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {kind !== "opening" ? (
          <Field label="Motivo">
            {kind === "waste" ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {WASTE_REASONS.map((r) => (
                  <Pill active={note === r} key={r} onClick={() => setNote(r)}>
                    {r}
                  </Pill>
                ))}
              </div>
            ) : null}
            <Input onChange={(e) => setNote(e.target.value)} placeholder="Descreva" value={note} />
          </Field>
        ) : null}
      </div>
    </FullPage>
  );
}
