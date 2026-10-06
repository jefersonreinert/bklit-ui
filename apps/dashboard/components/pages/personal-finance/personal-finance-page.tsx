"use client";

import { Icon } from "@bklitui/icons";
import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  balanceSeries,
  byCategory,
  byWeekday,
  chronological,
  inRange,
  monthly,
  type PfRange,
  RANGE_LABELS,
  summarize,
  topMerchants,
} from "@/lib/personal-finance/analytics";
import { mainCurrency, money, shortDate } from "@/lib/personal-finance/format";
import {
  clearPersonalFinance,
  removeStatement,
  usePersonalFinance,
} from "@/lib/personal-finance/store";
import type { CategoryId, ImportedFile } from "@/lib/personal-finance/types";
import {
  BalanceChart,
  CategoryChart,
  MerchantsChart,
  MonthlyChart,
  WeekdayChart,
} from "./pf-charts";
import { Transactions } from "./pf-transactions";
import {
  Dropzone,
  ImportButton,
  ImportNotice,
  useStatementImport,
} from "./pf-upload";

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">
          Finanças pessoais
        </h2>
        <p className="text-muted-foreground text-sm">
          Envie o extrato do banco (PDF ou CSV) e veja para onde vai o seu
          dinheiro.
        </p>
      </div>
      {children}
    </div>
  );
}

function Files({ files }: { files: ImportedFile[] }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">Extratos importados</p>
        <Button
          onClick={() => {
            if (confirm) {
              clearPersonalFinance();
            }
            setConfirm(!confirm);
          }}
          onMouseLeave={() => setConfirm(false)}
          size="sm"
          variant={confirm ? "destructive" : "ghost"}
        >
          <Icon className="size-4" name="IconTrashCan" />
          {confirm ? "Toque de novo para apagar tudo" : "Apagar tudo"}
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {files.map((f) => (
          <li
            className="flex items-center gap-2 text-muted-foreground text-xs"
            key={f.name}
          >
            <Icon className="size-3.5" name="IconFileText" />
            <span className="min-w-0 flex-1 truncate">
              {f.name} · {f.bank} · {f.count} linhas ·{" "}
              {new Date(f.importedAt).toLocaleDateString("pt-BR")}
            </span>
            <button
              aria-label={`Remover ${f.name}`}
              className="hover:text-foreground"
              onClick={() => removeStatement(f.name)}
              type="button"
            >
              <Icon className="size-3.5" name="IconCrossSmall" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useDashboard(range: PfRange) {
  const data = usePersonalFinance();
  return useMemo(() => {
    const all = chronological(data.txns);
    const txns = inRange(all, range);
    const currency = mainCurrency(all);
    const months = monthly(txns);
    return {
      data,
      txns,
      currency,
      summary: summarize(all, txns),
      months,
      spark: months.map((m) => ({
        date: new Date(`${m.key}-01T12:00:00`),
        entradas: m.entradas,
        saidas: m.saidas,
        resultado: m.entradas - m.saidas,
      })),
      balance: balanceSeries(txns),
      categories: byCategory(txns),
      merchants: topMerchants(txns),
      weekdays: byWeekday(txns),
    };
  }, [data, range]);
}

export function PersonalFinancePage() {
  const [range, setRange] = useState<PfRange>("tudo");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const importer = useStatementImport();
  const d = useDashboard(range);
  const s = d.summary;
  const fmt = {
    style: "currency",
    currency: d.currency,
    maximumFractionDigits: 0,
  } as const;

  if (d.data.txns.length === 0) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <Header />
        <ImportNotice importer={importer} />
        <Dropzone importer={importer} />
      </div>
    );
  }

  const top = d.categories[0];
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Header>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs onValueChange={(v) => setRange(v as PfRange)} value={range}>
            <TabsList>
              {(Object.keys(RANGE_LABELS) as PfRange[]).map((r) => (
                <TabsTrigger key={r} value={r}>
                  {RANGE_LABELS[r]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ImportButton importer={importer} />
        </div>
      </Header>
      <ImportNotice importer={importer} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dataKey="conta"
          formatOptions={fmt}
          icon="IconWallet2"
          label={
            s.cofrinhos === null
              ? "Saldo da conta"
              : `Conta + cofrinhos ${money((s.conta ?? 0) + s.cofrinhos, d.currency, 0)}`
          }
          series={d.balance}
          title="Saldo atual"
          value={s.conta ?? 0}
        />
        <KpiCard
          color="var(--kpi-2)"
          dataKey="entradas"
          formatOptions={fmt}
          icon="IconArrowDownLeft"
          label={`${s.from ? shortDate(s.from) : ""} – ${s.to ? shortDate(s.to) : ""}`}
          series={d.spark}
          title="Entradas"
          value={s.entradas}
        />
        <KpiCard
          color="var(--kpi-3)"
          dataKey="saidas"
          formatOptions={fmt}
          icon="IconArrowUpRight"
          label={`Média de ${money(s.mediaDiaria, d.currency)} por dia`}
          series={d.spark}
          title="Saídas"
          value={s.saidas}
        />
        <KpiCard
          color="var(--kpi-4)"
          dataKey="resultado"
          formatOptions={fmt}
          icon="IconPiggyBank"
          label={
            top
              ? `Maior gasto: ${top.label} (${money(top.value, d.currency, 0)})`
              : "Entradas − saídas"
          }
          series={d.spark}
          title="Resultado"
          value={s.resultado}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MonthlyChart currency={d.currency} data={d.months} />
        <CategoryChart currency={d.currency} data={d.categories} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <BalanceChart currency={d.currency} data={d.balance} />
        <WeekdayChart currency={d.currency} data={d.weekdays} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MerchantsChart currency={d.currency} data={d.merchants} />
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <CategoryChips
            categories={d.categories}
            currency={d.currency}
            onPick={setCategory}
            selected={category}
          />
          <Transactions
            category={category}
            currency={d.currency}
            onCategory={setCategory}
            txns={d.txns}
          />
        </div>
      </section>

      <Files files={d.data.files} />
    </div>
  );
}

function CategoryChips({
  categories,
  currency,
  selected,
  onPick,
}: {
  categories: ReturnType<typeof byCategory>;
  currency: string;
  selected: CategoryId | null;
  onPick: (c: CategoryId | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => (
        <button
          className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-muted data-[on=true]:border-foreground"
          data-on={selected === c.id}
          key={c.id}
          onClick={() => onPick(selected === c.id ? null : c.id)}
          type="button"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: c.color }}
          />
          {c.label}
          <span className="text-muted-foreground tabular-nums">
            {money(c.value, currency, 0)}
          </span>
        </button>
      ))}
    </div>
  );
}
