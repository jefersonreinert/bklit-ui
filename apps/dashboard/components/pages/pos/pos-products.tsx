"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { newRequestId, recognizeProduct } from "@/lib/ai/client";
import { AI_ERROR_LABELS, AI_PROVIDERS } from "@/lib/ai/providers-meta";
import { Icon, type IconName } from "@/lib/icons";
import { periodFor, productStats, usePosDaily } from "@/lib/pos/analytics";
import {
  buildTree,
  type CategoryNode,
  fold,
  matchCategory,
} from "@/lib/pos/categories";
import { TILE_COLORS } from "@/lib/pos/seed";
import {
  isLowStock,
  marginOf,
  money,
  saveProduct,
  uid,
  useCompany,
  usePos,
  usePosQuery,
} from "@/lib/pos/store";
import type { PosProduct } from "@/lib/pos/types";
import { hidEnabled, setHidEnabled, startHidScanner } from "@/lib/scan/hid";
import { onScan } from "@/lib/scan/hub";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { CategoriesManager } from "./pos-categories";
import { type AiSuggestion, ProductForm } from "./pos-product-form";
import { BarcodeScanner, type PhotoResult } from "./scan/barcode-scanner";

/**
 * Items (products) of the business, organized by category and
 * subcategory. Everything opens as a full page (no sheets): category →
 * items → item. Items can be found by name, SKU, barcode, category or
 * subcategory, by scanning with the iPhone camera, with an external HID
 * reader, or created from a photo recognized by AI.
 */

type Filter = "all" | "low" | "nocost" | "off";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "low", label: "Estoque baixo" },
  { id: "nocost", label: "Sem custo" },
  { id: "off", label: "Indisponíveis" },
];

type Sort = "name" | "sales" | "margin" | "stock";

const SORTS: { id: Sort; label: string }[] = [
  { id: "name", label: "Nome" },
  { id: "sales", label: "Mais vendidos" },
  { id: "margin", label: "Margem" },
  { id: "stock", label: "Estoque" },
];

/** "Sem subcategoria" chip inside a category. */
const NO_SUB = "\u0000none";

function Kpi({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: "bad";
  onClick?: () => void;
}) {
  return (
    <button
      className="flex flex-col gap-1 rounded-2xl border bg-card p-3 text-left disabled:cursor-default"
      disabled={!onClick}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="size-3.5" name={icon} />
        {label}
      </span>
      <span
        className={cn(
          "font-semibold text-lg tabular-nums",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </span>
    </button>
  );
}

const matches = (p: PosProduct, f: Filter) => {
  if (f === "low") {
    return isLowStock(p);
  }
  if (f === "nocost") {
    return p.cost === undefined;
  }
  if (f === "off") {
    return !p.available;
  }
  return true;
};

function StockBadge({ p }: { p: PosProduct }) {
  if (!p.trackStock) {
    return null;
  }
  const low = isLowStock(p);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums",
        low
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      {Math.round((p.stock ?? 0) * 100) / 100} {p.unit || "un"}
    </span>
  );
}

function ProductRow({
  p,
  sold,
  currency,
  onOpen,
  showPath,
}: {
  p: PosProduct;
  sold: number;
  currency: string;
  onOpen: () => void;
  showPath?: boolean;
}) {
  const margin = marginOf(p);
  return (
    <li className="flex items-center gap-3 px-3">
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ background: p.color }}
      />
      <button
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 text-left active:opacity-60"
        onClick={onOpen}
        type="button"
      >
        <span
          className={cn(
            "flex items-center gap-2 text-[15px]",
            !p.available && "text-muted-foreground line-through"
          )}
        >
          <span className="truncate">{p.name}</span>
          <StockBadge p={p} />
        </span>
        {showPath ? (
          <span className="truncate text-muted-foreground text-xs">
            {[p.category, p.subcategory].filter(Boolean).join(" › ")}
          </span>
        ) : null}
        <span className="block truncate text-muted-foreground text-xs tabular-nums">
          {money(p.price, currency)}
          {p.cost === undefined
            ? " · sem custo"
            : ` · custo ${money(p.cost, currency)}`}
          {margin === null ? "" : ` · ${Math.round(margin)}%`}
          {sold ? ` · ${sold} vendidos` : ""}
          {p.barcode ? ` · ${p.barcode}` : ""}
        </span>
      </button>
      <Switch
        aria-label={`${p.name} disponível`}
        checked={p.available}
        onCheckedChange={(available) => saveProduct({ ...p, available })}
      />
    </li>
  );
}

function useSold() {
  const period = useMemo(() => periodFor("30d"), []);
  const days = usePosDaily(period);
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const s of productStats(days ?? [])) {
      map.set(s.id, s.qty);
    }
    return map;
  }, [days]);
}

function sortItems(list: PosProduct[], sort: Sort, sold: Map<string, number>) {
  return [...list].sort((a, b) => {
    if (sort === "sales") {
      return (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0);
    }
    if (sort === "margin") {
      return (marginOf(b) ?? -999) - (marginOf(a) ?? -999);
    }
    if (sort === "stock") {
      return (
        (a.stock ?? Number.POSITIVE_INFINITY) -
        (b.stock ?? Number.POSITIVE_INFINITY)
      );
    }
    return a.name.localeCompare(b.name);
  });
}

const searchText = (p: PosProduct) =>
  fold(
    [p.name, p.sku, p.barcode, p.category, p.subcategory, p.description]
      .filter(Boolean)
      .join(" ")
  );

/** Category tree: the server's, or built locally while it loads. */
export function useCategoryTree() {
  const data = usePos();
  const company = useCompany();
  const server = usePosQuery(api.categories.tree, { company });
  const local = useMemo(() => buildTree([], data.products), [data.products]);
  return (server as CategoryNode[] | null | undefined) ?? local;
}

function blankProduct(category: string, subcategory?: string): PosProduct {
  return {
    id: uid(),
    name: "",
    category,
    subcategory,
    price: 0,
    color: TILE_COLORS[0] ?? "#c96442",
    available: true,
    unit: "un",
    trackStock: false,
  };
}

type Tone = "info" | "bad" | "busy";

function Notice({
  tone,
  children,
  onClose,
}: {
  tone: Tone;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm",
        tone === "bad"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "bg-card"
      )}
      role={tone === "bad" ? "alert" : "status"}
    >
      {tone === "busy" ? (
        <Spinner className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Icon
          className="mt-0.5 size-4 shrink-0"
          name={tone === "bad" ? "IconExclamationTriangle" : "IconCircleInfo"}
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {onClose ? (
        <button aria-label="Fechar" onClick={onClose} type="button">
          <Icon className="size-4" name="IconCrossSmall" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * What every items screen shares: open/create an item, scanning (camera
 * and HID) and AI recognition from a photo.
 */
function useItemActions(tree: CategoryNode[]) {
  const data = usePos();
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [context, setContext] = useState<{ category?: string; subcategory?: string }>({});

  const findByCode = useCallback(
    (code: string) => {
      const c = code.trim();
      return data.products.find((p) => p.barcode?.trim() === c || p.sku?.trim() === c);
    },
    [data.products]
  );

  const openItem = useCallback((p: PosProduct) => {
    setAi(null);
    setEditing(p);
  }, []);

  const newItem = (patch: Partial<PosProduct> = {}) => {
    setAi(null);
    const category = patch.category ?? context.category ?? tree[0]?.name ?? "Outros";
    setEditing({ ...blankProduct(category, context.subcategory), ...patch });
  };

  const handleCode = useCallback(
    (code: string, source: string) => {
      setScanning(false);
      const hit = findByCode(code);
      setAi(null);
      if (hit) {
        setNotice({ tone: "info", text: `Encontrado: ${hit.name}` });
        setEditing(hit);
        return;
      }
      setNotice({
        tone: "info",
        text: `Código ${code} ainda não cadastrado${source === "hid" ? " (leitor externo)" : ""}. Complete o novo item.`,
      });
      const category = context.category ?? tree[0]?.name ?? "Outros";
      setEditing({ ...blankProduct(category, context.subcategory), barcode: code });
    },
    [context, findByCode, tree]
  );

  const recognize = async (photo: PhotoResult) => {
    setScanning(false);
    setNotice({ tone: "busy", text: "Reconhecendo o produto com IA…" });
    const res = await recognizeProduct({
      requestId: newRequestId(),
      image: photo.dataUrl,
      barcode: photo.code,
      categories: tree.map((c) => ({ name: c.name, subs: c.subs.map((s) => s.name) })),
    });
    if (!(res.ok && res.product)) {
      const tried = res.attempts
        .filter((a) => !a.skipped)
        .map(
          (a) =>
            `${AI_PROVIDERS[a.provider].label}: ${a.kind ? AI_ERROR_LABELS[a.kind] : "ok"}`
        )
        .join(" · ");
      setNotice({
        tone: "bad",
        text: `${res.error ?? "A IA não conseguiu identificar o produto."}${tried ? ` (${tried})` : ""}`,
      });
      return;
    }
    const r = res.product;
    const code = photo.code ?? r.barcode;
    const existing = code ? findByCode(code) : undefined;
    if (existing) {
      setNotice({ tone: "info", text: `Esse produto já existe: ${existing.name}` });
      openItem(existing);
      return;
    }
    const cat = matchCategory(tree, r.category);
    const sub =
      cat && r.subcategory
        ? cat.subs.find((s) => fold(s.name) === fold(r.subcategory as string))
        : undefined;
    setNotice(
      res.switched
        ? {
            tone: "info",
            text: `Item reconhecido por ${res.provider ? AI_PROVIDERS[res.provider].label : "outro provedor"}: o provedor principal falhou e o app trocou automaticamente.`,
          }
        : null
    );
    setAi({ product: r, provider: res.provider, cached: res.cached, switched: res.switched });
    setEditing({
      ...blankProduct(cat?.name ?? r.category ?? context.category ?? "Outros"),
      name: r.name ?? "",
      subcategory: sub?.name ?? (cat ? undefined : (r.subcategory ?? undefined)),
      barcode: code ?? undefined,
      description:
        [r.brand, r.size, r.description].filter(Boolean).join(" · ") || undefined,
    });
  };

  // External HID reader (Bluetooth/USB): works without the camera
  const [hid, setHid] = useState(true);
  useEffect(() => setHid(hidEnabled()), []);
  useEffect(() => {
    if (!hid) {
      return;
    }
    const stop = startHidScanner();
    const off = onScan((e) => {
      if (e.source === "hid") {
        handleCode(e.code, "hid");
      }
    });
    return () => {
      stop();
      off();
    };
  }, [hid, handleCode]);

  return {
    editing,
    ai,
    setEditing,
    openItem,
    newItem,
    scanning,
    setScanning,
    notice,
    setNotice,
    handleCode,
    recognize,
    setContext,
    hid,
    setHid: (on: boolean) => {
      setHidEnabled(on);
      setHid(on);
    },
  };
}

type Actions = ReturnType<typeof useItemActions>;

function ItemPages({ actions, tree }: { actions: Actions; tree: CategoryNode[] }) {
  const can = useCan();
  return (
    <>
      <ProductForm
        ai={actions.ai}
        onClose={() => actions.setEditing(null)}
        product={actions.editing}
        tree={tree}
      />
      <BarcodeScanner
        onClose={() => actions.setScanning(false)}
        onCode={(r) => actions.handleCode(r.code, r.source)}
        onPhoto={can(["products"]) ? actions.recognize : undefined}
        open={actions.scanning}
        photoLabel="Identificar com IA"
        title="Escanear item"
      />
    </>
  );
}

function SearchBar({
  query,
  onQuery,
  onScan: scan,
  onNew,
  placeholder,
}: {
  query: string;
  onQuery: (q: string) => void;
  onScan: () => void;
  onNew?: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Icon
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
          name="IconMagnifyingGlass"
        />
        <Input
          aria-label="Buscar itens"
          className="h-11 pl-9 text-base sm:text-sm"
          enterKeyHint="search"
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </div>
      <Button
        aria-label="Escanear código com a câmera"
        className="h-11 px-3"
        onClick={scan}
        variant="outline"
      >
        <Icon className="size-5" name="IconBarcode" />
        <span className="hidden sm:inline">Escanear</span>
      </Button>
      {onNew ? (
        <Button aria-label="Novo item" className="h-11 px-3" onClick={onNew}>
          <Icon className="size-5" name="IconPlusSmall" />
          <span className="hidden sm:inline">Novo item</span>
        </Button>
      ) : null}
    </div>
  );
}

function FilterChips({
  filter,
  onFilter,
  sort,
  onSort,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            aria-pressed={filter === f.id}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
              filter === f.id ? "bg-foreground text-background" : "bg-muted"
            )}
            key={f.id}
            onClick={() => onFilter(f.id)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>
      <select
        aria-label="Ordenar"
        className="h-9 shrink-0 rounded-full border bg-transparent px-3 text-sm"
        onChange={(e) => onSort(e.target.value as Sort)}
        value={sort}
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NoticeBar({ actions }: { actions: Actions }) {
  const n = actions.notice;
  const { setNotice } = actions;
  useEffect(() => {
    if (!n || n.tone === "busy") {
      return;
    }
    const t = setTimeout(() => setNotice(null), n.tone === "bad" ? 12_000 : 5000);
    return () => clearTimeout(t);
  }, [n, setNotice]);
  if (!n) {
    return null;
  }
  return (
    <Notice onClose={n.tone === "busy" ? undefined : () => setNotice(null)} tone={n.tone}>
      {n.text}
    </Notice>
  );
}

export function ProductsView() {
  const data = usePos();
  const can = useCan();
  const tree = useCategoryTree();
  const actions = useItemActions(tree);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const sold = useSold();
  const cur = data.settings.currency;
  const canEdit = can(["products"]);

  const kpis = useMemo(() => {
    const tracked = data.products.filter((p) => p.trackStock);
    const withCost = data.products.filter((p) => marginOf(p) !== null);
    return {
      active: data.products.filter((p) => p.available).length,
      stockValue: tracked.reduce(
        (a, p) => a + Math.max(0, p.stock ?? 0) * (p.cost ?? 0),
        0
      ),
      low: tracked.filter(isLowStock).length,
      margin: withCost.length
        ? withCost.reduce((a, p) => a + (marginOf(p) ?? 0), 0) / withCost.length
        : 0,
    };
  }, [data.products]);

  const q = fold(query.trim());
  const flat = Boolean(q) || filter !== "all";
  const list = flat
    ? sortItems(
        data.products.filter(
          (p) => matches(p, filter) && (!q || searchText(p).includes(q))
        ),
        sort,
        sold
      )
    : [];
  // Categories whose name (or a subcategory's) matches the search
  const catHits = q
    ? tree.filter(
        (c) =>
          fold(c.name).includes(q) || c.subs.some((s) => fold(s.name).includes(q))
      )
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi icon="IconTag" label="Itens ativos" value={String(kpis.active)} />
        <Kpi
          icon="IconBox2"
          label="Valor em estoque"
          value={money(kpis.stockValue, cur)}
        />
        <Kpi
          icon="IconExclamationTriangle"
          label="Estoque baixo"
          onClick={() => setFilter("low")}
          tone={kpis.low ? "bad" : undefined}
          value={String(kpis.low)}
        />
        <Kpi
          icon="IconCoins"
          label="Margem média"
          value={`${Math.round(kpis.margin)}%`}
        />
      </div>

      <SearchBar
        onNew={canEdit ? () => actions.newItem() : undefined}
        onQuery={setQuery}
        onScan={() => {
          actions.setContext({});
          actions.setScanning(true);
        }}
        placeholder="Nome, código, categoria…"
        query={query}
      />
      {openCat ? null : <NoticeBar actions={actions} />}
      <FilterChips filter={filter} onFilter={setFilter} onSort={setSort} sort={sort} />

      {flat ? (
        <>
          {catHits.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Categorias
              </h3>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {catHits.map((c) => (
                  <CategoryRowButton
                    key={c.name}
                    node={c}
                    onOpen={() => setOpenCat(c.name)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {list.length} {list.length === 1 ? "item" : "itens"}
            </h3>
            {list.length ? (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {list.slice(0, 300).map((p) => (
                  <ProductRow
                    currency={cur}
                    key={p.id}
                    onOpen={() => actions.openItem(p)}
                    p={p}
                    showPath
                    sold={sold.get(p.id) ?? 0}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-muted-foreground text-sm">
                Nenhum item aqui.
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Categorias · {tree.length}
            </h3>
            {canEdit ? (
              <button
                className="flex min-h-9 items-center gap-1 text-primary text-sm active:opacity-60"
                onClick={() => setManaging(true)}
                type="button"
              >
                <Icon className="size-4" name="IconFolders" />
                Organizar
              </button>
            ) : null}
          </div>
          {tree.length ? (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {tree.map((c) => (
                <CategoryRowButton
                  key={c.name}
                  node={c}
                  onOpen={() => setOpenCat(c.name)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
              <Icon className="size-8 text-muted-foreground" name="IconFolder1" />
              <p className="text-muted-foreground text-sm">
                Nenhum item ainda. Escaneie um código ou crie o primeiro item.
              </p>
            </div>
          )}
        </section>
      )}

      <ExternalReader actions={actions} />

      <CategoryPage
        actions={actions}
        name={openCat}
        onClose={() => setOpenCat(null)}
        sold={sold}
        tree={tree}
      />
      <CategoriesManager
        onClose={() => setManaging(false)}
        open={managing}
        tree={tree}
      />
      <ItemPages actions={actions} tree={tree} />
    </div>
  );
}

function ExternalReader({ actions }: { actions: Actions }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5">
      <Icon className="size-5 shrink-0 text-muted-foreground" name="IconBluetooth" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">Leitor de código externo</p>
        <p className="text-muted-foreground text-xs">
          Bluetooth ou USB no modo teclado (HID). Leia um código com esta tela
          aberta.
        </p>
      </div>
      <Switch
        aria-label="Usar leitor de código externo"
        checked={actions.hid}
        onCheckedChange={actions.setHid}
      />
    </div>
  );
}

function CategoryRowButton({
  node,
  onOpen,
}: {
  node: CategoryNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted/60"
        onClick={onOpen}
        type="button"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted"
          style={
            node.color
              ? { background: `${node.color}26`, color: node.color }
              : undefined
          }
        >
          <Icon className="size-5" name="IconFolder1" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[15px]">
            {node.name}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {node.count} {node.count === 1 ? "item" : "itens"}
            {node.subs.length
              ? ` · ${node.subs.length} ${node.subs.length === 1 ? "subcategoria" : "subcategorias"}`
              : ""}
          </span>
        </span>
        <Icon
          className="size-4 shrink-0 text-muted-foreground"
          name="IconChevronRight"
        />
      </button>
    </li>
  );
}

/** One category as a full page: subcategory chips, its items, add here. */
function CategoryPage({
  name,
  tree,
  onClose,
  actions,
  sold,
}: {
  name: string | null;
  tree: CategoryNode[];
  onClose: () => void;
  actions: Actions;
  sold: Map<string, number>;
}) {
  const data = usePos();
  const can = useCan();
  const [sub, setSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const node = name ? tree.find((c) => c.name === name) : undefined;

  // New items and scans from here land in this category
  const { setContext } = actions;
  useEffect(() => {
    setContext(
      name
        ? { category: name, subcategory: sub && sub !== NO_SUB ? sub : undefined }
        : {}
    );
  }, [name, sub, setContext]);
  useEffect(() => {
    if (!name) {
      setSub(null);
      setQuery("");
      setFilter("all");
    }
  }, [name]);

  const q = fold(query.trim());
  const items = name
    ? sortItems(
        data.products.filter(
          (p) =>
            p.category === name &&
            (sub === null ||
              (sub === NO_SUB ? !p.subcategory : p.subcategory === sub)) &&
            matches(p, filter) &&
            (!q || searchText(p).includes(q))
        ),
        sort,
        sold
      )
    : [];
  const noSub = name
    ? data.products.filter((p) => p.category === name && !p.subcategory).length
    : 0;
  const grouped =
    sub === null && !q && sort === "name" && (node?.subs.length ?? 0) > 0;

  const chip = (id: string | null, label: string, count: number) => (
    <button
      aria-pressed={sub === id}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
        sub === id ? "bg-foreground text-background" : "bg-muted"
      )}
      key={id ?? "all"}
      onClick={() => setSub(id)}
      type="button"
    >
      {label}
      <span
        className={cn(
          "text-xs tabular-nums",
          sub === id ? "opacity-70" : "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );

  const row = (p: PosProduct) => (
    <ProductRow
      currency={data.settings.currency}
      key={p.id}
      onOpen={() => actions.openItem(p)}
      p={p}
      sold={sold.get(p.id) ?? 0}
    />
  );

  return (
    <FullPage
      actions={
        can(["products"]) ? (
          <Button
            aria-label="Novo item nesta categoria"
            onClick={() => actions.newItem()}
            size="sm"
            variant="ghost"
          >
            <Icon className="size-5" name="IconPlusSmall" />
          </Button>
        ) : null
      }
      backLabel="Itens"
      onClose={onClose}
      open={name !== null}
      subtitle={node ? `${node.count} itens` : undefined}
      title={name ?? ""}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-10">
        <SearchBar
          onQuery={setQuery}
          onScan={() => actions.setScanning(true)}
          placeholder={`Buscar em ${name ?? ""}`}
          query={query}
        />
        <NoticeBar actions={actions} />
        {node?.subs.length ? (
          <nav
            aria-label="Subcategorias"
            className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chip(null, "Todas", node.count)}
            {node.subs.map((s) => chip(s.name, s.name, s.count))}
            {noSub ? chip(NO_SUB, "Sem subcategoria", noSub) : null}
          </nav>
        ) : null}
        <FilterChips
          filter={filter}
          onFilter={setFilter}
          onSort={setSort}
          sort={sort}
        />
        {items.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            Nenhum item aqui.
          </p>
        ) : grouped && node ? (
          [...node.subs.map((s) => s.name), NO_SUB].map((s) => {
            const group = items.filter((p) =>
              s === NO_SUB ? !p.subcategory : p.subcategory === s
            );
            return group.length ? (
              <section className="flex flex-col gap-2" key={s}>
                <h3 className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs">
                  <span>{name}</span>
                  <Icon className="size-3" name="IconChevronRight" />
                  <span>{s === NO_SUB ? "Sem subcategoria" : s}</span>
                </h3>
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {group.map(row)}
                </ul>
              </section>
            ) : null;
          })
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {items.map(row)}
          </ul>
        )}
      </div>
    </FullPage>
  );
}
