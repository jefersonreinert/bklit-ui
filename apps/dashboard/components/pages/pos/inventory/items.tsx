"use client";

import { MediaPicker, MediaThumb } from "../media-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { descriptionWithSize, nameWithSize } from "@/lib/inventory/sizes";
import {
  INV_CATEGORIES,
  type InvUnit,
  invCategoryLabel,
} from "@/lib/inventory/units";
import { sendPos, useCompany, usePos } from "@/lib/pos/store";
import { onScan } from "@/lib/scan/hub";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "../scan/barcode-scanner";
import {
  CARD,
  Field,
  type InvItem,
  type InvOverview,
  NumberInput,
  Pill,
  qtyText,
  SELECT,
  Tag,
  useMoney,
} from "./shared";
import { SizeCopy } from "./size-copy";
import { WineBarcodes } from "./wine-barcodes";

/**
 * The group's stock catalog with this bar's balance: search, scan to
 * find (camera or USB/Bluetooth reader), edit an item and its bottle
 * profile, and start the catalog from the POS menu.
 */

export function ItemsSection({ data }: { data: InvOverview }) {
  const fmt = useMoney();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<InvItem | "new" | null>(null);
  const [newCode, setNewCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [barcodes, setBarcodes] = useState(false);

  const openCode = useCallback(
    (code: string) => {
      const hit = data.items.find((i) => i.barcodes.includes(code));
      if (hit) {
        setEditing(hit);
      } else {
        setNewCode(code);
        setEditing("new");
      }
    },
    [data.items]
  );

  // USB/Bluetooth readers type the code anywhere on the page
  useEffect(
    () =>
      onScan((e) => {
        if (e.source === "hid" && !editing) {
          openCode(e.code);
        }
      }),
    [openCode, editing]
  );

  const cats = useMemo(
    () => [...new Set(data.items.map((i) => i.category))].sort(),
    [data.items]
  );
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.items
      .filter((i) => i.active !== archived)
      .filter((i) => !cat || i.category === cat)
      .filter(
        (i) =>
          !s ||
          i.name.toLowerCase().includes(s) ||
          i.barcodes.some((b) => b.includes(s)) ||
          (i.sku ?? "").toLowerCase().includes(s)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.items, q, cat, archived]);

  const value = data.items.reduce(
    (s, i) => s + (i.avgCost ?? 0) * Math.max(0, i.qty),
    0
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Itens ativos</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {data.items.filter((i) => i.active).length}
          </p>
        </div>
        {data.seeCosts ? (
          <div className={CARD}>
            <p className="text-muted-foreground text-xs">Valor em estoque</p>
            <p className="mt-1 font-semibold text-xl tabular-nums">
              {fmt(value)}
            </p>
          </div>
        ) : null}
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Sem perfil de garrafa</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {
              data.items.filter((i) => i.active && i.unit !== "un" && !i.emptyG)
                .length
            }
          </p>
        </div>
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Abaixo do mínimo</p>
          <p className="mt-1 font-semibold text-destructive text-xl tabular-nums">
            {
              data.items.filter(
                (i) => i.active && i.min !== undefined && i.qty < i.min
              ).length
            }
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome, código ou SKU…"
          value={q}
        />
        <Button onClick={() => setScanning(true)} variant="outline">
          <Icon className="size-4" name="IconBarcode" />
          Escanear
        </Button>
        <Button onClick={() => setEditing("new")}>
          <Icon className="size-4" name="IconPlusLarge" />
          Novo item
        </Button>
        <Button onClick={() => setImporting(true)} variant="outline">
          Importar do POS
        </Button>
        <Button onClick={() => setBarcodes(true)} variant="outline">
          Códigos das máquinas
        </Button>
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
        <Pill active={archived} onClick={() => setArchived((v) => !v)}>
          Arquivados
        </Pill>
      </div>

      {list.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {list.map((i) => (
            <li key={i._id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setEditing(i)}
                type="button"
              >
                <MediaThumb className="size-11" image={i.image} logo={i.logo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{i.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone="muted">{invCategoryLabel(i.category)}</Tag>
                    {i.unit !== "un" && !i.emptyG ? (
                      <Tag tone="warn">sem perfil</Tag>
                    ) : null}
                    {i.min !== undefined && i.qty < i.min ? (
                      <Tag tone="warn">abaixo do mínimo</Tag>
                    ) : null}
                    {i.barcodes.length ? null : (
                      <Tag tone="muted">sem código</Tag>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "font-medium text-sm tabular-nums",
                      i.qty < 0 && "text-destructive"
                    )}
                  >
                    {qtyText(i.qty, i)}
                  </p>
                  {i.avgCost !== null && i.qty > 0 ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {fmt(i.qty * i.avgCost)}
                    </p>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          {data.items.length
            ? "Nenhum item com esse filtro."
            : "Nenhum item ainda. Importe do POS, escaneie um código ou crie o primeiro item."}
        </div>
      )}

      <BarcodeScanner
        onClose={() => setScanning(false)}
        onCode={(r) => {
          setScanning(false);
          openCode(r.code);
        }}
        open={scanning}
        title="Escanear item"
      />
      {editing ? (
        <ItemEditor
          code={editing === "new" ? newCode : ""}
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
            setNewCode("");
          }}
          seeCosts={data.seeCosts}
        />
      ) : null}
      {importing ? (
        <ImportFromPos data={data} onClose={() => setImporting(false)} />
      ) : null}
      {barcodes ? <WineBarcodes onClose={() => setBarcodes(false)} /> : null}
    </div>
  );
}

interface Draft {
  name: string;
  category: string;
  unit: InvUnit;
  size: number | undefined;
  container: string;
  barcodes: string[];
  emptyG: number | undefined;
  fullG: number | undefined;
  abv: number | undefined;
  sku: string;
  note: string;
  min: number | undefined;
  par: number | undefined;
  /** Cost of one container (the screen's unit); saved per base unit. */
  containerCost: number | undefined;
}

function draftOf(item: InvItem | null, code: string): Draft {
  const size = item?.size ?? 700;
  const per = (n: number | undefined) =>
    n === undefined ? undefined : Math.round((n / size) * 1000) / 1000;
  return {
    name: item?.name ?? "",
    category: item?.category ?? "spirits",
    unit: item?.unit ?? "ml",
    size: item?.size ?? 700,
    container: item?.container ?? "garrafa",
    barcodes: item?.barcodes ?? (code ? [code] : []),
    emptyG: item?.emptyG,
    fullG: item?.fullG,
    abv: item?.abv,
    sku: item?.sku ?? "",
    note: item?.note ?? "",
    // Levels show in containers, stored in the base unit
    min: per(item?.min),
    par: per(item?.par),
    containerCost:
      item?.avgCost !== null && item?.avgCost !== undefined && item.avgCost > 0
        ? Math.round(item.avgCost * size * 100) / 100
        : undefined,
  };
}

/** Bottles (ml) can be copied in another size. */
const copyable = (item: InvItem | null, unit: InvUnit) =>
  item !== null && unit === "ml";

const UNIT_LABEL: Record<InvUnit, string> = { ml: "ml", g: "g", un: "unidade" };

function ItemEditor({
  item,
  code,
  seeCosts,
  onClose,
}: {
  item: InvItem | null;
  code: string;
  seeCosts: boolean;
  onClose: () => void;
}) {
  const company = useCompany();
  const { settings } = usePos();
  const [d, setD] = useState<Draft>(() => draftOf(item, code));
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copying, setCopying] = useState(false);
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));
  const size = d.unit === "un" ? 1 : (d.size ?? 0);
  const weighable = d.unit !== "un";

  const save = async () => {
    setBusy(true);
    const toBase = (n: number | undefined) =>
      n === undefined ? undefined : n * size;
    const id = await sendPos(api.inv.saveItem, {
      company,
      id: item?._id,
      name: d.name,
      category: d.category,
      unit: d.unit,
      size,
      container: d.container,
      barcodes: d.barcodes,
      emptyG: weighable ? d.emptyG : undefined,
      fullG: weighable ? d.fullG : undefined,
      abv: d.abv,
      sku: d.sku,
      note: d.note,
      min: toBase(d.min),
      par: toBase(d.par),
      avgCost:
        seeCosts && d.containerCost !== undefined && size > 0
          ? d.containerCost / size
          : undefined,
    });
    setBusy(false);
    if (id) {
      onClose();
    }
  };

  /** Same item in another bottle size: size in the name and the note. */
  const duplicate = async (ml: number) => {
    const id = await sendPos(api.inv.saveItem, {
      company,
      name: nameWithSize(d.name, ml),
      category: d.category,
      unit: d.unit,
      size: ml,
      container: d.container,
      barcodes: [],
      abv: d.abv,
      note: descriptionWithSize(d.note, ml),
    });
    if (id) {
      setCopying(false);
      onClose();
    }
  };

  const archive = async () => {
    if (!item) {
      return;
    }
    await sendPos(api.inv.setItemActive, {
      company,
      id: item._id,
      active: !item.active,
    });
    onClose();
  };

  return (
    <FullPage
      footer={
        <div className="flex gap-2">
          {item ? (
            <Button onClick={archive} variant="outline">
              {item.active ? "Arquivar" : "Reativar"}
            </Button>
          ) : null}
          {copyable(item, d.unit) ? (
            <Button
              aria-label="Duplicar com outro tamanho"
              onClick={() => setCopying(true)}
              variant="outline"
            >
              <Icon name="IconSquareBehindSquare1" size={18} />
              <span className="hidden sm:inline">Duplicar</span>
            </Button>
          ) : null}
          <Button
            className="flex-1"
            disabled={busy || !d.name.trim() || !(size > 0)}
            onClick={save}
          >
            Salvar
          </Button>
        </div>
      }
      onClose={onClose}
      open
      title={item ? item.name : "Novo item de estoque"}
    >
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <MediaPicker
          company={company}
          id={item?._id ?? ""}
          image={item?.image}
          logo={item?.logo}
          note="A foto e o logo também aparecem no produto do POS com o mesmo nome."
          target="item"
        />
        <Field label="Nome">
          <Input
            autoFocus={!item}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Ex.: Gin Tanqueray 70cl"
            value={d.name}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select
              className={SELECT}
              onChange={(e) => set({ category: e.target.value })}
              value={d.category}
            >
              {INV_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unidade de controle">
            <select
              className={SELECT}
              onChange={(e) => {
                const unit = e.target.value as InvUnit;
                set({
                  unit,
                  size: unit === "un" ? 1 : d.size,
                  container: unit === "un" ? "un" : d.container,
                });
              }}
              value={d.unit}
            >
              <option value="ml">ml (líquidos)</option>
              <option value="g">g (peso)</option>
              <option value="un">unidade</option>
            </select>
          </Field>
        </div>
        {d.unit !== "un" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Embalagem">
              <Input
                onChange={(e) => set({ container: e.target.value })}
                placeholder="garrafa, lata, pacote"
                value={d.container}
              />
            </Field>
            <Field label={`Conteúdo (${UNIT_LABEL[d.unit]})`}>
              <NumberInput
                onChange={(v) => set({ size: v })}
                placeholder="700"
                value={d.size}
              />
            </Field>
          </div>
        ) : null}

        <Field
          hint="Escaneie ou digite; um item pode ter vários códigos (garrafa e caixa)."
          label="Códigos de barras"
        >
          <div className="flex flex-wrap gap-1.5">
            {d.barcodes.map((b) => (
              <span
                className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums"
                key={b}
              >
                {b}
                <button
                  aria-label={`Remover ${b}`}
                  onClick={() =>
                    set({ barcodes: d.barcodes.filter((x) => x !== b) })
                  }
                  type="button"
                >
                  ✕
                </button>
              </span>
            ))}
            <Button
              onClick={() => setScanning(true)}
              size="sm"
              variant="outline"
            >
              <Icon className="size-3.5" name="IconBarcode" />
              Adicionar
            </Button>
          </div>
        </Field>

        {weighable ? (
          <div className={cn(CARD, "space-y-3")}>
            <div>
              <p className="font-medium text-sm">
                Perfil da garrafa (para pesar)
              </p>
              <p className="text-muted-foreground text-xs">
                Pese uma garrafa vazia e uma cheia deste produto, com a tampa.
                Na contagem, a garrafa aberta vai na balança e o app calcula
                quanto resta.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Vazia (g)">
                <NumberInput
                  onChange={(v) => set({ emptyG: v })}
                  value={d.emptyG}
                />
              </Field>
              <Field label="Cheia (g)">
                <NumberInput
                  onChange={(v) => set({ fullG: v })}
                  value={d.fullG}
                />
              </Field>
              <Field label="Teor (%)">
                <NumberInput onChange={(v) => set({ abv: v })} value={d.abv} />
              </Field>
            </div>
            {d.emptyG && !d.fullG ? (
              <p className="text-amber-600 text-xs dark:text-amber-400">
                Sem o peso cheio, o app estima pelo teor alcoólico. Pese uma
                cheia para ficar exato.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Mínimo (${d.unit === "un" ? "un" : `${d.container}s`})`}
          >
            <NumberInput onChange={(v) => set({ min: v })} value={d.min} />
          </Field>
          <Field
            label={`Ideal / par (${d.unit === "un" ? "un" : `${d.container}s`})`}
          >
            <NumberInput onChange={(v) => set({ par: v })} value={d.par} />
          </Field>
        </div>
        {seeCosts ? (
          <Field
            hint="Até os invoices entrarem, informe o custo de compra sem IVA. Depois ele vira o custo médio automático."
            label={`Custo por ${d.unit === "un" ? "unidade" : d.container} (${settings.currency ?? "EUR"})`}
          >
            <NumberInput
              onChange={(v) => set({ containerCost: v })}
              value={d.containerCost}
            />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / código interno">
            <Input
              onChange={(e) => set({ sku: e.target.value })}
              value={d.sku}
            />
          </Field>
          <Field label="Observação">
            <Input
              onChange={(e) => set({ note: e.target.value })}
              value={d.note}
            />
          </Field>
        </div>
      </div>
      <BarcodeScanner
        onClose={() => setScanning(false)}
        onCode={(r) => {
          setScanning(false);
          if (!d.barcodes.includes(r.code)) {
            set({ barcodes: [...d.barcodes, r.code] });
          }
        }}
        open={scanning}
        title="Código do item"
      />
      {copying ? (
        <SizeCopy
          current={d.size}
          name={d.name}
          onClose={() => setCopying(false)}
          onPick={duplicate}
          what="item"
        />
      ) : null}
    </FullPage>
  );
}

/** Picks POS products to become stock items (wines as bottles in ml). */
function ImportFromPos({
  data,
  onClose,
}: {
  data: InvOverview;
  onClose: () => void;
}) {
  const company = useCompany();
  const { products } = usePos();
  const names = useMemo(
    () => new Set(data.items.map((i) => i.name.toLowerCase())),
    [data.items]
  );
  const candidates = useMemo(
    () =>
      products
        .filter((p) => !names.has(p.name.trim().toLowerCase()))
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        ),
    [products, names]
  );
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(
        candidates
          .filter((p) => p.wine || p.unit === "garrafa" || p.trackStock)
          .map((p) => p.id)
      )
  );
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const shown = candidates.filter((p) =>
    `${p.name} ${p.category}`.toLowerCase().includes(q.trim().toLowerCase())
  );
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const run = async () => {
    setBusy(true);
    const n = await sendPos(api.inv.importFromPos, {
      company,
      productIds: [...picked],
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
          <Button
            className="w-full"
            disabled={busy || !picked.size}
            onClick={run}
          >
            Criar {picked.size} itens de estoque
          </Button>
        ) : (
          <Button className="w-full" onClick={onClose}>
            Pronto
          </Button>
        )
      }
      onClose={onClose}
      open
      subtitle="Vinhos viram a garrafa em ml; o resto vira unidade. Ajuste depois o conteúdo e o perfil de cada garrafa."
      title="Importar itens do POS"
    >
      <div className="mx-auto max-w-xl space-y-3 p-4">
        {done !== null ? (
          <p className={cn(CARD, "text-sm")}>
            {done} itens criados. Agora complete o conteúdo, o código de barras
            e o perfil de cada garrafa.
          </p>
        ) : (
          <>
            <Input
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar…"
              value={q}
            />
            <div className="flex gap-2 text-sm">
              <button
                className="underline"
                onClick={() => setPicked(new Set(shown.map((p) => p.id)))}
                type="button"
              >
                Marcar todos
              </button>
              <button
                className="underline"
                onClick={() => setPicked(new Set())}
                type="button"
              >
                Desmarcar
              </button>
            </div>
            <ul className="divide-y rounded-2xl border bg-card">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      checked={picked.has(p.id)}
                      onChange={() => toggle(p.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block text-muted-foreground text-xs">
                        {p.category}
                      </span>
                    </span>
                    {p.wine ? (
                      <Tag tone="muted">{p.wine.bottleMl} ml</Tag>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </FullPage>
  );
}

export type ItemId = Id<"invItems">;
