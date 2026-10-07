"use client";

import { Icon } from "@/lib/icons";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { flows, merchantName } from "@/lib/personal-finance/analytics";
import { CATEGORIES } from "@/lib/personal-finance/categorize";
import { money, shortDate } from "@/lib/personal-finance/format";
import { setCategory } from "@/lib/personal-finance/store";
import type { CategoryId, Txn } from "@/lib/personal-finance/types";
import { cn } from "@/lib/utils";

const PAGE = 40;
const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

function TxnRow({ t, currency }: { t: Txn; currency: string }) {
  const f = flows(t);
  const positive = t.amount > 0;
  const cat = CATEGORIES[t.category];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: cat.color }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">
          {merchantName(t.description)}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {shortDate(t.date)}
          {t.pending ? " · pendente" : ""}
          {t.account === "pocket" ? " · cofrinho" : ""}
          <span aria-hidden>·</span>
          <select
            aria-label="Categoria"
            className="field-sizing-content max-w-44 cursor-pointer truncate rounded bg-transparent hover:text-foreground"
            onChange={(e) => setCategory(t.id, e.target.value as CategoryId)}
            value={t.category}
          >
            {CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {CATEGORIES[id].label}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={cn(
            "font-medium text-sm tabular-nums",
            positive && "text-success",
            t.internal && "text-muted-foreground"
          )}
        >
          {positive ? "+" : "−"}
          {money(positive ? f.in : f.out, t.currency || currency)}
        </span>
        {t.fee > 0 ? (
          <span className="text-muted-foreground text-xs">
            taxa {money(t.fee, t.currency || currency)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function Transactions({
  txns,
  currency,
  category,
  onCategory,
}: {
  txns: Txn[];
  currency: string;
  category: CategoryId | null;
  onCategory: (c: CategoryId | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [showInternal, setShowInternal] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns
      .filter(
        (t) =>
          (showInternal || !t.internal) &&
          (!category || t.category === category) &&
          (!q || t.description.toLowerCase().includes(q))
      )
      .reverse();
  }, [txns, query, showInternal, category]);

  return (
    <ChartCard
      action={
        <span className="flex items-center gap-2 text-muted-foreground text-xs">
          <Switch
            aria-label="Mostrar movimentações dos cofrinhos"
            checked={showInternal}
            onCheckedChange={setShowInternal}
          />
          Cofrinhos
        </span>
      }
      description={`${rows.length} lançamentos`}
      title="Transações"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            name="IconMagnifyingGlass"
          />
          <Input
            className="pl-8"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar por descrição…"
            value={query}
          />
        </div>
        {category ? (
          <Button onClick={() => onCategory(null)} size="sm" variant="outline">
            {CATEGORIES[category].label}
            <Icon className="size-3.5" name="IconCrossSmall" />
          </Button>
        ) : null}
      </div>
      <ul className="mt-2 divide-y">
        {rows.slice(0, limit).map((t) => (
          <TxnRow currency={currency} key={t.id} t={t} />
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Nenhuma transação encontrada.
        </p>
      ) : null}
      {rows.length > limit ? (
        <Button
          className="mt-2 w-full"
          onClick={() => setLimit((l) => l + PAGE * 2)}
          variant="ghost"
        >
          Mostrar mais ({rows.length - limit})
        </Button>
      ) : null}
    </ChartCard>
  );
}
