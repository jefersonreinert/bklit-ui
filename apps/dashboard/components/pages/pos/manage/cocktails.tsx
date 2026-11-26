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
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { printPaper } from "../inventory/invoice-digital";
import { CARD, Field, num, Pill, Tag } from "../inventory/shared";
import {
  GARNISHES,
  GarnishArt,
  type GlassKind,
  GLASSES,
  Glass,
  garnishKinds,
  glassKind,
  TOOLS,
  ToolArt,
  type ToolKind,
  toolOf,
} from "./cocktail-art";

/**
 * Cocktail guide: how to make every cocktail of the bar, step by step,
 * with a drawing of the tool for each step (shaker, bar spoon, strainer…),
 * the glass and the garnish. Comes from the technical sheets, so the
 * measures are the same ones that take the stock out.
 */

type Guide = NonNullable<FunctionReturnType<typeof api.recipes.guide>>;
type Cocktail = Guide["cocktails"][number];
type Step = Cocktail["steps"][number];

const DEFAULT_COLOR = "#d98a4a";

/** Shaken, stirred, blended or built — from the tools of its steps. */
function technique(steps: Step[]) {
  const tools = new Set(steps.map((s) => s.tool));
  if (tools.has("blender")) return "Batido no liquidificador";
  if (tools.has("shaker") || tools.has("dry-shake")) return "Batido";
  if (tools.has("mixing-glass")) return "Mexido";
  return steps.length ? "Montado no copo" : "";
}

/** Tools to have at hand, in the order they are used. */
function toolsOf(steps: Step[]): ToolKind[] {
  const out: ToolKind[] = [];
  for (const s of steps) {
    const t = toolOf(s.tool);
    if (!out.includes(t) && t !== "garnish" && t !== "glass") {
      out.push(t);
    }
  }
  return out;
}

/** Whether a #rrggbb colour needs dark text on it. */
function light(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return false;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

function qtyText(qty: number, unit: string) {
  if (unit === "un") {
    return qty === 1 ? "1 un" : `${num(qty, 2)} un`;
  }
  return `${num(qty, qty < 1 ? 2 : 1)} ${unit}`;
}

export function CocktailsSection() {
  const company = useCompany();
  const guide = usePosQuery(api.recipes.guide, { company });
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Id<"invRecipes"> | null>(null);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (guide?.cocktails ?? []).filter(
      (c) =>
        (all || c.menu) &&
        (!s || `${c.name} ${c.description} ${c.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(s))
    );
    const by = new Map<string, Cocktail[]>();
    for (const c of list) {
      const key = c.menu ? c.section || "Cocktails" : "Outras fichas do grupo";
      by.set(key, [...(by.get(key) ?? []), c]);
    }
    return [...by.entries()];
  }, [guide, q, all]);

  if (guide === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const current = guide?.cocktails.find((c) => c.id === open);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className={cn(CARD, "flex flex-wrap items-center gap-4")}>
        <div className="flex -space-x-3">
          <ToolArt className="size-12" tool="shaker" />
          <ToolArt className="size-12" tool="bar-spoon" />
          <GarnishArt className="size-12" kind="lime" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Instruções de cocktails</p>
          <p className="text-muted-foreground text-sm">
            Como fazer cada cocktail do bar, passo a passo, com as medidas da ficha técnica, o copo e
            a guarnição.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cocktail ou ingrediente…"
          value={q}
        />
        <Pill active={!all} onClick={() => setAll(false)}>
          No menu deste bar
        </Pill>
        <Pill active={all} onClick={() => setAll(true)}>
          Todas as fichas
        </Pill>
      </div>

      {groups.length ? (
        groups.map(([title, list]) => (
          <section className="space-y-2" key={title}>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    className={cn(CARD, "flex h-full w-full items-start gap-3 text-left transition hover:bg-muted/40")}
                    onClick={() => setOpen(c.id)}
                    type="button"
                  >
                    <div
                      className="flex size-20 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${c.color || DEFAULT_COLOR}1f` }}
                    >
                      <Glass className="size-16" color={c.color || DEFAULT_COLOR} kind={glassKind(c.glass)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      {c.description ? (
                        <p className="line-clamp-2 text-muted-foreground text-xs">{c.description}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {technique(c.steps) ? <Tag tone="muted">{technique(c.steps)}</Tag> : null}
                        {c.steps.length ? null : <Tag tone="warn">sem instrução</Tag>}
                        {c.toConfirm ? <Tag tone="warn">medidas a confirmar</Tag> : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          Nenhum cocktail aqui. As instruções saem das fichas técnicas da categoria cocktail.
        </p>
      )}

      {current ? <CocktailPage c={current} canEdit={guide?.canEdit ?? false} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function StepArt({ step, c }: { step: Step; c: Cocktail }) {
  const tool = toolOf(step.tool);
  if (tool === "glass") {
    return <Glass className="size-14" color="transparent" ice={false} kind={glassKind(c.glass)} />;
  }
  if (tool === "garnish") {
    // What this step names first ("8 folhas de hortelã"), else the drink's garnish
    const own = garnishKinds(step.en ? `${step.text} ${step.en}` : step.text);
    const kinds = own.length ? own : garnishKinds(c.garnish);
    return <GarnishArt className="size-14" kind={kinds[0] ?? "mint"} />;
  }
  return <ToolArt className="size-14" tool={tool} />;
}

function CocktailPage({ c, canEdit, onClose }: { c: Cocktail; canEdit: boolean; onClose: () => void }) {
  const card = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const glass = glassKind(c.glass);
  return (
    <FullPage
      footer={
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button onClick={() => setEditing(true)} variant="outline">
              <Icon className="size-4" name="IconPencil" />
              Editar instrução
            </Button>
          ) : null}
          <Button
            className="flex-1"
            onClick={() => card.current && printPaper(card.current, c.name)}
            variant="outline"
          >
            <Icon className="size-4" name="IconPrinter" />
            Imprimir ficha do bar
          </Button>
        </div>
      }
      onClose={onClose}
      open
      subtitle={[c.section, GLASSES[glass]].filter(Boolean).join(" · ")}
      title={c.name}
    >
      <div className="mx-auto max-w-3xl p-4">
        <div className="bg-background" data-paper ref={card}>
          <CocktailSheet c={c} />
        </div>
      </div>
      {editing ? <GuideEditor c={c} onClose={() => setEditing(false)} /> : null}
    </FullPage>
  );
}

/** The how-to of one cocktail: hero, tools, ingredients, steps. */
export function CocktailSheet({ c }: { c: Cocktail }) {
  const locale = useLocale();
  const color = c.color || DEFAULT_COLOR;
  const glass = glassKind(c.glass);
  const garnish = garnishKinds(c.garnish);
  const tools = toolsOf(c.steps);
  const text = (s: Step) => (locale === "pt" ? s.text : (s.en ?? s.text));
  const batch = /pre-?batch/i.test(c.method) ? c.method.split(/\s1\)\s/)[0] : "";

  return (
    <div className="space-y-5">
      {/* Hero: the drink, its glass and garnish */}
      <div className="flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center" style={{ background: `${color}14` }}>
        <div className="flex shrink-0 items-end justify-center gap-1">
          <Glass className="size-40" color={color} kind={glass} title={GLASSES[glass]} />
          {garnish.slice(0, 2).map((g) => (
            <GarnishArt className="-ml-6 size-14" key={g} kind={g} title={GARNISHES[g]} />
          ))}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-2xl">{c.name}</p>
          {c.description ? <p className="text-muted-foreground">{c.description}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {technique(c.steps) ? (
              <>
                <dt className="text-muted-foreground">Técnica</dt>
                <dd>{technique(c.steps)}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Copo</dt>
            <dd>{c.glass || GLASSES[glass]}</dd>
            {c.garnish ? (
              <>
                <dt className="text-muted-foreground">Guarnição</dt>
                <dd>{c.garnish}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {c.toConfirm ? (
        <p className="rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-2.5 text-amber-900 text-sm dark:bg-amber-950/30 dark:text-amber-200">
          Medidas sugeridas a partir do menu e da receita clássica. Confira com o bar manager e
          ajuste a ficha técnica.
        </p>
      ) : null}

      {tools.length ? (
        <section className="space-y-2">
          <p className="font-medium">Você vai precisar</p>
          <div className="flex flex-wrap gap-2">
            <ToolChip label={GLASSES[glass]}>
              <Glass className="size-12" color="transparent" ice={false} kind={glass} />
            </ToolChip>
            {tools.map((t) => (
              <ToolChip key={t} label={TOOLS[t]}>
                <ToolArt className="size-12" tool={t} />
              </ToolChip>
            ))}
            {garnish.map((g) => (
              <ToolChip key={g} label={GARNISHES[g]}>
                <GarnishArt className="size-12" kind={g} />
              </ToolChip>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="font-medium">Ingredientes</p>
        <ul className="divide-y rounded-2xl border bg-card">
          {c.lines.map((l) => (
            <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm" key={`${l.name}-${l.qty}`}>
              <span>
                {l.name}
                {l.prep ? <span className="ml-1.5 text-muted-foreground text-xs">(preparo)</span> : null}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{qtyText(l.qty, l.unit)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <p className="font-medium">Passo a passo</p>
        {c.steps.length ? (
          <ol className="space-y-2">
            {c.steps.map((s, i) => (
              <li className="flex items-center gap-4 rounded-2xl border bg-card p-3" key={`${i}-${s.tool}`}>
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-sm"
                  style={{ background: color, color: light(color) ? "#18181b" : "#fff" }}
                >
                  {i + 1}
                </span>
                <StepArt c={c} step={s} />
                <p className="text-sm leading-relaxed">{text(s)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border bg-card p-4 text-muted-foreground text-sm">
            {c.method || "Ainda sem instrução."}
          </p>
        )}
      </section>

      {batch ? (
        <section className="space-y-1 rounded-2xl border border-dashed p-4 text-sm">
          <p className="font-medium">Pre-batch</p>
          <p className="text-muted-foreground">{batch.replace(/^pre-?batch\s*/i, "")}</p>
        </section>
      ) : null}
    </div>
  );
}

function ToolChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center text-xs">
      {children}
      <span className="leading-tight">{label}</span>
    </div>
  );
}

const GLASS_NAMES: Record<GlassKind, string> = {
  coupe: "Coupe",
  nick: "Nick & Nora",
  martini: "Martini",
  rocks: "Rocks",
  highball: "Highball",
  hurricane: "Hurricane",
  wine: "Wine glass",
  flute: "Flute",
  tiki: "Tiki Glass",
  mule: "Copper mug",
};

function GuideEditor({ c, onClose }: { c: Cocktail; onClose: () => void }) {
  const company = useCompany();
  const [steps, setSteps] = useState<Step[]>(c.steps.length ? c.steps : [{ tool: "glass", text: "" }]);
  const [glass, setGlass] = useState(c.glass || GLASS_NAMES[glassKind(c.glass)]);
  const [garnish, setGarnish] = useState(c.garnish);
  const [color, setColor] = useState(c.color || DEFAULT_COLOR);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j] as Step, n[i] as Step];
      return n;
    });
  const save = async () => {
    setBusy(true);
    const ok = await sendPos(api.recipes.saveGuide, {
      company,
      id: c.id,
      steps: steps.filter((s) => s.text.trim()),
      glass,
      garnish,
      color,
      confirmed,
    });
    setBusy(false);
    if (ok !== undefined) {
      onClose();
    }
  };

  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={busy} onClick={save}>
          Salvar instrução
        </Button>
      }
      onClose={onClose}
      open
      subtitle="Passos, copo, guarnição e cor do desenho"
      title={`Instrução · ${c.name}`}
    >
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className={cn(CARD, "grid gap-3 sm:grid-cols-[auto_1fr_1fr]")}>
          <Field label="Cor">
            <input
              className="h-10 w-14 cursor-pointer rounded-lg border bg-background"
              onChange={(e) => setColor(e.target.value)}
              type="color"
              value={color}
            />
          </Field>
          <Field label="Copo">
            <Input list="cocktail-glasses" onChange={(e) => setGlass(e.target.value)} value={glass} />
            <datalist id="cocktail-glasses">
              {Object.values(GLASS_NAMES).map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Guarnição">
            <Input onChange={(e) => setGarnish(e.target.value)} value={garnish} />
          </Field>
        </div>

        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li className={cn(CARD, "space-y-2")} key={i}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{i + 1}</span>
                <ToolArt className="size-9" tool={toolOf(s.tool)} />
                <select
                  className="h-9 flex-1 rounded-lg border bg-background px-2 text-sm"
                  onChange={(e) => patch(i, { tool: e.target.value })}
                  value={toolOf(s.tool)}
                >
                  {Object.entries(TOOLS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button onClick={() => move(i, -1)} size="sm" variant="ghost">
                  ↑
                </Button>
                <Button onClick={() => move(i, 1)} size="sm" variant="ghost">
                  ↓
                </Button>
                <Button onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} size="sm" variant="ghost">
                  <Icon className="size-4" name="IconTrashCan" />
                </Button>
              </div>
              <Textarea
                onChange={(e) => patch(i, { text: e.target.value })}
                placeholder="Português"
                rows={2}
                value={s.text}
              />
              <Textarea
                onChange={(e) => patch(i, { en: e.target.value })}
                placeholder="English"
                rows={2}
                value={s.en ?? ""}
              />
            </li>
          ))}
        </ol>
        <Button onClick={() => setSteps((s) => [...s, { tool: "jigger", text: "" }])} variant="outline">
          <Icon className="size-4" name="IconPlusLarge" />
          Adicionar passo
        </Button>
        {c.toConfirm ? (
          <label className="flex items-center gap-2 text-sm">
            <input checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} type="checkbox" />
            Medidas conferidas pelo bar (tira o aviso “medidas a confirmar”)
          </label>
        ) : null}
        <p className="text-muted-foreground text-xs">
          As quantidades dos ingredientes ficam na ficha técnica (Fichas técnicas), porque são elas que
          dão baixa no estoque.
        </p>
      </div>
    </FullPage>
  );
}
