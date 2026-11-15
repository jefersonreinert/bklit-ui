"use client";

import { useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { sendPos, useCompanies, useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CARD, Tag, useMoney } from "./shared";

/**
 * Rolling stock control out to every bar of the group: where each bar
 * is (areas, opening count, sheets linked to its menu, sales, invoices,
 * levels, first variance) and shortcuts for this bar: copy the areas of
 * a bar already set up, link the group's sheets to this bar's menu.
 */

export function RolloutSection() {
  const company = useCompany();
  const companies = useCompanies();
  const fmt = useMoney();
  const s = usePosQuery(api.rollout.status, { company });
  const [linking, setLinking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const nameOf = (key: string) => companies?.find((c) => c.key === key)?.name ?? key;

  if (s === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const bars = s?.bars ?? [];
  const sources = bars.filter((b) => b.company !== company && b.steps.find((x) => x.key === "areas")?.done);
  const copy = async (from: string) => {
    const n = await sendPos(api.rollout.copyAreas, { from, to: company });
    if (n !== undefined) {
      setMsg(n ? `${n} área(s) copiada(s) do ${nameOf(from)}.` : "Este bar já tem essas áreas.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        O catálogo de itens e as fichas são do grupo: cada bar precisa só das próprias áreas, da contagem
        de abertura, das fichas ligadas ao seu cardápio e das vendas entrando.
      </p>
      {msg ? <p className={cn(CARD, "text-sm")}>{msg}</p> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {bars.map((b) => {
          const here = b.company === company;
          return (
            <div className={cn(CARD, "space-y-3", here && "border-foreground/30")} key={b.company}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{nameOf(b.company)}</p>
                  <p className="text-muted-foreground text-xs">
                    {b.done} de {b.steps.length} passos
                    {b.stockValue !== null ? ` · estoque ${fmt(b.stockValue)}` : ""}
                  </p>
                </div>
                {here ? <Tag tone="muted">este bar</Tag> : null}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(b.done / b.steps.length) * 100}%` }} />
              </div>
              <ol className="space-y-1.5">
                {b.steps.map((st) => (
                  <li className="flex gap-2 text-sm" key={st.key}>
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        st.done ? "border-emerald-500 bg-emerald-500 text-white" : b.next?.key === st.key ? "border-amber-500" : "text-muted-foreground"
                      )}
                    >
                      {st.done ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className={cn(b.next?.key === st.key && "font-medium")}>{st.label}</span>
                      <span className="block text-muted-foreground text-xs">{st.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {here ? (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {sources.map((src) => (
                    <Button key={src.company} onClick={() => copy(src.company)} size="sm" variant="outline">
                      Copiar áreas do {nameOf(src.company)}
                    </Button>
                  ))}
                  <Button onClick={() => setLinking(true)} size="sm" variant="outline">
                    Ligar fichas do grupo ao cardápio
                  </Button>
                </div>
              ) : (
                <p className="border-t pt-3 text-muted-foreground text-xs">
                  Para continuar, troque para o {nameOf(b.company)} no seletor de bar do POS.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {linking ? <LinkRecipes onClose={() => setLinking(false)} /> : null}
    </div>
  );
}

function LinkRecipes({ onClose }: { onClose: () => void }) {
  const company = useCompany();
  const matches = usePosQuery(api.rollout.recipeLinks, { company });
  const [off, setOff] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = (matches ?? []).filter((m) => !off.has(m.productId));
  const apply = async () => {
    setBusy(true);
    const n = await sendPos(api.rollout.applyRecipeLinks, {
      company,
      links: picked.map((m) => ({ productId: m.productId, recipeId: m.recipeId })),
    });
    setBusy(false);
    if (n !== undefined) {
      setDone(n);
    }
  };
  return (
    <FullPage
      footer={
        done === null ? (
          <Button className="w-full" disabled={busy || !picked.length} onClick={apply}>
            Ligar {picked.length} produtos
          </Button>
        ) : (
          <Button className="w-full" onClick={onClose}>
            Pronto
          </Button>
        )
      }
      onClose={onClose}
      open
      subtitle="Produtos deste bar com o mesmo nome (ou quase) de uma ficha que já existe no grupo. Desmarque o que não for a mesma receita."
      title="Ligar fichas ao cardápio deste bar"
    >
      <div className="mx-auto max-w-xl space-y-3 p-4">
        {done !== null ? (
          <p className={cn(CARD, "text-sm")}>
            {done} produtos ligados. Os que sobraram precisam de ficha própria: use “Criar do cardápio” em
            Fichas.
          </p>
        ) : matches === undefined ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : matches?.length ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {matches.map((m) => (
              <li key={m.productId}>
                <label className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    checked={!off.has(m.productId)}
                    onChange={() =>
                      setOff((s) => {
                        const next = new Set(s);
                        if (next.has(m.productId)) {
                          next.delete(m.productId);
                        } else {
                          next.add(m.productId);
                        }
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{m.product}</span>
                    <span className="block text-muted-foreground text-xs">→ ficha {m.recipe}</span>
                  </span>
                  {m.score < 1 ? <Tag tone="warn">{Math.round(m.score * 100)}%</Tag> : null}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
            Nenhum produto deste bar parece com uma ficha do grupo ainda. Crie as fichas em Fichas.
          </p>
        )}
      </div>
    </FullPage>
  );
}
