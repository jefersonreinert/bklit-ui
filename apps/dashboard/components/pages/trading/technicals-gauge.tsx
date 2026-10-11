"use client";

import { useState } from "react";
import {
  RATING_LABEL,
  type Rating,
  type Signal,
  type Technicals,
} from "@/lib/markets/technicals";
import { cn } from "@/lib/utils";

/** TradingView-style technical rating: needle gauge + signal tables. */

const RATING_COLOR: Record<Rating, string> = {
  strong_sell: "text-[var(--down)]",
  sell: "text-[var(--down)]",
  neutral: "text-muted-foreground",
  buy: "text-[#2962ff]",
  strong_buy: "text-[#2962ff]",
};

const CX = 120;
const CY = 112;
const R = 88;

/** Point on the arc for a score in [-1, 1] (left = strong sell). */
const polar = (score: number, r = R) => {
  const a = Math.PI * (1 - (score + 1) / 2);
  return { x: CX + Math.cos(a) * r, y: CY - Math.sin(a) * r };
};

function Gauge({ score, rating }: { score: number; rating: Rating }) {
  const start = polar(-1);
  const end = polar(1);
  const needle = polar(score, R - 18);
  const labels: [number, string, "start" | "middle" | "end"][] = [
    [-1, "Venda forte", "end"],
    [-0.5, "Venda", "end"],
    [0, "Neutro", "middle"],
    [0.5, "Compra", "start"],
    [1, "Compra forte", "start"],
  ];
  return (
    <svg
      aria-hidden="true"
      className="mx-auto w-full max-w-sm"
      viewBox="-34 -6 308 146"
    >
      <defs>
        <linearGradient id="tech-arc" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#ef5350" />
          <stop offset="50%" stopColor="#9c6ade" />
          <stop offset="100%" stopColor="#2962ff" />
        </linearGradient>
      </defs>
      <path
        d={`M${start.x} ${start.y}A${R} ${R} 0 0 1 ${end.x} ${end.y}`}
        fill="none"
        stroke="url(#tech-arc)"
        strokeLinecap="round"
        strokeWidth="10"
      />
      {labels.map(([s, text, anchor]) => {
        const p = polar(s, R + 14);
        return (
          <text
            className="fill-muted-foreground text-[9px]"
            key={text}
            textAnchor={anchor}
            x={p.x}
            y={s === 0 ? p.y - 2 : p.y + 3}
          >
            {text}
          </text>
        );
      })}
      <line
        className="stroke-foreground"
        strokeLinecap="round"
        strokeWidth="2.5"
        x1={CX}
        x2={needle.x}
        y1={CY}
        y2={needle.y}
      />
      <circle className="fill-foreground" cx={CX} cy={CY} r="5" />
      <text
        className={cn("font-semibold text-[15px]", RATING_COLOR[rating])}
        fill="currentColor"
        textAnchor="middle"
        x={CX}
        y={CY + 26}
      >
        {RATING_LABEL[rating]}
      </text>
    </svg>
  );
}

const VOTE_LABEL = { 1: "Compra", 0: "Neutro", "-1": "Venda" } as const;

function SignalTable({
  signals,
  digits,
}: {
  signals: Signal[];
  digits: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground text-xs">
          <th className="py-1 font-normal">Nome</th>
          <th className="py-1 text-right font-normal">Valor</th>
          <th className="py-1 text-right font-normal">Ação</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s) => (
          <tr className="border-t" key={s.name}>
            <td className="py-1.5">{s.name}</td>
            <td className="py-1.5 text-right tabular-nums">
              {s.value == null ? "—" : s.value.toFixed(Math.min(digits, 5))}
            </td>
            <td
              className={cn(
                "py-1.5 text-right",
                s.vote === 1 && "text-[#2962ff]",
                s.vote === -1 && "text-[var(--down)]",
                s.vote === 0 && "text-muted-foreground"
              )}
            >
              {s.value == null ? "—" : VOTE_LABEL[s.vote]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type View = "summary" | "ma" | "osc";

export function TechnicalsGauge({
  data,
  digits,
}: {
  data: Technicals;
  digits: number;
}) {
  const [view, setView] = useState<View>("summary");
  const [details, setDetails] = useState(false);
  const shown =
    view === "summary"
      ? { score: data.score, rating: data.rating }
      : data[view];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center gap-1">
        {(
          [
            ["summary", "Resumo"],
            ["ma", "Médias móveis"],
            ["osc", "Osciladores"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              view === v ? "bg-foreground text-background" : "bg-muted"
            )}
            key={v}
            onClick={() => setView(v)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Gauge rating={shown.rating} score={shown.score} />
      <p className="text-center text-muted-foreground text-xs">
        Venda {data.counts.sell} · Neutro {data.counts.neutral} · Compra{" "}
        {data.counts.buy} — gráfico diário
      </p>
      <button
        className="mx-auto font-medium text-sm hover:underline"
        onClick={() => setDetails(!details)}
        type="button"
      >
        {details ? "Menos técnicos" : "Mais técnicos ›"}
      </button>
      {details ? (
        <div className="flex flex-col gap-4">
          <SignalTable digits={digits} signals={data.osc.signals} />
          <SignalTable digits={digits} signals={data.ma.signals} />
          <p className="text-muted-foreground text-xs">
            Indicadores calculados no painel a partir das velas diárias do
            último ano. Não é recomendação de investimento.
          </p>
        </div>
      ) : null}
    </div>
  );
}
