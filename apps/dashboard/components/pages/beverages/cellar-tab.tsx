"use client";

import { useMemo, useRef, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  MetricTile,
  type MetricTone,
} from "@/components/dashboard/metric-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALERT_LABEL,
  type MarginAlert,
  marginAlert,
  PRICE_BANDS,
  priceMargin,
} from "@/lib/cellar/margins";
import { importNotionWines } from "@/lib/cellar/notion";
import {
  blankWine,
  setCellarSettings,
  upsertWines,
  useCellar,
} from "@/lib/cellar/store";
import { CELLAR_STYLES, type CellarWine, styleLabel } from "@/lib/cellar/types";
import {
  ALL,
  type CellarFilter,
  cellarStats,
  filterWines,
  formatPct,
  type GroupBy,
  groupWines,
} from "@/lib/cellar/view";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { thumbnail } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { FilterSelect, rowProps, SearchInput } from "./bev-shared";
import { WineSheet, WineThumb } from "./wine-sheet";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Sem agrupar" },
  { value: "style", label: "Agrupar por estilo" },
  { value: "grape", label: "Agrupar por uva" },
  { value: "country", label: "Agrupar por país" },
  { value: "price", label: "Agrupar por preço" },
];

const ALERT_TONE: Record<MarginAlert, string> = {
  "no-cost": "text-warning",
  "no-price": "text-muted-foreground",
  low: "text-destructive",
  ok: "text-success",
};

const EMPTY_FILTER: CellarFilter = {
  query: "",
  style: ALL,
  grape: ALL,
  country: ALL,
  band: ALL,
};

const options = (all: string, values: string[]) => [
  { value: ALL, label: all },
  ...values.map((v) => ({ value: v, label: v })),
];

function marginTone(avg: number | null, min: number): MetricTone {
  if (avg === null) {
    return "neutral";
  }
  return avg >= min ? "good" : "warn";
}

/** Reads a Notion export and adds/refreshes the wines of the cellar. */
async function importFiles(files: File[], defaultVat: number) {
  const result = await importNotionWines(files, defaultVat);
  // Bottle photos of the export become small thumbnails
  for (const w of result.wines) {
    const bytes = result.media.get(w.origin || w.name);
    if (bytes && !w.imageUrl) {
      w.imageUrl = await thumbnail(bytes, 240, "image/jpeg").catch(() => "");
    }
  }
  if (result.wines.length === 0) {
    return "Nenhum vinho encontrado. Exporte o banco de vinhos do Notion em “Markdown & CSV” e envie o .zip (ou o .csv / páginas .md).";
  }
  const { added, updated } = upsertWines(result.wines);
  return `${added} vinho(s) novo(s), ${updated} atualizado(s) a partir do Notion.`;
}

function SettingsRow({
  currency,
  vat,
  minMargin,
}: {
  currency: string;
  vat: number;
  minMargin: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs sm:ml-auto">
      <Label htmlFor="cellar-currency">Moeda</Label>
      <Input
        className="h-8 w-16 uppercase"
        id="cellar-currency"
        maxLength={3}
        onChange={(e) =>
          setCellarSettings({ currency: e.target.value.toUpperCase() })
        }
        value={currency}
      />
      <Label htmlFor="cellar-vat">IVA %</Label>
      <Input
        className="h-8 w-14"
        id="cellar-vat"
        inputMode="decimal"
        onChange={(e) =>
          setCellarSettings({ defaultVat: Number(e.target.value) || 0 })
        }
        value={vat}
      />
      <Label htmlFor="cellar-margin">Margem mín. %</Label>
      <Input
        className="h-8 w-14"
        id="cellar-margin"
        inputMode="decimal"
        onChange={(e) =>
          setCellarSettings({ minMargin: Number(e.target.value) || 0 })
        }
        value={minMargin}
      />
    </div>
  );
}

function WineRow({
  wine,
  money,
  minMargin,
  onOpen,
}: {
  wine: CellarWine;
  money: (v: number | null) => string;
  minMargin: number;
  onOpen: () => void;
}) {
  const m = priceMargin(wine.priceDineIn, wine.cost, wine.vatRate);
  const alert = marginAlert(wine, minMargin);
  return (
    <tr {...rowProps(onOpen)}>
      <td className="py-2">
        <div className="flex items-center gap-2.5">
          <WineThumb className="h-10 w-6" src={wine.imageUrl} />
          <div className="min-w-0">
            <p className="font-medium">
              {wine.name}{" "}
              <span className="text-muted-foreground">
                {wine.vintage ?? ""}
              </span>
            </p>
            <p className="text-muted-foreground text-xs">
              {[styleLabel(wine.style), wine.wineId, wine.tapCode]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      </td>
      <td className="py-2 text-muted-foreground">
        {wine.grapes.join(", ") || "—"}
      </td>
      <td className="py-2 text-muted-foreground">
        {[wine.region, wine.country].filter(Boolean).join(", ") || "—"}
      </td>
      <td className="py-2 text-right tabular-nums">{money(wine.cost)}</td>
      <td className="py-2 text-right tabular-nums">
        {money(wine.priceDineIn)}
      </td>
      <td className="py-2 text-right tabular-nums">{money(wine.priceGlass)}</td>
      <td
        className={cn(
          "py-2 text-right font-medium tabular-nums",
          ALERT_TONE[alert]
        )}
      >
        {formatPct(m?.margin)}
      </td>
      <td className={cn("py-2 pl-4 text-xs", ALERT_TONE[alert])}>
        {ALERT_LABEL[alert]}
      </td>
    </tr>
  );
}

function WineTable({
  wines,
  money,
  minMargin,
  onOpen,
}: {
  wines: CellarWine[];
  money: (v: number | null) => string;
  minMargin: number;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="py-2 text-left font-normal">Vinho</th>
            <th className="py-2 text-left font-normal">Uvas</th>
            <th className="py-2 text-left font-normal">Origem</th>
            <th className="py-2 text-right font-normal">Custo s/ IVA</th>
            <th className="py-2 text-right font-normal">Garrafa</th>
            <th className="py-2 text-right font-normal">Taça/Takeaway</th>
            <th className="py-2 text-right font-normal">Margem</th>
            <th className="py-2 pl-4 text-left font-normal">Alerta</th>
          </tr>
        </thead>
        <tbody>
          {wines.map((w) => (
            <WineRow
              key={w.id}
              minMargin={minMargin}
              money={money}
              onOpen={() => onOpen(w.id)}
              wine={w}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Adega: the wine catalog imported from Notion (or typed in), searchable
 * by grape, origin, style and price, with margins from invoice costs.
 */
export function CellarTab() {
  const cellar = useCellar();
  const { wines, currency, minMargin } = cellar;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<CellarFilter>(EMPTY_FILTER);
  const [groupBy, setGroupBy] = useState<GroupBy>("style");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const money = (v: number | null) =>
    v === null ? "—" : formatMoney(v, currency);
  const setF = (patch: Partial<CellarFilter>) =>
    setFilter((f) => ({ ...f, ...patch }));

  const grapes = useMemo(
    () => [...new Set(wines.flatMap((w) => w.grapes))].sort(),
    [wines]
  );
  const countries = useMemo(
    () => [...new Set(wines.map((w) => w.country).filter(Boolean))].sort(),
    [wines]
  );
  const groups = useMemo(
    () => groupWines(filterWines(wines, filter), groupBy),
    [wines, filter, groupBy]
  );
  const stats = useMemo(
    () => cellarStats(wines, minMargin),
    [wines, minMargin]
  );

  async function onImport(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await importFiles([...files], cellar.defaultVat));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setBusy(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  function addWine() {
    const w = blankWine({ name: "Novo vinho" });
    upsertWines([w]);
    setSelectedId(w.id);
  }

  const importButton = (
    <Button disabled={busy} onClick={() => fileRef.current?.click()}>
      <Icon className="size-4" name={busy ? "IconLoader" : "IconImport"} />
      {busy ? "Importando…" : "Importar do Notion"}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          accept=".zip,.csv,.md,text/csv,text/markdown,application/zip"
          className="hidden"
          multiple
          onChange={(e) => onImport(e.target.files)}
          ref={fileRef}
          type="file"
        />
        {importButton}
        <Button onClick={addWine} variant="outline">
          <Icon className="size-4" name="IconPlusSmall" />
          Novo vinho
        </Button>
        <SettingsRow
          currency={currency}
          minMargin={minMargin}
          vat={cellar.defaultVat}
        />
      </div>
      {notice ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint={`${stats.grapes} uvas · ${stats.countries} países`}
          icon="IconGlass"
          label="Rótulos na adega"
          value={String(stats.total)}
        />
        <MetricTile
          hint={`Meta ≥ ${minMargin}% sobre o preço sem IVA`}
          icon="IconChart3"
          label="Margem média (garrafa)"
          tone={marginTone(stats.avgMargin, minMargin)}
          value={formatPct(stats.avgMargin)}
        />
        <MetricTile
          hint="Custo vem das notas fiscais (EAN ou nome)"
          icon="IconReceiptBill"
          label="Sem custo"
          tone={stats.noCost ? "warn" : "good"}
          value={String(stats.noCost)}
        />
        <MetricTile
          hint="Abaixo da margem mínima"
          icon="IconWarningSign"
          label="Margem baixa"
          tone={stats.low ? "bad" : "good"}
          value={String(stats.low)}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          onChange={(query) => setF({ query })}
          placeholder="Buscar vinho, uva, país, EAN ou harmonização"
          value={filter.query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todos os estilos" },
            ...CELLAR_STYLES.map((s) => ({ value: s.value, label: s.label })),
          ]}
          onChange={(style) => setF({ style })}
          value={filter.style}
        />
        <FilterSelect
          items={options("Todas as uvas", grapes)}
          onChange={(grape) => setF({ grape })}
          value={filter.grape}
        />
        <FilterSelect
          items={options("Todos os países", countries)}
          onChange={(country) => setF({ country })}
          value={filter.country}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todos os preços" },
            ...PRICE_BANDS.map((b) => ({ value: b.value, label: b.label })),
          ]}
          onChange={(band) => setF({ band })}
          value={filter.band}
        />
        <FilterSelect
          items={GROUPS}
          onChange={(v) => setGroupBy(v as GroupBy)}
          value={groupBy}
        />
      </div>

      {wines.length === 0 ? (
        <ChartCard
          description="Exporte o banco de vinhos do Notion (⋯ → Exportar → Markdown & CSV, incluir subpáginas) e envie o .zip aqui. Também aceita o .csv ou páginas .md soltas."
          title="Adega vazia"
        >
          {importButton}
        </ChartCard>
      ) : (
        groups.map((g) => (
          <ChartCard
            description={`${g.wines.length} rótulo(s)`}
            key={g.key}
            title={g.title || "Carta de vinhos"}
          >
            <WineTable
              minMargin={minMargin}
              money={money}
              onOpen={setSelectedId}
              wines={g.wines}
            />
          </ChartCard>
        ))
      )}

      <WineSheet
        currency={currency}
        minMargin={minMargin}
        onClose={() => setSelectedId(null)}
        wine={wines.find((w) => w.id === selectedId) ?? null}
      />
    </div>
  );
}
