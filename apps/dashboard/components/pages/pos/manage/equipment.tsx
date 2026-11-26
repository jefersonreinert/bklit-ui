"use client";

import type { FunctionReturnType } from "convex/server";
import { useMemo, useRef, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { errorText, getSession, sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { convexClient } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";
import { CARD, Field, NumberInput, num, Pill, Tag, useMoney } from "../inventory/shared";
import { shrink } from "../media-picker";
import { GLASSES, Glass, type GlassKind, ToolArt, type ToolKind } from "./cocktail-art";

/**
 * Bar equipment: glasses, shakers, bar spoons, strainers, machines… per
 * bar, with a photo (background can be removed), how many there are, the
 * minimum wanted, what was paid and to whom. Purchases, breakages, losses
 * and counts change the quantity and stay in the history.
 */

type List = NonNullable<FunctionReturnType<typeof api.equipment.list>>;
type Item = List["items"][number];
type MoveKind = "purchase" | "broken" | "lost" | "count";

/** Suggested categories, each with a drawing for items without a photo. */
const CATEGORIES: { name: string; art: ToolKind | "glass" }[] = [
  { name: "Copos e taças", art: "glass" },
  { name: "Coqueteleiras", art: "shaker" },
  { name: "Colheres e ferramentas", art: "bar-spoon" },
  { name: "Coadores", art: "strainer" },
  { name: "Dosadores (jiggers)", art: "jigger" },
  { name: "Pilões", art: "muddler" },
  { name: "Mixing glasses", art: "mixing-glass" },
  { name: "Gelo", art: "ice" },
  { name: "Máquinas", art: "blender" },
  { name: "Outros", art: "spray" },
];

/** Suggested categories first, in their order; the user's own after. */
const catRank = (c: string) => {
  const i = CATEGORIES.findIndex((x) => x.name === c);
  return i < 0 ? CATEGORIES.length : i;
};

const MOVES: Record<MoveKind, { label: string; verb: string }> = {
  purchase: { label: "Compra", verb: "Registrar compra" },
  broken: { label: "Quebra", verb: "Registrar quebra" },
  lost: { label: "Perda", verb: "Registrar perda" },
  count: { label: "Contagem", verb: "Contar" },
};

const today = () => new Date().toISOString().slice(0, 10);

/** Drawing for an item without a photo: from its name, else its category. */
const NAME_ART: [RegExp, ToolKind | GlassKind][] = [
  [/coupe/i, "coupe"],
  [/nick/i, "nick"],
  [/martini/i, "martini"],
  [/hurricane/i, "hurricane"],
  [/tiki/i, "tiki"],
  [/flute/i, "flute"],
  [/cobre|mule/i, "mule"],
  [/vinho|spritz|balão|gin & tonic|copa/i, "wine"],
  [/highball|collins/i, "highball"],
  [/rocks|old fashioned|shot/i, "rocks"],
  [/fino|fine/i, "fine-strainer"],
  [/hawthorne|julep|coador/i, "strainer"],
  [/mixing/i, "mixing-glass"],
  [/bico|pour spout/i, "spout"],
  [/jigger|dosador/i, "jigger"],
  [/dasher|bitters/i, "dasher"],
  [/pinça de gelo|tongs/i, "tongs"],
  [/pinça|tweezer/i, "tweezers"],
  [/pá de gelo|scoop/i, "scoop"],
  [/balde/i, "bucket"],
  [/lewis|picado/i, "crushed-ice"],
  [/forma|gelo/i, "ice"],
  [/bar spoon|colher|bailarina/i, "bar-spoon"],
  [/pilão|muddler/i, "muddler"],
  [/coqueteleira|shaker|boston|cobbler|tin/i, "shaker"],
  [/faca/i, "knife"],
  [/saca|abridor/i, "opener"],
  [/espremedor/i, "squeezer"],
  [/descascador|zester|zest/i, "zest"],
  [/maçarico/i, "torch"],
  [/borrifador|atomizer/i, "spray"],
  [/tábua/i, "board"],
  [/tapete|bar mat/i, "bar-mat"],
  [/rimmer|borda/i, "rim"],
  [/liquidificador|blender/i, "blender"],
];
const GLASS_KINDS = new Set<string>(Object.keys(GLASSES));

function Art({ name = "", category, className }: { name?: string; category: string; className?: string }) {
  const art =
    NAME_ART.find(([re]) => re.test(name))?.[1] ?? CATEGORIES.find((c) => c.name === category)?.art ?? "jigger";
  if (art === "glass" || GLASS_KINDS.has(art)) {
    return <Glass className={className} color="transparent" ice={false} kind={art === "glass" ? "coupe" : (art as GlassKind)} />;
  }
  return <ToolArt className={className} tool={art as ToolKind} />;
}

function Photo({ item, className }: { item: Pick<Item, "image" | "category" | "name">; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-xl bg-muted/50", className)}>
      {item.image ? (
        // biome-ignore lint/performance/noImgElement: storage URL, any size
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={item.name} className="size-full object-contain p-1.5" height={160} loading="lazy" src={item.image} width={160} />
      ) : (
        <Art category={item.category} className="size-3/5 text-foreground/80" name={item.name} />
      )}
    </div>
  );
}

async function upload(company: string, file: File): Promise<Id<"_storage">> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Escolha uma imagem (JPG, PNG, WebP ou HEIC).");
  }
  const blob = await shrink(file, "image");
  const url = await sendPos(api.equipment.uploadUrl, { company });
  if (!url) {
    throw new Error("Sem permissão para enviar fotos.");
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || file.type }, body: blob });
  if (!res.ok) {
    throw new Error("O envio falhou. Tente de novo.");
  }
  return ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
}

export function EquipmentSection() {
  const company = useCompany();
  const fmt = useMoney();
  const data = usePosQuery(api.equipment.list, { company });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<Id<"equipment"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);

  const items = data?.items ?? [];
  const active = items.filter((i) => i.active);
  const cats = useMemo(() => {
    const names = new Set(active.map((i) => i.category));
    return [...names].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b));
  }, [active]);
  const shown = items
    .filter((i) => i.active !== archived)
    .filter((i) => !lowOnly || (i.minQty > 0 && i.quantity < i.minQty))
    .filter((i) => !cat || i.category === cat)
    .filter((i) => {
      const s = q.trim().toLowerCase();
      return !s || `${i.name} ${i.description} ${i.supplier}`.toLowerCase().includes(s);
    })
    .sort((a, b) => catRank(a.category) - catRank(b.category) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const low = active.filter((i) => i.minQty > 0 && i.quantity < i.minQty);
  const value = active.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);
  const spent = active.reduce((s, i) => s + (i.spentYear ?? 0), 0);

  if (data === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const current = items.find((i) => i.id === open);

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 sm:space-y-4 sm:p-4">
      <div className={cn(CARD, "space-y-3 sm:flex sm:items-center sm:gap-4 sm:space-y-0")}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 -space-x-4">
            <Glass className="size-10 sm:size-12" color="transparent" ice={false} kind="coupe" />
            <ToolArt className="size-10 sm:size-12" tool="shaker" />
            <ToolArt className="size-10 sm:size-12" tool="strainer" />
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-tight">Equipamentos do bar</p>
            <p className="text-muted-foreground text-xs leading-snug sm:text-sm">
              Copos, coqueteleiras, coadores, máquinas: quantos há, foto, preço e onde foi comprado.
            </p>
          </div>
        </div>
        {data?.canEdit ? (
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Icon className="size-4" name="IconPlusLarge" />
            Novo equipamento
          </Button>
        ) : null}
      </div>

      <div className={cn(CARD, "grid grid-cols-2 gap-x-4 gap-y-3 py-3 sm:grid-cols-4")}>
        <Stat label="Equipamentos" value={String(active.length)} />
        <Stat label="Peças" value={num(active.reduce((s, i) => s + i.quantity, 0), 0)} />
        {data?.seePrices ? <Stat label="Valor em uso" value={fmt(value)} /> : null}
        {data?.seePrices ? <Stat label="Gasto em 12 meses" value={fmt(spent)} /> : null}
      </div>

      {low.length ? (
        <button
          className={cn(CARD, "flex w-full items-center gap-2 border-amber-400/60 py-2.5 text-left text-sm")}
          onClick={() => {
            setArchived(false);
            setCat(null);
            setQ("");
            setLowOnly((v) => !v);
          }}
          type="button"
        >
          <span className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{low.length} abaixo do mínimo</span>
            <span className="text-muted-foreground"> · {low.slice(0, 3).map((i) => i.name).join(", ")}{low.length > 3 ? "…" : ""}</span>
          </span>
          <span className="shrink-0 text-muted-foreground text-xs underline">{lowOnly ? "ver todos" : "ver"}</span>
        </button>
      ) : null}

      <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
        <Input className="h-9 w-full sm:max-w-xs" onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" value={q} />
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Pill active={!cat} onClick={() => setCat(null)}>
            Todos
          </Pill>
          {cats.map((c) => (
            <Pill active={cat === c} key={c} onClick={() => setCat(c)}>
              {c}
            </Pill>
          ))}
          <Pill active={archived} onClick={() => setArchived((a) => !a)}>
            Arquivados
          </Pill>
        </div>
      </div>

      {shown.length ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {shown.map((i) => (
            <li key={i.id}>
              <button
                className={cn(CARD, "flex h-full w-full flex-col gap-2 p-2.5 text-left transition hover:bg-muted/40 sm:p-3")}
                onClick={() => setOpen(i.id)}
                type="button"
              >
                <Photo className="aspect-[4/3] w-full sm:aspect-square" item={i} />
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium text-sm leading-snug">{i.name}</p>
                  <p className="truncate text-muted-foreground text-xs">{i.category}</p>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2">
                  <p className="font-semibold text-lg tabular-nums sm:text-xl">{num(i.quantity, 0)}</p>
                  <div className="flex flex-col items-end gap-0.5 text-right text-xs">
                    {i.minQty > 0 && i.quantity < i.minQty ? <Tag tone="warn">mín. {i.minQty}</Tag> : null}
                    {i.unitPrice !== null ? <span className="text-muted-foreground">{fmt(i.unitPrice)}/un</span> : null}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          {items.length ? "Nada aqui." : "Nenhum equipamento ainda. Comece pelos copos e coqueteleiras."}
        </p>
      )}

      {creating ? (
        <NewEquipment
          onClose={(id) => {
            setCreating(false);
            if (id) setOpen(id);
          }}
          suppliers={data?.suppliers ?? []}
        />
      ) : null}
      {current ? (
        <EquipmentPage
          canEdit={data?.canEdit ?? false}
          item={current}
          onClose={() => setOpen(null)}
          seePrices={data?.seePrices ?? false}
          suppliers={data?.suppliers ?? []}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, boxed }: { label: string; value: string; boxed?: boolean }) {
  return (
    <div className={cn("min-w-0", boxed && "rounded-2xl border bg-card px-3 py-2.5")}>
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-semibold text-lg tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function CategoryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Input list="equipment-categories" onChange={(e) => onChange(e.target.value)} value={value} />
      <datalist id="equipment-categories">
        {CATEGORIES.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
    </>
  );
}

function SupplierInput({ value, onChange, suppliers }: { value: string; onChange: (v: string) => void; suppliers: string[] }) {
  return (
    <>
      <Input list="equipment-suppliers" onChange={(e) => onChange(e.target.value)} placeholder="Empresa / loja" value={value} />
      <datalist id="equipment-suppliers">
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function NewEquipment({ suppliers, onClose }: { suppliers: string[]; onClose: (id?: Id<"equipment">) => void }) {
  const company = useCompany();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Copos e taças");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState<number | undefined>(undefined);
  const [minQty, setMinQty] = useState<number | undefined>(undefined);
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const storageId = file ? await upload(company, file) : undefined;
      const id = await sendPos(api.equipment.save, {
        company,
        name,
        category,
        description,
        minQty,
        start: { quantity: quantity ?? 0, unitPrice, supplier, date },
        storageId,
      });
      if (id) onClose(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={busy || !name.trim()} onClick={save}>
          {busy ? "Salvando…" : "Salvar equipamento"}
        </Button>
      }
      onClose={() => onClose()}
      open
      title="Novo equipamento"
    >
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <button
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted/40"
          onClick={() => input.current?.click()}
          type="button"
        >
          {preview ? (
            // biome-ignore lint/performance/noImgElement: local preview
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="size-full object-contain p-2" height={300} src={preview} width={400} />
          ) : (
            <span className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
              <Art category={category} className="size-16" name={name} />
              Toque para tirar ou escolher a foto
            </span>
          )}
        </button>
        <input
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              setFile(f);
              setPreview(URL.createObjectURL(f));
            }
          }}
          ref={input}
          type="file"
        />
        <p className="-mt-2 text-muted-foreground text-xs">Depois de salvar dá para remover o fundo da foto.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome">
              <Input autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ex.: Taça coupe 180 ml" value={name} />
            </Field>
          </div>
          <Field label="Categoria">
            <CategoryInput onChange={setCategory} value={category} />
          </Field>
          <Field label="Quantidade">
            <NumberInput onChange={setQuantity} value={quantity} />
          </Field>
          <div className="col-span-2">
            <Field label="Descrição">
              <Textarea onChange={(e) => setDescription(e.target.value)} placeholder="Marca, modelo, tamanho, onde fica…" rows={2} value={description} />
            </Field>
          </div>
          <Field label="Preço pago por unidade">
            <NumberInput onChange={setUnitPrice} value={unitPrice} />
          </Field>
          <Field label="Comprado em">
            <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
          </Field>
          <Field label="Empresa onde comprou">
            <SupplierInput onChange={setSupplier} suppliers={suppliers} value={supplier} />
          </Field>
          <Field hint="Avisa quando ficar abaixo" label="Mínimo">
            <NumberInput onChange={setMinQty} value={minQty} />
          </Field>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
    </FullPage>
  );
}

function EquipmentPage({
  item,
  canEdit,
  seePrices,
  suppliers,
  onClose,
}: {
  item: Item;
  canEdit: boolean;
  seePrices: boolean;
  suppliers: string[];
  onClose: () => void;
}) {
  const company = useCompany();
  const fmt = useMoney();
  const history = usePosQuery(api.equipment.history, { company, id: item.id });
  const input = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<MoveKind | null>(null);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [description, setDescription] = useState(item.description);
  const [minQty, setMinQty] = useState<number | undefined>(item.minQty || undefined);
  const [saved, setSaved] = useState(false);
  const dirty = name !== item.name || category !== item.category || description !== item.description || (minQty ?? 0) !== item.minQty;

  const photo = async (file: File | null) => {
    setError(null);
    setPhotoBusy(file ? "Enviando…" : "Removendo…");
    try {
      const storageId = file ? await upload(company, file) : undefined;
      await sendPos(api.equipment.setPhoto, { company, id: item.id, storageId });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPhotoBusy(null);
    }
  };
  const clean = async () => {
    setError(null);
    setPhotoBusy("Removendo o fundo… (alguns segundos)");
    try {
      const client = convexClient();
      if (!client) throw new Error("Sem conexão com o servidor.");
      await client.action(api.equipment.removeBackground, { session: getSession() ?? undefined, company, id: item.id });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPhotoBusy(null);
    }
  };
  const save = async () => {
    const ok = await sendPos(api.equipment.save, { company, id: item.id, name, category, description, minQty });
    setSaved(ok !== undefined);
  };

  return (
    <FullPage
      footer={
        canEdit ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(MOVES) as MoveKind[]).map((k) => (
              <Button key={k} onClick={() => setMoving(k)} variant={k === "purchase" ? "default" : "outline"}>
                {MOVES[k].verb}
              </Button>
            ))}
          </div>
        ) : undefined
      }
      onClose={onClose}
      open
      subtitle={item.category}
      title={item.name}
    >
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <button
              className="relative block aspect-square w-full overflow-hidden rounded-2xl border bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:16px_16px]"
              disabled={!canEdit || Boolean(photoBusy)}
              onClick={() => input.current?.click()}
              type="button"
            >
              <Photo className="size-full bg-transparent" item={item} />
              {photoBusy ? (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70 px-2 text-center text-sm">
                  {photoBusy}
                </span>
              ) : null}
            </button>
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void photo(f);
              }}
              ref={input}
              type="file"
            />
            {canEdit ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {item.image ? (
                  <>
                    <button className="flex items-center gap-1 font-medium underline" disabled={Boolean(photoBusy)} onClick={clean} type="button">
                      <Icon className="size-4" name="IconSparklesSoft" />
                      Remover fundo
                    </button>
                    <button className="text-muted-foreground underline" disabled={Boolean(photoBusy)} onClick={() => input.current?.click()} type="button">
                      Trocar foto
                    </button>
                    <button className="text-destructive underline" disabled={Boolean(photoBusy)} onClick={() => photo(null)} type="button">
                      Remover foto
                    </button>
                  </>
                ) : (
                  <button className="underline" onClick={() => input.current?.click()} type="button">
                    Adicionar foto
                  </button>
                )}
              </div>
            ) : null}
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat boxed label="Quantidade" value={num(item.quantity, 0)} />
              <Stat boxed label="Mínimo" value={item.minQty ? String(item.minQty) : "—"} />
              {seePrices ? <Stat boxed label="Último preço / un" value={item.unitPrice !== null ? fmt(item.unitPrice) : "—"} /> : null}
              {seePrices ? <Stat boxed label="Valor em uso" value={fmt((item.unitPrice ?? 0) * item.quantity)} /> : null}
            </div>
            {item.supplier ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Comprado em: </span>
                {item.supplier}
              </p>
            ) : null}
            {item.brokenYear ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Quebras e perdas em 12 meses: </span>
                {item.brokenYear}
              </p>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className={cn(CARD, "space-y-3")}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nome">
                  <Input onChange={(e) => setName(e.target.value)} value={name} />
                </Field>
              </div>
              <Field label="Categoria">
                <CategoryInput onChange={setCategory} value={category} />
              </Field>
              <Field label="Mínimo">
                <NumberInput onChange={setMinQty} value={minQty} />
              </Field>
              <div className="col-span-2">
                <Field label="Descrição">
                  <Textarea onChange={(e) => setDescription(e.target.value)} rows={3} value={description} />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!dirty} onClick={save} size="sm" variant="outline">
                Salvar dados
              </Button>
              {saved && !dirty ? <span className="text-muted-foreground text-sm">Salvo.</span> : null}
              <button
                className="ml-auto text-muted-foreground text-sm underline"
                onClick={async () => {
                  await sendPos(api.equipment.setActive, { company, id: item.id, active: !item.active });
                  onClose();
                }}
                type="button"
              >
                {item.active ? "Arquivar (fora de uso)" : "Reativar"}
              </button>
            </div>
          </div>
        ) : item.description ? (
          <p className={cn(CARD, "whitespace-pre-line text-sm")}>{item.description}</p>
        ) : null}

        <section className="space-y-2">
          <p className="font-medium">Histórico</p>
          {history === undefined ? (
            <Spinner />
          ) : history?.length ? (
            <ul className="divide-y rounded-2xl border bg-card">
              {history.map((m) => (
                <li className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm" key={m.id}>
                  <div className="min-w-0">
                    <p>
                      <span className="font-medium">{MOVES[m.kind].label}</span>
                      <span className="text-muted-foreground"> · {m.date.split("-").reverse().join("/")} · {m.by}</span>
                    </p>
                    {m.supplier || m.unitPrice !== null ? (
                      <p className="text-muted-foreground text-xs">
                        {[m.supplier, m.unitPrice !== null ? `${fmt(m.unitPrice)}/un · total ${fmt(m.unitPrice * m.qty)}` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {m.note ? <p className="text-muted-foreground text-xs">{m.note}</p> : null}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn("font-medium", m.qty < 0 ? "text-destructive" : m.qty > 0 ? "text-emerald-600" : "")}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </p>
                    <p className="text-muted-foreground text-xs">fica {m.after}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Sem movimentos.</p>
          )}
        </section>
      </div>
      {moving ? (
        <MoveForm item={item} kind={moving} onClose={() => setMoving(null)} seePrices={seePrices} suppliers={suppliers} />
      ) : null}
    </FullPage>
  );
}

function MoveForm({
  item,
  kind,
  seePrices,
  suppliers,
  onClose,
}: {
  item: Item;
  kind: MoveKind;
  seePrices: boolean;
  suppliers: string[];
  onClose: () => void;
}) {
  const company = useCompany();
  const fmt = useMoney();
  const [qty, setQty] = useState<number | undefined>(kind === "count" ? item.quantity : undefined);
  const [unitPrice, setUnitPrice] = useState<number | undefined>(item.unitPrice ?? undefined);
  const [supplier, setSupplier] = useState(item.supplier);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const purchase = kind === "purchase";

  const save = async () => {
    setBusy(true);
    const r = await sendPos(api.equipment.move, {
      company,
      id: item.id,
      kind,
      qty: qty ?? 0,
      unitPrice: purchase ? unitPrice : undefined,
      supplier: purchase ? supplier : undefined,
      date,
      note,
    });
    setBusy(false);
    if (r !== undefined) onClose();
  };

  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={busy || qty === undefined || (kind !== "count" && !(qty > 0))} onClick={save}>
          {MOVES[kind].verb}
        </Button>
      }
      onClose={onClose}
      open
      subtitle={`${item.name} · hoje ${item.quantity}`}
      title={MOVES[kind].label}
    >
      <div className="mx-auto max-w-md space-y-3 p-4">
        <Field label={kind === "count" ? "Quantas há agora" : "Quantidade"}>
          <NumberInput autoFocus onChange={setQty} value={qty} />
        </Field>
        {purchase ? (
          <>
            <Field
              hint={seePrices && qty && unitPrice ? `Total: ${fmt(qty * unitPrice)}` : undefined}
              label="Preço pago por unidade"
            >
              <NumberInput onChange={setUnitPrice} value={unitPrice} />
            </Field>
            <Field label="Empresa onde comprou">
              <SupplierInput onChange={setSupplier} suppliers={suppliers} value={supplier} />
            </Field>
          </>
        ) : null}
        <Field label="Data">
          <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
        </Field>
        <Field label="Observação">
          <Input
            onChange={(e) => setNote(e.target.value)}
            placeholder={purchase ? "Nº da fatura, modelo…" : kind === "count" ? "" : "O que aconteceu"}
            value={note}
          />
        </Field>
      </div>
    </FullPage>
  );
}
