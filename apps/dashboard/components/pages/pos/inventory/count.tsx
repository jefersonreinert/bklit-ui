"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { contentOfWeight, countedQty, invCategoryLabel } from "@/lib/inventory/units";
import { sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { onScan } from "@/lib/scan/hub";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "../scan/barcode-scanner";
import {
  CARD,
  dateText,
  Field,
  type InvItem,
  type InvOverview,
  NumberInput,
  num,
  Pill,
  qtyText,
  Stepper,
  Tag,
  useMoney,
} from "./shared";

/**
 * Stock take on the phone: pick the area, go shelf by shelf (or scan),
 * type the full bottles and put each open one on the scale. Each item
 * saves as it is typed, so several people can count at once. Closing
 * shows the differences first, then writes them to the ledger.
 */

type Line = Doc<"invCountLines">;

export function CountSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.inv.counts, { company });
  const [busy, setBusy] = useState(false);
  if (list === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const open = list?.find((c) => c.status === "open");
  if (open) {
    return <CountRunner countId={open._id} data={data} />;
  }
  const start = async () => {
    setBusy(true);
    await sendPos(api.inv.startCount, { company });
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="font-medium">Nenhuma contagem aberta</p>
          <p className="text-muted-foreground text-sm">
            A primeira contagem vira o estoque de abertura deste bar.
          </p>
        </div>
        <Button disabled={busy || !data.items.length} onClick={start}>
          Iniciar contagem
        </Button>
      </div>
      {list?.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {list.map((c) => (
            <li className="flex items-center justify-between gap-3 px-4 py-3" key={c._id}>
              <div>
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-muted-foreground text-xs">
                  {dateText(c.closedAt ?? c.startedAt)} · {c.closedBy ?? c.startedBy}
                </p>
              </div>
              {data.seeCosts && c.value !== undefined ? (
                <div className="text-right text-sm tabular-nums">
                  <p>{fmt(c.value)}</p>
                  <p className={cn("text-xs", (c.diffValue ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                    diferença {fmt(c.diffValue ?? 0)}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CountRunner({ countId, data }: { countId: Id<"invCounts">; data: InvOverview }) {
  const detail = usePosQuery(api.inv.countDetail, { countId });
  const [area, setArea] = useState<Id<"invAreas"> | "">(data.areas[0]?._id ?? "");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<InvItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);

  const lines = detail?.lines ?? [];
  const byItem = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of lines) {
      m.set(l.itemId, [...(m.get(l.itemId) ?? []), l]);
    }
    return m;
  }, [lines]);

  const items = useMemo(() => {
    const active = data.items.filter((i) => i.active);
    const a = data.areas.find((x) => x._id === area);
    const ordered = a
      ? (a.items.map((id) => active.find((i) => i._id === id)).filter(Boolean) as InvItem[])
      : [...active].sort(
          (x, y) => x.category.localeCompare(y.category) || x.name.localeCompare(y.name)
        );
    const s = q.trim().toLowerCase();
    return s ? ordered.filter((i) => i.name.toLowerCase().includes(s)) : ordered;
  }, [data, area, q]);

  const openCode = useCallback(
    (code: string) => {
      const hit = data.items.find((i) => i.barcodes.includes(code));
      if (hit) {
        setOpen(hit);
        setMissing(null);
      } else {
        setMissing(code);
      }
    },
    [data.items]
  );
  useEffect(
    () =>
      onScan((e) => {
        if (e.source === "hid" && !open) {
          openCode(e.code);
        }
      }),
    [openCode, open]
  );

  if (!detail) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const counted = byItem.size;
  const lineFor = (itemId: string) =>
    lines.find((l) => l.itemId === itemId && (l.areaId ?? "") === area);

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="font-medium">{detail.count.name}</p>
          <p className="text-muted-foreground text-sm">
            {counted} de {data.items.filter((i) => i.active).length} itens contados · aberta{" "}
            {dateText(detail.count.startedAt)} por {detail.count.startedBy}
          </p>
        </div>
        <Button disabled={!counted} onClick={() => setReviewing(true)}>
          Revisar e fechar
        </Button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
        {data.areas.map((a) => (
          <Pill active={area === a._id} key={a._id} onClick={() => setArea(a._id)}>
            {a.name}
          </Pill>
        ))}
        <Pill active={area === ""} onClick={() => setArea("")}>
          {data.areas.length ? "Sem área (todos os itens)" : "Todos os itens"}
        </Pill>
      </div>

      <div className="flex gap-2">
        <Input
          className="min-w-0 flex-1"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar item…"
          value={q}
        />
        <Button onClick={() => setScanning(true)}>
          <Icon className="size-4" name="IconBarcode" />
          Escanear
        </Button>
      </div>
      {missing ? (
        <p className={cn(CARD, "text-sm")}>
          O código {missing} não está em nenhum item. Cadastre-o na aba Itens e escaneie de novo.
        </p>
      ) : null}

      {items.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((i) => {
            const here = lineFor(i._id);
            const all = byItem.get(i._id) ?? [];
            const total = all.reduce((s, l) => s + l.qty, 0);
            return (
              <li key={i._id}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() => setOpen(i)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      here ? "border-emerald-500 bg-emerald-500 text-white" : "text-muted-foreground"
                    )}
                  >
                    {here ? "✓" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{i.name}</p>
                    <p className="text-muted-foreground text-xs">{invCategoryLabel(i.category)}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    {here ? <p className="font-medium">{qtyText(here.qty, i)}</p> : <p className="text-muted-foreground">—</p>}
                    {all.length > 1 || (all.length === 1 && !here) ? (
                      <p className="text-muted-foreground text-xs">total {qtyText(total, i)}</p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          Nenhum item nesta área. Escolha os itens da área em Ajustes, ou conte em “Todos os itens”.
        </p>
      )}

      <BarcodeScanner
        onClose={() => setScanning(false)}
        onCode={(r) => {
          setScanning(false);
          openCode(r.code);
        }}
        open={scanning}
        title="Escanear para contar"
      />
      {open ? (
        <CountSheet
          areaId={area || undefined}
          areaName={data.areas.find((a) => a._id === area)?.name}
          countId={countId}
          item={open}
          line={lineFor(open._id)}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {reviewing ? (
        <Review countId={countId} data={data} lines={lines} onClose={() => setReviewing(false)} />
      ) : null}
    </div>
  );
}

function CountSheet({
  item,
  line,
  countId,
  areaId,
  areaName,
  onClose,
}: {
  item: InvItem;
  line: Line | undefined;
  countId: Id<"invCounts">;
  areaId: Id<"invAreas"> | undefined;
  areaName: string | undefined;
  onClose: () => void;
}) {
  const [full, setFull] = useState(line?.full ?? 0);
  const [weights, setWeights] = useState<number[]>(line?.weights ?? []);
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [loose, setLoose] = useState<number | undefined>(line?.loose || undefined);
  const [busy, setBusy] = useState(false);
  const weighable = item.unit !== "un";
  const profiled = Boolean(item.emptyG);

  let total: { qty: number; estimated: boolean } | null = null;
  try {
    total = countedQty({ full, weights, loose: loose ?? 0 }, item);
  } catch {
    total = null;
  }

  const addWeight = () => {
    if (weight !== undefined && weight > 0) {
      setWeights((w) => [...w, weight]);
      setWeight(undefined);
    }
  };
  const save = async () => {
    setBusy(true);
    const r = await sendPos(api.inv.saveCountLine, {
      countId,
      itemId: item._id,
      areaId,
      full,
      weights,
      loose: loose ?? 0,
    });
    setBusy(false);
    if (r) {
      onClose();
    }
  };
  const remove = async () => {
    await sendPos(api.inv.removeCountLine, { countId, itemId: item._id, areaId });
    onClose();
  };

  return (
    <FullPage
      footer={
        <div className="flex gap-2">
          {line ? (
            <Button onClick={remove} variant="outline">
              Limpar
            </Button>
          ) : null}
          <Button className="flex-1" disabled={busy || !total} onClick={save}>
            Salvar {total ? `· ${qtyText(total.qty, item)}` : ""}
          </Button>
        </div>
      }
      onClose={onClose}
      open
      subtitle={areaName ? `Área: ${areaName}` : "Sem área"}
      title={item.name}
    >
      <div className="mx-auto max-w-md space-y-5 p-4">
        <Field label={item.unit === "un" ? "Unidades" : `${item.container}s cheias e fechadas`}>
          <Stepper onChange={setFull} value={full} />
        </Field>

        {weighable ? (
          <div className={cn(CARD, "space-y-3")}>
            <p className="font-medium text-sm">Abertas: peso na balança (g)</p>
            {profiled ? (
              <>
                <div className="flex gap-2">
                  <NumberInput
                    autoFocus
                    className="h-11 text-lg"
                    onChange={setWeight}
                    placeholder="ex.: 825"
                    value={weight}
                  />
                  <Button className="h-11" disabled={!weight} onClick={addWeight}>
                    Adicionar
                  </Button>
                </div>
                {weights.length ? (
                  <ul className="space-y-1">
                    {weights.map((w, i) => {
                      const c = contentOfWeight(w, item);
                      return (
                        <li className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm" key={`${i}-${w}`}>
                          <span className="tabular-nums">{num(w, 1)} g</span>
                          <span className="tabular-nums">
                            = {c ? `${num(c.qty, 0)} ${item.unit}` : "?"}
                            {c?.estimated ? " (estimado)" : ""}
                          </span>
                          <button
                            aria-label="Remover peso"
                            className="text-muted-foreground"
                            onClick={() => setWeights((ws) => ws.filter((_, j) => j !== i))}
                            type="button"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-amber-600 text-sm dark:text-amber-400">
                Este item ainda não tem perfil de garrafa. Conte as cheias agora e, na aba Itens,
                pese uma garrafa vazia e uma cheia para poder pesar as abertas.
              </p>
            )}
          </div>
        ) : null}

        {item.unit !== "un" ? (
          <Field hint="Ex.: queijo pesado sem embalagem, ou ml medidos." label={`Solto (${item.unit})`}>
            <NumberInput onChange={setLoose} value={loose} />
          </Field>
        ) : null}

        {total ? (
          <p className="text-center text-muted-foreground text-sm">
            Total: <span className="font-medium text-foreground">{qtyText(total.qty, item)}</span>
            {total.estimated ? <Tag tone="warn">estimado</Tag> : null}
          </p>
        ) : null}
      </div>
    </FullPage>
  );
}

/** Before closing: what changes, item by item, and in value. */
function Review({
  countId,
  data,
  lines,
  onClose,
}: {
  countId: Id<"invCounts">;
  data: InvOverview;
  lines: Line[];
  onClose: () => void;
}) {
  const fmt = useMoney();
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const l of lines) {
      totals.set(l.itemId, (totals.get(l.itemId) ?? 0) + l.qty);
    }
    return [...totals]
      .map(([id, counted]) => {
        const item = data.items.find((i) => i._id === id);
        if (!item) {
          return null;
        }
        const diff = counted - item.qty;
        return { item, counted, diff, value: diff * (item.avgCost ?? 0) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.diff) - Math.abs(a.diff));
  }, [lines, data.items]);
  const totalDiff = rows.reduce((s, r) => s + r.value, 0);
  const uncounted = data.items.filter((i) => i.active && !rows.some((r) => r.item._id === i._id)).length;

  const close = async () => {
    setBusy(true);
    const r = await sendPos(api.inv.closeCount, { countId });
    setBusy(false);
    if (r) {
      onClose();
    }
  };
  const discard = async () => {
    if (window.confirm("Apagar esta contagem e tudo o que foi contado nela?")) {
      await sendPos(api.inv.deleteCount, { countId });
      onClose();
    }
  };
  return (
    <FullPage
      footer={
        <div className="flex gap-2">
          <Button onClick={discard} variant="outline">
            Apagar contagem
          </Button>
          <Button className="flex-1" disabled={busy} onClick={close}>
            Fechar e atualizar o estoque
          </Button>
        </div>
      }
      onClose={onClose}
      open
      subtitle={`${rows.length} itens contados${uncounted ? ` · ${uncounted} não contados mantêm o saldo atual` : ""}`}
      title="Revisar a contagem"
    >
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        {data.seeCosts ? (
          <p className={cn(CARD, "text-sm")}>
            Diferença total:{" "}
            <span className={cn("font-semibold tabular-nums", totalDiff < 0 && "text-destructive")}>
              {fmt(totalDiff)}
            </span>
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-normal">Item</th>
                <th className="px-3 py-2 text-right font-normal">Sistema</th>
                <th className="px-3 py-2 text-right font-normal">Contado</th>
                <th className="px-3 py-2 text-right font-normal">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.item._id}>
                  <td className="px-3 py-2">{r.item.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qtyText(r.item.qty, r.item)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qtyText(r.counted, r.item)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.diff < 0 && "text-destructive")}>
                    {r.diff === 0 ? "—" : qtyText(r.diff, r.item)}
                    {data.seeCosts && r.value ? (
                      <span className="block text-xs">{fmt(r.value)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FullPage>
  );
}
