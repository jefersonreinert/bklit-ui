"use client";

import { Icon } from "@/lib/icons";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type BeverageKind,
  kindIcon,
  kindLabel,
  type MenuLine,
} from "@/lib/beverage-data";
import { formatBRL, formatBRLCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CmvValue, FilterSelect, normalize, SearchInput } from "./bev-shared";

const KINDS: BeverageKind[] = [
  "coquetel",
  "vinho",
  "cerveja",
  "destilado",
  "sem-alcool",
];
const ALL = "todos";

type SortKey = "carta" | "cmv" | "lucro" | "vendas";

export function CartaTab({ lines }: { lines: MenuLine[] }) {
  const [query, setQuery] = useState("");
  const [internal, setInternal] = useState(true);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [kind, setKind] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("carta");

  const filtered = useMemo(() => {
    const q = normalize(query);
    const list = lines.filter(
      (l) =>
        (kind === ALL || l.kind === kind) &&
        (!hideUnavailable || l.available) &&
        (q === "" || normalize(`${l.name} ${l.detail} ${l.group}`).includes(q))
    );
    if (sort === "cmv") {
      return [...list].sort((a, b) => b.cmv - a.cmv);
    }
    if (sort === "lucro") {
      return [...list].sort((a, b) => b.profit - a.profit);
    }
    if (sort === "vendas") {
      return [...list].sort((a, b) => b.sales - a.sales);
    }
    return list;
  }, [lines, query, kind, hideUnavailable, sort]);

  const sections = KINDS.map((k) => {
    const items = filtered.filter((l) => l.kind === k);
    const groups =
      sort === "carta" ? [...new Set(items.map((i) => i.group))] : ["__all"];
    return {
      kind: k,
      groups: groups.map((g) => ({
        name: g,
        items: g === "__all" ? items : items.filter((i) => i.group === g),
      })),
    };
  }).filter((s) => s.groups.some((g) => g.items.length > 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center print:hidden">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar em toda a carta"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Toda a carta" },
            ...KINDS.map((k) => ({ value: k, label: kindLabel[k] })),
          ]}
          onChange={setKind}
          value={kind}
        />
        <FilterSelect
          items={[
            { value: "carta", label: "Ordem da carta" },
            { value: "lucro", label: "Maior lucro" },
            { value: "cmv", label: "Maior CMV" },
            { value: "vendas", label: "Mais vendidos" },
          ]}
          onChange={(v) => setSort(v as SortKey)}
          value={sort}
        />
        <div className="flex items-center gap-2 text-sm">
          <Switch
            aria-label="Mostrar custos e margem"
            checked={internal}
            onCheckedChange={setInternal}
          />
          Custos e margem
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            aria-label="Ocultar itens em falta"
            checked={hideUnavailable}
            onCheckedChange={setHideUnavailable}
          />
          Ocultar em falta
        </div>
        <Button onClick={() => window.print()} variant="outline">
          <Icon className="size-4" name="IconPrinter" />
          Imprimir
        </Button>
      </div>

      <ChartCard
        description={
          internal
            ? `${filtered.length} itens · visão interna com custo, CMV e lucro do mês`
            : `${filtered.length} itens · visão do cliente`
        }
        title="Carta de bebidas — Casa Brasa"
      >
        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section className="flex flex-col gap-4" key={section.kind}>
              <h3 className="flex items-center gap-2 border-b pb-2 font-semibold text-lg tracking-tight">
                <Icon className="size-5" name={kindIcon[section.kind]} />
                {kindLabel[section.kind]}
              </h3>
              {section.groups.map((g) =>
                g.items.length === 0 ? null : (
                  <div className="flex flex-col gap-1" key={g.name}>
                    {g.name === "__all" ? null : (
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {g.name}
                      </p>
                    )}
                    <ul className="flex flex-col">
                      {g.items.map((l) => (
                        <li
                          className={cn(
                            "grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 border-border/50 border-b border-dashed py-2 last:border-0",
                            internal &&
                              "md:grid-cols-[1fr_auto_auto_auto_auto]",
                            !l.available && "opacity-50"
                          )}
                          key={l.id}
                        >
                          <div className="min-w-0">
                            <p className="font-medium">
                              {l.name}
                              {l.available ? null : (
                                <Badge
                                  className="ml-2 align-middle"
                                  variant="destructive"
                                >
                                  Em falta
                                </Badge>
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {l.detail}
                            </p>
                          </div>
                          <p className="text-right font-semibold tabular-nums">
                            {formatBRL(l.price)}
                            <span className="ml-1 font-normal text-muted-foreground text-xs">
                              {l.priceLabel}
                            </span>
                            {l.secondaryPrice ? (
                              <span className="block font-normal text-muted-foreground text-xs">
                                {formatBRL(l.secondaryPrice.value)}{" "}
                                {l.secondaryPrice.label}
                              </span>
                            ) : null}
                          </p>
                          {internal ? (
                            <>
                              <p className="text-muted-foreground text-xs tabular-nums md:text-right">
                                custo {formatBRLCents(l.cost)}
                              </p>
                              <p className="text-xs md:text-right">
                                CMV <CmvValue kind={l.kind} value={l.cmv} />
                              </p>
                              <p className="text-xs tabular-nums md:min-w-28 md:text-right">
                                lucro mês{" "}
                                <span className="font-medium">
                                  {formatBRL(l.profit)}
                                </span>
                              </p>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </section>
          ))}
          {sections.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground text-sm">
              Nada encontrado.
            </p>
          ) : null}
        </div>
      </ChartCard>
    </div>
  );
}
