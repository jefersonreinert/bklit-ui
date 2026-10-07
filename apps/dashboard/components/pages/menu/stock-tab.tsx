"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { type StockItem, stock, stockDays } from "@/lib/menu-data";
import { cn } from "@/lib/utils";

function stockStatus(s: StockItem) {
  if (s.current <= 0) {
    return { label: "Zerado", variant: "destructive" as const };
  }
  if (s.current < s.min) {
    return { label: "Abaixo do mínimo", variant: "destructive" as const };
  }
  if (stockDays(s) < 3) {
    return { label: "Repor em breve", variant: "secondary" as const };
  }
  return { label: "OK", variant: "outline" as const };
}

export function MenuStockTab() {
  const [ordered, setOrdered] = useState(false);
  const critical = useMemo(() => stock.filter((s) => s.current < s.min), []);
  const order = critical.map((s) => ({
    ...s,
    qty: Math.ceil(s.max - s.current),
  }));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {critical.length > 0 ? (
        <Alert>
          <Icon className="size-4" name="IconWarningSign" />
          <AlertTitle>
            {critical.length} insumos abaixo do estoque mínimo
          </AlertTitle>
          <AlertDescription>
            {critical.map((s) => s.name).join(" · ")} — pratos dependentes podem
            ficar indisponíveis.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint="Controlados na ficha técnica"
          icon="IconBox2"
          label="Insumos monitorados"
          tone="neutral"
          value={String(stock.length)}
        />
        <MetricTile
          hint="Precisam de compra"
          icon="IconWarningSign"
          label="Abaixo do mínimo"
          tone={critical.length > 0 ? "bad" : "good"}
          value={String(critical.length)}
        />
        <MetricTile
          hint="Média ponderada de consumo"
          icon="IconCalendarClock"
          label="Cobertura média"
          tone="good"
          value={`${(stock.reduce((a, s) => a + Math.min(stockDays(s), 30), 0) / stock.length).toFixed(1).replace(".", ",")} dias`}
        />
        <MetricTile
          hint="Desperdício registrado no mês"
          icon="IconReceiptStorno"
          label="Perdas"
          tone="warn"
          value="2,9%"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Nível atual · marcador = estoque mínimo"
          title="Estoque de insumos"
        >
          <ul className="flex flex-col divide-y">
            {stock.map((s) => {
              const status = stockStatus(s);
              const pct = Math.min(100, (s.current / s.max) * 100);
              const minPct = (s.min / s.max) * 100;
              const days = stockDays(s);
              return (
                <li className="flex flex-col gap-2 py-3" key={s.name}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{s.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {s.supplier} · consumo {s.dailyUse} {s.unit}/dia
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums">
                        {s.current} / {s.max} {s.unit}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </div>
                  <div className="relative h-2 w-full overflow-visible rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        s.current < s.min
                          ? "bg-destructive"
                          : "bg-[var(--chart-1)] dark:bg-foreground"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
                      style={{ left: `${minPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {Number.isFinite(days)
                      ? `Dura ~${days.toFixed(1).replace(".", ",")} dias`
                      : "Sem consumo"}
                  </p>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        <ChartCard
          description="Repõe até o estoque máximo"
          title="Pedido de compra sugerido"
        >
          {order.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum insumo precisa de reposição.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y">
                {order.map((o) => (
                  <li
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                    key={o.name}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {o.name}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {o.supplier}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {o.qty} {o.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <Button disabled={ordered} onClick={() => setOrdered(true)}>
                <Icon
                  className="size-4"
                  name={ordered ? "IconCheckCircle2" : "IconTruck"}
                />
                {ordered ? "Pedido enviado aos fornecedores" : "Enviar pedido"}
              </Button>
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  );
}
