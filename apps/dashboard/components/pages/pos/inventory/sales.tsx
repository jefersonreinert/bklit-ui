"use client";

import type { FunctionReturnType } from "convex/server";
import { useMemo, useRef, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describeQty, invCategoryLabel } from "@/lib/inventory/units";
import { type SoldLine, salesFromCsv } from "@/lib/inventory/usage";
import { sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CARD, dateText, Field, type InvOverview, num, Pill, Tag, useMoney } from "./shared";

/**
 * Sales → stock: where sales come from (this app's POS, Lightspeed, the
 * wine dispensers, or a file), what sold without a technical sheet (and
 * linking it), and the variance a count finds after the sales.
 */

type Status = FunctionReturnType<typeof api.sales.status>;
type Missing = Status["missing"][number];

const SOURCE_LABEL: Record<string, string> = {
  pos: "POS do app",
  ls: "Lightspeed",
  wm: "Máquinas de vinho",
  csv: "Arquivo",
};

export function SalesSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const status = usePosQuery(api.sales.status, { company, days: 7 });
  const recipes = usePosQuery(api.recipes.list, { company });
  const [linking, setLinking] = useState<Missing | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (status === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const reprocess = async (days: number) => {
    setBusy(true);
    const ok = await sendPos(api.sales.reprocess, { company, days });
    setBusy(false);
    setDone(ok !== undefined ? `Relendo as vendas dos últimos ${days} dias. Leva alguns minutos.` : null);
  };

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "space-y-3")}>
        <div>
          <p className="font-medium">De onde vêm as vendas</p>
          <p className="text-muted-foreground text-sm">
            A cada 5 minutos as vendas novas baixam do estoque o que as fichas técnicas dizem.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-3">
          {(status?.sources ?? []).map((s) => {
            const ls = s.source === "ls";
            const off = ls && !status?.lightspeed.some((l) => l.enabled);
            return (
              <li className="rounded-xl border p-3" key={s.source}>
                <p className="font-medium text-sm">{SOURCE_LABEL[s.source]}</p>
                <p className="text-muted-foreground text-xs">
                  {off
                    ? "Não conectado: use a importação de arquivo abaixo"
                    : s.at
                      ? `Lido até ${dateText(s.at)}`
                      : "Começa na próxima leitura"}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => reprocess(7)} size="sm" variant="outline">
            Reler os últimos 7 dias
          </Button>
          <Button disabled={busy} onClick={() => reprocess(31)} size="sm" variant="outline">
            Reler 31 dias
          </Button>
          {done ? <span className="text-muted-foreground text-sm">{done}</span> : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Reler não conta nada duas vezes: só entra o que ganhou ficha desde a última leitura.
        </p>
      </div>

      <div className={cn(CARD, "space-y-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Vendido sem ficha (7 dias)</p>
          {status?.missing.length ? <Tag tone="warn">{status.missing.length}</Tag> : null}
        </div>
        {status?.missing.length ? (
          <>
            <p className="text-muted-foreground text-sm">
              Estes itens venderam mas não baixaram nada do estoque. Ligue cada um a uma ficha (ou o
              vinho da máquina à garrafa) e depois releia os dias.
            </p>
            <ul className="divide-y">
              {status.missing.map((m) => (
                <li className="flex items-center gap-3 py-2" key={`${m.source}:${m.key}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{m.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {SOURCE_LABEL[m.source]} · {m.source === "wm" ? `${num(m.qty, 0)} ml` : `${num(m.qty)} vendidos`}
                    </p>
                  </div>
                  <Button onClick={() => setLinking(m)} size="sm" variant="outline">
                    Ligar
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Tudo o que vendeu tem ficha.</p>
        )}
      </div>

      <CsvImport />

      {linking && recipes ? (
        <LinkDialog data={data} missing={linking} onClose={() => setLinking(null)} recipes={recipes.recipes} />
      ) : null}
    </div>
  );
}

function LinkDialog({
  missing,
  data,
  recipes,
  onClose,
}: {
  missing: Missing;
  data: InvOverview;
  recipes: FunctionReturnType<typeof api.recipes.list>["recipes"];
  onClose: () => void;
}) {
  const company = useCompany();
  const [q, setQ] = useState(missing.name.split(" ").slice(0, 2).join(" "));
  const wine = missing.source === "wm";
  const s = q.trim().toLowerCase();
  const options = wine
    ? data.items
        .filter((i) => i.active && i.unit === "ml" && (!s || i.name.toLowerCase().includes(s)))
        .map((i) => ({ id: i._id as string, name: i.name, item: true }))
    : recipes
        .filter((r) => r.active && r.kind === "menu" && (!s || r.name.toLowerCase().includes(s)))
        .map((r) => ({ id: r._id as string, name: r.name, item: false }));
  const pick = async (o: { id: string; item: boolean }) => {
    const ok = await sendPos(api.sales.link, {
      company,
      source: missing.source,
      key: missing.key,
      name: missing.name,
      ...(o.item ? { itemId: o.id as Id<"invItems"> } : { recipeId: o.id as Id<"invRecipes"> }),
    });
    if (ok !== undefined) {
      onClose();
    }
  };
  return (
    <FullPage
      onClose={onClose}
      open
      subtitle={`${SOURCE_LABEL[missing.source]}: ${missing.name}`}
      title={wine ? "Qual garrafa é este vinho?" : "Qual ficha é esta venda?"}
    >
      <div className="mx-auto max-w-xl space-y-2 p-4">
        <Input autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" value={q} />
        <ul className="divide-y rounded-2xl border bg-card">
          {options.slice(0, 50).map((o) => (
            <li key={o.id}>
              <button className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/40" onClick={() => pick(o)} type="button">
                {o.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          {wine
            ? "Cada dose da máquina baixa os ml exatos desta garrafa."
            : "Não achou? Crie a ficha em Fichas (ou use “Criar do cardápio”) e volte aqui."}
        </p>
      </div>
    </FullPage>
  );
}

function CsvImport() {
  const company = useCompany();
  const imports = usePosQuery(api.sales.imports, { company });
  const picker = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<{ name: string; lines: SoldLine[] } | null>(null);
  const [date, setDate] = useState(() => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ posted: number; missing: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (f: File | undefined) => {
    setError(null);
    setResult(null);
    if (!f) {
      return;
    }
    const { lines, columns } = salesFromCsv(await f.text());
    if (!columns) {
      setError("Não achei as colunas de produto e quantidade. Exporte “vendas por produto” em CSV.");
      setFile(null);
    } else {
      setFile({ name: f.name, lines });
    }
    if (picker.current) {
      picker.current.value = "";
    }
  };
  const send = async () => {
    if (!file) {
      return;
    }
    setBusy(true);
    const r = await sendPos(api.sales.importCsv, { company, date, fileName: file.name, lines: file.lines });
    setBusy(false);
    if (r) {
      setResult(r);
      setFile(null);
    }
  };
  const total = file?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;

  return (
    <div className={cn(CARD, "space-y-3")}>
      <div>
        <p className="font-medium">Importar vendas de um arquivo</p>
        <p className="text-muted-foreground text-sm">
          Enquanto o Lightspeed não está conectado: exporte o relatório de vendas por produto do dia
          (CSV) e envie aqui. Não importe o mesmo dia duas vezes.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Dia das vendas">
          <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
        </Field>
        <Button onClick={() => picker.current?.click()} variant="outline">
          Escolher CSV
        </Button>
        <input accept=".csv,text/csv" className="hidden" onChange={(e) => read(e.target.files?.[0])} ref={picker} type="file" />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {file ? (
        <div className="space-y-2">
          <p className="text-sm">
            {file.name}: {file.lines.length} produtos, {num(total)} vendidos.
          </p>
          <ul className="max-h-48 divide-y overflow-auto rounded-xl border text-sm">
            {file.lines.slice(0, 100).map((l, i) => (
              <li className="flex justify-between px-3 py-1.5" key={`${l.sku}-${l.name}-${i}`}>
                <span className="truncate">{l.name || l.sku}</span>
                <span className="tabular-nums">{num(l.qty)}</span>
              </li>
            ))}
          </ul>
          <Button disabled={busy} onClick={send}>
            Importar vendas de {date}
          </Button>
        </div>
      ) : null}
      {result ? (
        <p className="text-sm">
          {result.posted} linhas baixaram estoque.
          {result.missing.length
            ? ` ${result.missing.length} sem ficha: ligue-as acima e use “Lançar o resto” na importação.`
            : ""}
        </p>
      ) : null}
      {imports?.length ? (
        <ul className="divide-y text-sm">
          {imports.map((imp) => (
            <li className="flex items-center justify-between gap-2 py-2" key={imp._id}>
              <span>
                {imp.date} · {imp.fileName} · {imp.lines} produtos
                {imp.open.length ? <Tag tone="warn">{imp.open.length} sem ficha</Tag> : null}
              </span>
              {imp.open.length ? (
                <Button onClick={() => sendPos(api.sales.postImport, { id: imp._id })} size="sm" variant="outline">
                  Lançar o resto
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* --------------------------------- variance ------------------------------- */

export function VarianceSection() {
  const company = useCompany();
  const fmt = useMoney();
  const [countId, setCountId] = useState<Id<"invCounts"> | undefined>(undefined);
  const v = usePosQuery(api.sales.variance, { company, countId });
  const [cat, setCat] = useState("");
  const rows = useMemo(() => (v?.rows ?? []).filter((r) => !cat || r.category === cat), [v, cat]);
  if (v === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (!v?.period) {
    return (
      <p className={cn(CARD, "text-sm")}>
        A variância aparece depois de duas contagens fechadas: a primeira é o estoque de abertura, a
        segunda mostra o que sumiu sem venda no meio.
      </p>
    );
  }
  const usage = rows.reduce((s, r) => s + (r.usageValue ?? 0), 0);
  const lost = rows.reduce((s, r) => s + (r.varianceValue ?? 0), 0);
  const cats = [...new Set(v.rows.map((r) => r.category))];
  const qty = (n: number, r: (typeof rows)[number]) => describeQty(n, r);

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "space-y-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Variância: vendido × sumido</p>
            <p className="text-muted-foreground text-sm">
              De {v.period.start ?? "o início"} ({v.period.from ? dateText(v.period.from) : "—"}) até {v.period.end} (
              {dateText(v.period.to)}).
            </p>
          </div>
          <select
            className="h-9 rounded-lg border bg-background px-2 text-sm"
            onChange={(e) => setCountId((e.target.value || undefined) as Id<"invCounts"> | undefined)}
            value={countId ?? ""}
          >
            <option value="">Última contagem</option>
            {v.counts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {dateText(c.closedAt)}
              </option>
            ))}
          </select>
        </div>
        {rows.some((r) => r.usageValue !== null) ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Consumo pelas vendas</p>
              <p className="font-semibold tabular-nums">{fmt(usage)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Variância</p>
              <p className={cn("font-semibold tabular-nums", lost < 0 && "text-destructive")}>{fmt(lost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Variância / consumo</p>
              <p className={cn("font-semibold tabular-nums", lost < 0 && "text-destructive")}>
                {usage > 0 ? `${num((lost / usage) * 100, 1)}%` : "—"}
              </p>
            </div>
          </div>
        ) : null}
        {!v.period.complete ? (
          <p className="text-amber-600 text-xs">Período muito longo: só os primeiros 30 mil movimentos entraram.</p>
        ) : null}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
        <Pill active={!cat} onClick={() => setCat("")}>
          Todas
        </Pill>
        {cats.map((c) => (
          <Pill active={cat === c} key={c} onClick={() => setCat(c)}>
            {invCategoryLabel(c)}
          </Pill>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-normal">Item</th>
              <th className="px-3 py-2 text-right font-normal">Vendido (fichas)</th>
              <th className="px-3 py-2 text-right font-normal">Compras</th>
              <th className="px-3 py-2 text-right font-normal">Perdas</th>
              <th className="px-3 py-2 text-right font-normal">Variância</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.itemId}>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.usage ? qty(r.usage, r) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.purchases ? qty(r.purchases, r) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.waste ? qty(r.waste, r) : "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.variance < 0 && "text-destructive")}>
                  {r.variance ? qty(r.variance, r) : "—"}
                  {r.pct !== null && r.variance ? <span className="block text-xs">{num(r.pct * 100, 1)}% do vendido</span> : null}
                  {r.varianceValue ? <span className="block text-xs">{fmt(r.varianceValue)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Variância negativa = saiu do estoque mais do que as vendas explicam (dose generosa, perda não
        lançada, ficha errada ou desvio). Positiva = sobrou mais do que o esperado (venda não registrada
        ou ficha com quantidade a mais).
      </p>
    </div>
  );
}
