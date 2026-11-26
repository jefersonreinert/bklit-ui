"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Line drawings for the cocktail guide: glasses (filled with the drink's
 * colour), bar tools and garnishes. One style everywhere: 64×64, round
 * 1.75 strokes in the text colour, flat fills only where colour helps.
 */

type Svg = { className?: string; title?: string };

function Frame({ className, title, children }: Svg & { children: ReactNode }) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("size-16 shrink-0", className)}
      fill="none"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 64 64"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* --------------------------------- glasses -------------------------------- */

export const GLASSES = {
  coupe: "Coupe",
  nick: "Nick & Nora",
  martini: "Martini",
  rocks: "Rocks / Old Fashioned",
  highball: "Highball",
  hurricane: "Hurricane",
  wine: "Taça de vinho",
  flute: "Flute",
  tiki: "Tiki",
  mule: "Caneca de mule",
} as const;

export type GlassKind = keyof typeof GLASSES;

/** "Coupe / Nick & Nora", "Old Fashioned", "The Brew Wine Glass" → a drawing. */
export function glassKind(text: string): GlassKind {
  const s = text.toLowerCase();
  if (s.includes("tiki")) return "tiki";
  if (s.includes("hurricane") || s.includes("poco")) return "hurricane";
  if (s.includes("mule") || s.includes("copper") || s.includes("caneca")) return "mule";
  if (s.includes("flute")) return "flute";
  if (s.includes("wine") || s.includes("vinho") || s.includes("balloon") || s.includes("spritz")) return "wine";
  if (s.includes("coupe")) return "coupe";
  if (s.includes("nick")) return "nick";
  if (s.includes("martini")) return "martini";
  if (s.includes("rocks") || s.includes("old fashioned") || s.includes("tumbler")) return "rocks";
  return "highball";
}

const STEM = (
  <>
    <path d="M32 36v16" />
    <path d="M22 55c3-2 17-2 20 0" />
  </>
);

/** A glass with the drink in it. */
export function Glass({
  kind,
  color = "#d98a4a",
  ice = true,
  className,
  title,
}: Svg & { kind: GlassKind; color?: string; ice?: boolean }) {
  const fill = { fill: color, fillOpacity: 0.85, stroke: "none" } as const;
  const cube = (x: number, y: number, r: number) => (
    <rect
      fill="#fff"
      fillOpacity={0.55}
      height="9"
      rx="1.5"
      strokeWidth={1.25}
      transform={`rotate(${r} ${x + 4.5} ${y + 4.5})`}
      width="9"
      x={x}
      y={y}
    />
  );
  const body: Record<GlassKind, ReactNode> = {
    coupe: (
      <>
        <path d="M15.5 17c1 9 7 15 16.5 15s15.5-6 16.5-15z" {...fill} />
        <path d="M13 13c0 13 8 21 19 21s19-8 19-21" />
        <path d="M13 13h38" />
        {STEM}
      </>
    ),
    nick: (
      <>
        <path d="M21 16c0 10 4 16 11 16s11-6 11-16z" {...fill} />
        <path d="M19 9c0 16 5 25 13 25s13-9 13-25" />
        <path d="M19 9h26" />
        {STEM}
      </>
    ),
    martini: (
      <>
        <path d="M17 17h30L32 33z" {...fill} />
        <path d="M11 11h42L32 35z" />
        {STEM}
      </>
    ),
    rocks: (
      <>
        <path d="M17.6 32h28.8l-1.3 21.5H18.9z" {...fill} />
        <path d="M15 22l2.5 33h29L49 22" />
        {ice ? (
          <>
            {cube(21, 33, -12)}
            {cube(33, 35, 14)}
          </>
        ) : null}
        <path d="M18 51.5h28" strokeOpacity={0.35} />
      </>
    ),
    highball: (
      <>
        <path d="M21.3 20h21.4l-1 34H22.3z" {...fill} />
        <path d="M20 8l1.5 48h21L44 8" />
        {ice ? (
          <>
            {cube(24, 22, -10)}
            {cube(31, 31, 12)}
            {cube(24, 40, 6)}
          </>
        ) : null}
        <path d="M37 4l-5 22" strokeWidth={2.25} />
      </>
    ),
    hurricane: (
      <>
        <path d="M23.5 16c-2.5 6 1.6 10-.4 15.6C20.8 38.5 24 45 32 45.5s11.2-7 8.9-13.9C38.9 26 43 22 40.5 16z" {...fill} />
        <path d="M22 6c-1.5 9 4 14 1 24-2.6 8.5.7 16.6 9 17 8.3-.4 11.6-8.5 9-17-3-10 2.5-15 1-24" />
        <path d="M32 47v6" />
        <path d="M23 56c3-2 15-2 18 0" />
      </>
    ),
    wine: (
      <>
        <path d="M18.8 20c.7 8 5 13.5 13.2 13.5S44.5 28 45.2 20z" {...fill} />
        <path d="M18 7c-1.5 17 3.5 28 14 28s15.5-11 14-28z" />
        {ice ? (
          <>
            {cube(24, 22, -12)}
            {cube(33, 23, 15)}
          </>
        ) : null}
        {STEM}
      </>
    ),
    flute: (
      <>
        <path d="M25.6 13h12.8c-.2 9-2.2 18-6.4 18s-6.2-9-6.4-18z" {...fill} />
        <path d="M25 5c-.5 15 1.5 30 7 30s7.5-15 7-30z" />
        <circle cx="31" cy="24" fill="#fff" r=".9" stroke="none" />
        <circle cx="33.5" cy="18" fill="#fff" r=".9" stroke="none" />
        <circle cx="31.5" cy="15" fill="#fff" r=".7" stroke="none" />
        {STEM}
      </>
    ),
    tiki: (
      <>
        <path d="M20.6 14h22.8l-1.6 40H22.2z" {...fill} />
        <path d="M19 6l2.6 50h20.8L45 6z" />
        <path d="M24 24h6M34 24h6" strokeWidth={2.5} />
        <path d="M25 33c2 3 12 3 14 0" />
        <path d="M24 41h16M26 45v-4M30 45v-4M34 45v-4M38 45v-4" strokeWidth={1.25} />
      </>
    ),
    mule: (
      <>
        <path d="M16 18h28l-2.2 34H18.2z" fill="#c8794a" fillOpacity={0.8} stroke="none" />
        <path d="M14 14h32l-2.5 41h-27z" />
        <path d="M45.4 22c9 0 9.5 20 .2 20" strokeWidth={3} />
        <path d="M17 22h26" stroke="#fff" strokeOpacity={0.6} />
        <path d="M22 9c2-3 4 0 6-3" stroke="#3f8f4f" />
      </>
    ),
  };
  return (
    <Frame className={className} title={title}>
      {body[kind]}
    </Frame>
  );
}

/* ---------------------------------- tools --------------------------------- */

export const TOOLS = {
  glass: "Copo",
  ice: "Gelo",
  "crushed-ice": "Gelo picado",
  jigger: "Jigger",
  muddler: "Pilão (muddler)",
  shaker: "Coqueteleira (shaker)",
  "dry-shake": "Dry shake",
  "mixing-glass": "Mixing glass",
  "bar-spoon": "Bar spoon",
  strainer: "Hawthorne strainer",
  "fine-strainer": "Coador fino",
  top: "Completar",
  rim: "Borda",
  zest: "Zest",
  spray: "Borrifador",
  torch: "Maçarico",
  espresso: "Espresso",
  blender: "Liquidificador",
  tweezers: "Pinça de guarnição",
  knife: "Faca de bar",
  opener: "Saca-rolhas",
  squeezer: "Espremedor",
  spout: "Bico dosador",
  dasher: "Dasher de bitters",
  scoop: "Pá de gelo",
  tongs: "Pinça de gelo",
  bucket: "Balde de gelo",
  board: "Tábua de corte",
  "bar-mat": "Tapete de bar",
  garnish: "Guarnição",
} as const;

export type ToolKind = keyof typeof TOOLS;

export const toolOf = (s: string): ToolKind => (s in TOOLS ? (s as ToolKind) : "jigger");

const MOTION = (
  <path d="M8 22c-2 4-2 8 0 12M12 25c-1 2-1 4 0 6M56 30c2 4 2 8 0 12M52 33c1 2 1 4 0 6" strokeWidth={1.5} />
);

export function ToolArt({ tool, className, title }: Svg & { tool: ToolKind }) {
  const steel = { fill: "#c9ccd1", fillOpacity: 0.45 } as const;
  const art: Partial<Record<ToolKind, ReactNode>> = {
    shaker: (
      <>
        <path d="M27 4h10v5H27z" {...steel} />
        <path d="M24 9h16l-2 8H26z" {...steel} />
        <path d="M23 17h18l-3.5 40h-11z" {...steel} />
        <path d="M24.8 26h14.4" strokeOpacity={0.4} />
        {MOTION}
      </>
    ),
    "dry-shake": (
      <>
        <path d="M27 4h10v5H27z" {...steel} />
        <path d="M24 9h16l-2 8H26z" {...steel} />
        <path d="M23 17h18l-3.5 40h-11z" {...steel} />
        <circle cx="32" cy="37" fill="#fff" r="5" strokeWidth={1.25} />
        <path d="M29.5 34.5l5 5M34.5 34.5l-5 5" strokeWidth={1.25} />
        {MOTION}
      </>
    ),
    "bar-spoon": (
      <>
        <circle cx="49" cy="7" r="3" {...steel} />
        <path d="M47 10l-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2-1.6 2.4 1.8 1.2L29 42" strokeWidth={1.4} />
        <ellipse cx="23" cy="50" rx="5" ry="8.5" transform="rotate(34 23 50)" {...steel} />
      </>
    ),
    jigger: (
      <>
        <path d="M20 8h24l-9 22h-6z" {...steel} />
        <path d="M29 34h6l9 22H20z" {...steel} />
        <path d="M29 30h6v4h-6z" />
        <path d="M23.5 15h17M24.5 49h15" strokeOpacity={0.45} />
      </>
    ),
    strainer: (
      <>
        <circle cx="25" cy="32" r="15" {...steel} />
        <circle cx="25" cy="32" r="10.5" strokeDasharray="2 2.2" strokeWidth={1.4} />
        <path d="M40 30h17a2 2 0 010 4H40" />
        <path d="M14 21l-4-4M14 43l-4 4" />
      </>
    ),
    "fine-strainer": (
      <>
        <path d="M12 16h30L27 46z" {...steel} />
        <path d="M17 22l13 0M20 28h11M23 34h7M19 16l8 30M27 16v30M35 16l-8 30" strokeOpacity={0.5} strokeWidth={1.1} />
        <path d="M42 16l16-8" strokeWidth={2.5} />
      </>
    ),
    muddler: (
      <>
        <path d="M44 4l7 4-22 42-7-4z" fill="#b88654" fillOpacity={0.55} />
        <path d="M22 46l7 4-2.5 5.5-7-4z" fill="#8a5a33" fillOpacity={0.7} />
        <path d="M20 52l-1 2M23.5 54l-1 2M27 56l-1 2" strokeWidth={1.25} />
      </>
    ),
    "mixing-glass": (
      <>
        <path d="M15 12l2.5 44h29L49 12z" fill="#dbeaf5" fillOpacity={0.5} />
        <path d="M15 12c-2 0-4-1-4-3" />
        <path d="M23 14v40M32 14v40M41 14v40" strokeOpacity={0.3} />
        <path d="M17 30h30" strokeOpacity={0.35} />
      </>
    ),
    ice: (
      <>
        <rect fill="#dff2fb" height="20" rx="4" transform="rotate(-12 21 38)" width="20" x="11" y="28" />
        <rect fill="#dff2fb" height="20" rx="4" transform="rotate(14 43 40)" width="20" x="33" y="30" />
        <rect fill="#dff2fb" height="18" rx="4" transform="rotate(4 32 19)" width="18" x="23" y="10" />
        <path d="M16 33l4-1M37 35l4 1M27 15l4 0" stroke="#fff" />
      </>
    ),
    "crushed-ice": (
      <>
        <path d="M10 52l6-8 7 3 5-9 8 4 6-7 7 6 5 11z" fill="#dff2fb" />
        <path d="M18 40l4-6 5 3zM33 32l4-5 4 4zM45 38l4-3 2 5z" fill="#dff2fb" />
        <path d="M24 30l2-3 3 2zM39 24l2-3 2 3z" fill="#dff2fb" />
      </>
    ),
    top: (
      <>
        <path d="M35 6l8 5-4 7 5 3-13 22-11-6.5 13-22 5 3z" fill="#7ab06a" fillOpacity={0.55} />
        <path d="M21 40c-2 4-3 8-3 14" stroke="#e5b84b" strokeDasharray="0" strokeWidth={2.5} />
        <path d="M10 46l2 12h12l2-12" />
      </>
    ),
    rim: (
      <>
        <ellipse cx="32" cy="50" fill="#f1f1f1" rx="24" ry="6" />
        <path d="M14 10c0 13 8 21 18 21s18-8 18-21" />
        <path d="M14 10h36" />
        {[17, 21, 26, 31, 36, 41, 46].map((x) => (
          <circle cx={x} cy={x % 2 ? 11.5 : 12.5} fill="currentColor" key={x} r="1" stroke="none" />
        ))}
        <path d="M24 48h1M30 51h1M38 49h1M44 51h1M19 51h1" strokeWidth={2} />
      </>
    ),
    zest: (
      <>
        <path d="M12 40c6-10 16-14 26-10s14 2 18-4c-2 10-10 14-20 11s-16 1-24 3z" fill="#f2a33a" fillOpacity={0.85} />
        <path d="M40 22c2-4 6-6 10-6" strokeDasharray="1 3" strokeWidth={2} />
        <path d="M46 14l2 2M52 20l2 1" strokeWidth={1.5} />
      </>
    ),
    spray: (
      <>
        <path d="M22 26h18v30H22z" fill="#dbeaf5" fillOpacity={0.6} />
        <path d="M26 18h10v8H26z" />
        <path d="M36 21h6" />
        <path d="M46 16l6-3M47 21h7M46 26l6 3" strokeDasharray="1 2.5" strokeWidth={2} />
      </>
    ),
    torch: (
      <>
        <path d="M14 46l18-12 6 8-18 12z" fill="#555" fillOpacity={0.35} />
        <path d="M38 38l6-4" />
        <path d="M46 31c4-6 2-12-1-16 0 5-5 6-3 12-3-2-3-5-2-7-4 4-3 9 0 11" fill="#f4a03b" fillOpacity={0.85} />
      </>
    ),
    espresso: (
      <>
        <path d="M18 30h24v8c0 9-5 14-12 14s-12-5-12-14z" fill="#f5f0ea" />
        <path d="M20 32h20" stroke="#6b3e1f" strokeWidth={3} />
        <path d="M42 34c6 0 6 8 0 8" />
        <path d="M14 56h32" />
        <path d="M26 24c-2-3 2-5 0-8M33 24c-2-3 2-5 0-8" strokeWidth={1.4} />
      </>
    ),
    tweezers: (
      <>
        <path d="M24 4l7 50M40 4l-7 50" strokeWidth={2.25} />
        <path d="M31 54l1 5 1-5" />
        <path d="M24 4h16" />
        <path d="M26 16l1 6M38 16l-1 6" strokeOpacity={0.4} />
      </>
    ),
    knife: (
      <>
        <path d="M10 44L44 14c4 6 4 12-2 18L22 50z" {...steel} />
        <path d="M22 50l-6 6c-2 2-6 0-5-3l5-6" fill="#3b3b3b" fillOpacity={0.75} />
        <path d="M20 42l18-16" strokeOpacity={0.35} />
      </>
    ),
    opener: (
      <>
        <path d="M8 34h40a6 6 0 010 12H14a6 6 0 01-6-6z" fill="#6b3e1f" fillOpacity={0.6} />
        <path d="M34 34c0-6 1-12 0-18M34 16c-3 2-3 4 0 6 3 2 3 4 0 6" strokeWidth={1.5} />
        <path d="M48 34l8-8" strokeWidth={2.25} />
        <path d="M10 34l6-6" />
      </>
    ),
    squeezer: (
      <>
        <path d="M6 30h18c4 0 8 3 8 6s-4 6-8 6H6" fill="#e8c02c" fillOpacity={0.55} />
        <path d="M32 36l26-12" strokeWidth={3} />
        <path d="M32 36l26 6" strokeWidth={3} />
        <circle cx="32" cy="36" r="2.5" fill="currentColor" />
        <path d="M14 30v12" strokeOpacity={0.4} />
      </>
    ),
    spout: (
      <>
        <path d="M24 40h16v16H24z" fill="#333" fillOpacity={0.6} />
        <path d="M30 40V22l20-14 2 3-18 14v15" {...steel} />
        <path d="M24 46h16M24 51h16" strokeOpacity={0.4} />
      </>
    ),
    dasher: (
      <>
        <path d="M20 24c0-4 4-6 12-6s12 2 12 6v28c0 3-2 5-5 5H25c-3 0-5-2-5-5z" fill="#8a3b25" fillOpacity={0.55} />
        <path d="M28 18v-6h8v6" {...steel} />
        <path d="M32 12V6" strokeWidth={1.5} />
        <path d="M22 34h20v12H22z" fill="#f4e7d0" />
      </>
    ),
    scoop: (
      <>
        <path d="M8 26c0-6 6-10 14-10h20v22H22c-8 0-14-4-14-12z" {...steel} />
        <path d="M42 22h8a4 4 0 014 4v6a4 4 0 01-4 4h-8" />
        <path d="M14 22c2-2 5-3 8-3" stroke="#fff" />
        <path d="M42 27h16" strokeWidth={3} />
      </>
    ),
    tongs: (
      <>
        <path d="M32 6c-8 0-10 6-12 16l-6 26c-1 4 1 8 4 9M32 6c8 0 10 6 12 16l6 26c1 4-1 8-4 9" strokeWidth={2.25} />
        <path d="M12 54l6 4M52 54l-6 4" strokeWidth={3} />
        <path d="M26 8h12" strokeWidth={3} />
      </>
    ),
    bucket: (
      <>
        <path d="M12 22h40l-5 32H17z" {...steel} />
        <path d="M10 22h44" strokeWidth={2.25} />
        <path d="M14 22c0-12 36-12 36 0" />
        <rect fill="#dff2fb" height="8" rx="1.5" width="8" x="20" y="14" />
        <rect fill="#dff2fb" height="8" rx="1.5" transform="rotate(12 37 17)" width="8" x="33" y="13" />
      </>
    ),
    board: (
      <>
        <rect fill="#c99a62" fillOpacity={0.55} height="34" rx="5" width="46" x="6" y="20" />
        <circle cx="52" cy="26" r="3" />
        <circle cx="22" cy="38" fill="#b9dd6a" r="8" />
        <path d="M22 30v16M14 38h16" stroke="#fff" strokeWidth={1.25} />
        <path d="M34 34h10M34 40h8" strokeOpacity={0.35} />
      </>
    ),
    "bar-mat": (
      <>
        <rect fill="#3b3b3b" fillOpacity={0.3} height="30" rx="4" width="52" x="6" y="18" />
        {[14, 22, 30, 38, 46, 54].map((x) =>
          [25, 33, 41].map((y) => <circle cx={x - 2} cy={y} fill="currentColor" key={`${x}-${y}`} r="1.6" stroke="none" />)
        )}
      </>
    ),
    blender: (
      <>
        <path d="M20 6h24l-3 32H23z" fill="#dbeaf5" fillOpacity={0.5} />
        <path d="M18 38h28v16H18z" fill="#888" fillOpacity={0.3} />
        <circle cx="32" cy="46" r="3" />
        <path d="M28 32l8-4M28 28l8 4" />
      </>
    ),
  };
  if (tool === "glass") {
    return <Glass className={className} ice={false} kind="highball" title={title} />;
  }
  if (tool === "garnish") {
    return <GarnishArt className={className} kind="mint" title={title} />;
  }
  return (
    <Frame className={className} title={title}>
      {art[tool] ?? art.jigger}
    </Frame>
  );
}

/* -------------------------------- garnishes ------------------------------- */

export const GARNISHES = {
  lime: "Lima",
  lemon: "Limão",
  orange: "Laranja",
  peel: "Zest de laranja",
  mint: "Hortelã",
  rosemary: "Alecrim",
  coffee: "Grãos de café",
  anise: "Anis-estrelado",
  berries: "Frutos vermelhos",
  strawberry: "Morango",
  pineapple: "Abacaxi",
  cherry: "Cereja",
  passion: "Maracujá",
  salt: "Sal",
  sugar: "Açúcar",
  cinnamon: "Canela",
} as const;

export type GarnishKind = keyof typeof GARNISHES;

const GARNISH_WORDS: [GarnishKind, RegExp][] = [
  ["peel", /zest|casca|peel|twist/],
  ["lime", /\blima\b|\blime/],
  ["lemon", /lim[aã]o|lemon/],
  ["orange", /laranja|orange/],
  ["mint", /hortel|mint/],
  ["rosemary", /alecrim|rosemary/],
  ["coffee", /caf[eé]|coffee/],
  ["anise", /anis|anise/],
  ["berries", /mirtilo|blueberr|amora|blackberr|berr|framboesa|raspberr/],
  ["strawberry", /morango|strawberr/],
  ["pineapple", /abacaxi|anan[aá]s|pineapple/],
  ["cherry", /cereja|cherry|maraschino/],
  ["passion", /maracuj|passion/],
  ["salt", /\bsal\b|salt/],
  ["sugar", /a[cç][uú]car|sugar/],
  ["cinnamon", /canela|cinnamon/],
];

/** "Alecrim queimado; abacaxi seco; mirtilos" → rosemary, pineapple, berries. */
export function garnishKinds(text: string): GarnishKind[] {
  const s = text.toLowerCase();
  const found = GARNISH_WORDS.filter(([, re]) => re.test(s)).map(([k]) => k);
  // "Zest de laranja" is a peel, not an orange wheel too
  return found.filter((k) => !(k === "orange" && found.includes("peel") && !/rodela|fatia|slice|wheel|desidrat|dried/.test(s)));
}

function wheel(rim: string, flesh: string) {
  return (
    <>
      <circle cx="32" cy="32" fill={rim} r="22" />
      <circle cx="32" cy="32" fill={flesh} r="18" stroke="none" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path d="M32 32V15" key={a} stroke="#fff" strokeOpacity={0.85} strokeWidth={1.5} transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" fill="#fff" r="2.5" stroke="none" />
    </>
  );
}

export function GarnishArt({ kind, className, title }: Svg & { kind: GarnishKind }) {
  const leaf = "#4f9a4a";
  const art: Record<GarnishKind, ReactNode> = {
    lime: wheel("#5f9e2f", "#b9dd6a"),
    lemon: wheel("#e8c02c", "#fbe98a"),
    orange: wheel("#e9862a", "#f8b766"),
    peel: (
      <path d="M10 44c8-14 20-18 30-12s14 2 16-6c0 12-8 18-19 15S18 41 10 44z" fill="#f2a33a" />
    ),
    mint: (
      <>
        <path d="M32 58V20" stroke={leaf} />
        <path d="M32 24c-12-2-16-12-14-18 8 0 14 8 14 18z" fill="#6cc06a" />
        <path d="M32 24c12-2 16-12 14-18-8 0-14 8-14 18z" fill="#5bb25a" />
        <path d="M32 40c-12 0-18-8-17-15 8-1 16 6 17 15z" fill="#6cc06a" />
        <path d="M32 40c12 0 18-8 17-15-8-1-16 6-17 15z" fill="#5bb25a" />
      </>
    ),
    rosemary: (
      <>
        <path d="M18 58L46 6" stroke="#6a5a3a" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const x = 21 + i * 3.3;
          const y = 52 - i * 6;
          return (
            <g key={i}>
              <path d={`M${x} ${y}l-9-3`} stroke={leaf} strokeWidth={2.5} />
              <path d={`M${x} ${y}l7-7`} stroke={leaf} strokeWidth={2.5} />
            </g>
          );
        })}
      </>
    ),
    coffee: (
      <>
        {(
          [
            [22, 26, -25],
            [40, 24, 20],
            [31, 42, 5],
          ] as const
        ).map(([x, y, r]) => (
          <g key={`${x}`} transform={`rotate(${r} ${x} ${y})`}>
            <ellipse cx={x} cy={y} fill="#6b3e1f" rx="8" ry="11" />
            <path d={`M${x} ${y - 9}c-3 5 3 13 0 18`} stroke="#3c200e" />
          </g>
        ))}
      </>
    ),
    anise: (
      <>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <path
            d="M32 32c-3-6-3-14 0-22 3 8 3 16 0 22z"
            fill="#8b4a26"
            key={a}
            transform={`rotate(${a} 32 32)`}
          />
        ))}
        <circle cx="32" cy="32" fill="#5a2e16" r="3" stroke="none" />
      </>
    ),
    berries: (
      <>
        {[
          [22, 30, "#4a5aa8"],
          [36, 26, "#3f4f99"],
          [30, 41, "#5565b5"],
          [44, 39, "#2b2b45"],
        ].map(([x, y, c]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x as number} cy={y as number} fill={c as string} r="8" />
            <path d={`M${(x as number) - 2} ${(y as number) - 5}l2 2 2-2`} stroke="#fff" strokeOpacity={0.7} strokeWidth={1.25} />
          </g>
        ))}
      </>
    ),
    strawberry: (
      <>
        <path d="M32 58c-12-6-20-18-18-28 2-8 10-10 18-8 8-2 16 0 18 8 2 10-6 22-18 28z" fill="#e0433f" />
        <path d="M22 18c4 2 7 3 10 3s6-1 10-3c-2 6-6 7-10 6-4 1-8 0-10-6z" fill={leaf} />
        {[
          [26, 32],
          [38, 32],
          [32, 39],
          [25, 43],
          [39, 43],
          [32, 50],
        ].map(([x, y]) => (
          <path d={`M${x} ${y}v1.5`} key={`${x}${y}`} stroke="#ffe08a" strokeWidth={2} />
        ))}
      </>
    ),
    pineapple: (
      <>
        <path d="M27 18c-6-6-8-11-6-15 4 3 6 7 8 12M32 17c0-7 2-12 6-14 1 5 0 10-3 14M36 19c4-5 9-7 14-5-3 4-7 6-12 7" fill={leaf} />
        <path d="M10 48L32 18l22 30c-14 8-30 8-44 0z" fill="#f6cf4a" />
        <path d="M10 48c14 8 30 8 44 0" stroke="#a8742a" strokeWidth={3.5} />
        <path d="M32 24v26M22 36l20 0M17 43h30" stroke="#e0b23a" strokeOpacity={0.9} strokeWidth={1.25} />
      </>
    ),
    cherry: (
      <>
        <path d="M30 40C30 24 38 12 50 6" stroke="#5c7a2f" />
        <circle cx="27" cy="46" fill="#b3122f" r="11" />
        <path d="M22 42a5 5 0 016-4" stroke="#fff" strokeOpacity={0.7} strokeWidth={2} />
      </>
    ),
    passion: (
      <>
        <circle cx="32" cy="34" fill="#6b2a55" r="22" />
        <circle cx="32" cy="34" fill="#f3c22b" r="17" stroke="none" />
        {[
          [26, 28],
          [36, 27],
          [30, 37],
          [39, 36],
          [25, 40],
          [33, 44],
          [41, 43],
        ].map(([x, y]) => (
          <circle cx={x} cy={y} fill="#2a1a10" key={`${x}${y}`} r="1.8" stroke="none" />
        ))}
      </>
    ),
    salt: (
      <>
        <ellipse cx="32" cy="44" fill="#f4f4f4" rx="22" ry="8" />
        {[
          [20, 42],
          [27, 46],
          [34, 41],
          [41, 46],
          [46, 42],
          [31, 48],
          [24, 39],
          [38, 38],
        ].map(([x, y]) => (
          <rect fill="#fff" height="3" key={`${x}${y}`} strokeWidth={1} width="3" x={x} y={y} />
        ))}
        <path d="M26 20h12v14H26z" />
        <path d="M28 20v-4h8v4" />
      </>
    ),
    sugar: (
      <>
        <rect fill="#fbf7ef" height="18" rx="2" width="18" x="12" y="30" />
        <rect fill="#fbf7ef" height="18" rx="2" width="18" x="32" y="34" />
        <rect fill="#fbf7ef" height="18" rx="2" width="18" x="22" y="14" />
      </>
    ),
    cinnamon: (
      <>
        <path d="M10 46L46 14l6 6-36 32z" fill="#9a5a2c" />
        <path d="M46 14c3 2 5 4 6 6" stroke="#5e3416" strokeWidth={2.5} />
        <path d="M14 44l30-26" stroke="#c07a43" strokeOpacity={0.7} />
      </>
    ),
  };
  return (
    <Frame className={className} title={title}>
      {art[kind]}
    </Frame>
  );
}
