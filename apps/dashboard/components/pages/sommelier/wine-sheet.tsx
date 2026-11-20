"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Icon, type IconName } from "@/lib/icons";
import type { PublicWine } from "@/lib/sommelier/catalog";
import type { WineProfile } from "@/lib/sommelier/profile";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { sheetStrings } from "./sommelier-strings";

/**
 * Wine sheets under a sommelier answer, one below the other, laid out like
 * a winery's technical sheet: key facts with icons, style scales, tasting
 * notes, food pairing, serving and the vineyard. House facts show at once;
 * the rest comes from the AI sheet (written once per wine and language).
 */

const SWATCH: Record<string, string> = {
  red: "#8e2436",
  white: "#e2cf7d",
  rose: "#eaa0ae",
  orange: "#dd8e3c",
  sparkling: "#d9cc98",
  dessert: "#a8682b",
  "": "#9a8f86",
};

/** Sheets already fetched on this page (per wine and language). */
const cache = new Map<string, WineProfile | null>();

/** Loads the wine's sheet (the server writes it the first time). */
function useProfile(token: string, wineId: string, lang: string) {
  const key = `${lang}:${wineId}`;
  const [profile, setProfile] = useState<WineProfile | null | undefined>(
    cache.get(key)
  );
  useEffect(() => {
    if (cache.has(key)) {
      setProfile(cache.get(key));
      return;
    }
    setProfile(undefined);
    let live = true;
    fetch(`${BASE_PATH}/api/sommelier/profile/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, id: wineId, lang }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { profile?: WineProfile } | null) => {
        cache.set(key, d?.profile ?? null);
        if (live) {
          setProfile(d?.profile ?? null);
        }
      })
      .catch(() => live && setProfile(null));
    return () => {
      live = false;
    };
  }, [key, token, wineId, lang]);
  return { profile: profile ?? null, loading: profile === undefined };
}

export function WineSheets({
  wines,
  token,
  lang,
  onAsk,
}: {
  wines: PublicWine[];
  token: string;
  lang: string;
  onAsk?: (w: PublicWine) => void;
}) {
  if (!wines.length) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-col gap-3">
      {wines.map((w, i) => (
        <WineSheet
          key={w.id}
          lang={lang}
          onAsk={onAsk}
          open={i === 0}
          token={token}
          wine={w}
        />
      ))}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one sheet, optional sections
function WineSheet({
  wine: w,
  token,
  lang,
  open: startOpen,
  onAsk,
}: {
  wine: PublicWine;
  token: string;
  lang: string;
  open: boolean;
  onAsk?: (w: PublicWine) => void;
}) {
  const s = sheetStrings(lang);
  const { profile: p, loading } = useProfile(token, w.id, lang);
  const [open, setOpen] = useState(startOpen);
  const origin = [w.region, w.country].filter(Boolean).join(", ");
  const facts: { icon: IconName | "grapes"; label: string; value: string }[] = [
    { icon: "IconMapPin", label: s.origin, value: origin || p?.origin || "" },
    {
      icon: "IconGlass",
      label: s.type,
      value: p?.type || s.colors[w.color] || "",
    },
    { icon: "grapes", label: s.grapes, value: p?.grapes || w.grape },
    { icon: "IconCalendar1", label: s.vintage, value: w.vintage },
    {
      icon: "IconDrop",
      label: s.alcohol,
      value: w.abv ? `${w.abv}% vol.` : "",
    },
    { icon: "IconMap", label: s.appellation, value: p?.appellation ?? "" },
    { icon: "IconHome", label: s.winery, value: p?.winery || w.producer },
    {
      icon: "IconBottle",
      label: s.serve,
      value: [
        w.sizes.length ? `${w.sizes.join(" · ")} ml` : "",
        w.bottle ? s.bottle : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ].filter((f) => f.value) as {
    icon: IconName | "grapes";
    label: string;
    value: string;
  }[];
  const tasting = p?.tasting;
  const houseNotes = w.notes;
  const pairing = [w.pairing.join(", "), p?.pairing]
    .filter(Boolean)
    .join(" — ");

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card text-sm shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 border-border border-b p-4">
        <span
          className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${SWATCH[w.color] ?? SWATCH[""]}26` }}
        >
          <Icon
            className="size-6"
            name="IconBottle"
            style={{ color: SWATCH[w.color] ?? SWATCH[""] }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-tight">{w.name}</h3>
          <p className="text-muted-foreground text-xs">
            {[w.producer, w.vintage].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {w.onTap ? <Tag gold>{s.onTap}</Tag> : null}
            {p?.vegan === "yes" ? <Tag>{s.vegan}</Tag> : null}
            {p?.styles.map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      {p?.summary || w.story ? (
        <p className="border-border border-b px-4 py-3 text-center font-serif text-[15px] italic leading-relaxed">
          {w.story || p?.summary}
        </p>
      ) : null}

      {/* Facts with icons */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-4">
        {facts.map((f) => (
          <Fact icon={f.icon} key={f.label} label={f.label} value={f.value} />
        ))}
      </dl>

      {/* Style scales */}
      {p && (p.body || p.tannin || p.acidity || p.sweetness) ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-border border-t px-4 py-3">
          <Scale label={s.body} value={p.body} />
          <Scale label={s.tannin} value={p.tannin} />
          <Scale label={s.acidity} value={p.acidity} />
          <Scale label={s.sweetness} value={p.sweetness} />
        </div>
      ) : null}

      {/* Tasting notes */}
      {tasting?.nose || houseNotes ? (
        <Section icon="IconGlass" title={s.tasting}>
          {houseNotes ? <p>{houseNotes}</p> : null}
          {tasting?.colour ? (
            <Line label={s.colour} text={tasting.colour} />
          ) : null}
          {tasting?.nose ? <Line label={s.nose} text={tasting.nose} /> : null}
          {tasting?.palate ? (
            <Line label={s.palate} text={tasting.palate} />
          ) : null}
        </Section>
      ) : null}

      {/* Food pairing */}
      {pairing ? (
        <Section icon="IconForkKnife" title={s.pairing}>
          <p>{pairing}</p>
        </Section>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 border-border border-t px-4 py-3 text-muted-foreground text-xs">
          <span className="size-2 animate-pulse rounded-full bg-(--gold)" />
          {s.loading}
        </p>
      ) : null}

      {/* More: serving, vineyard, winemaking */}
      {p && open ? (
        <>
          <div className="grid grid-cols-1 gap-3 border-border border-t p-4 sm:grid-cols-3">
            <Fact icon="IconThermostat" label={s.serving} value={p.serving} />
            <Fact
              icon="IconHourglass"
              label={s.decanting}
              value={p.decanting}
            />
            <Fact icon="IconClock" label={s.ageing} value={p.ageing} />
          </div>
          {p.vineyards || p.soils || p.climate ? (
            <div className="grid grid-cols-1 gap-3 border-border border-t p-4 sm:grid-cols-3">
              <Fact icon="IconTree" label={s.vineyards} value={p.vineyards} />
              <Fact icon="IconLayersThree" label={s.soils} value={p.soils} />
              <Fact icon="IconSunHigh" label={s.climate} value={p.climate} />
            </div>
          ) : null}
          {p.winemaking ? (
            <Section icon="IconLab" title={s.winemaking}>
              <p>{p.winemaking}</p>
            </Section>
          ) : null}
        </>
      ) : null}

      <div className="flex items-center gap-2 border-border border-t px-4 py-2.5">
        {p ? (
          <button
            className="flex items-center gap-1 text-(--gold) text-xs"
            onClick={() => setOpen(!open)}
            type="button"
          >
            <Icon
              className="size-4"
              name={open ? "IconChevronTop" : "IconChevronBottom"}
            />
            {open ? s.less : s.more}
          </button>
        ) : null}
        {onAsk ? (
          <button
            className="ml-auto rounded-full bg-(--gold) px-3 py-1 font-medium text-(--on-gold) text-xs"
            onClick={() => onAsk(w)}
            type="button"
          >
            {s.ask}
          </button>
        ) : null}
      </div>
      {p ? (
        <p className="px-4 pb-2 text-[10px] text-muted-foreground">
          {s.aiNote}
        </p>
      ) : null}
    </article>
  );
}

function Tag({ children, gold }: { children: ReactNode; gold?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        gold ? "bg-(--gold)/15 text-(--gold)" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function FactIcon({ name }: { name: IconName | "grapes" }) {
  if (name === "grapes") {
    return <GrapesIcon className="size-5" />;
  }
  return <Icon className="size-5" name={name} />;
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: IconName | "grapes";
  label: string;
  value: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-(--gold)">
        <FactIcon name={icon} />
      </span>
      <div className="min-w-0">
        <dt className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </dt>
        <dd className="break-words text-[13px] leading-snug">{value}</dd>
      </div>
    </div>
  );
}

function Scale({ label, value }: { label: string; value: number }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="flex flex-1 gap-0.5" title={`${value}/5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            className={cn(
              "h-1.5 flex-1 rounded-full",
              n <= value ? "bg-(--gold)" : "bg-muted"
            )}
            key={n}
          />
        ))}
      </span>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3 border-border border-t px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-(--gold)/40 text-(--gold)">
        <Icon className="size-4" name={icon} />
      </span>
      <div className="min-w-0 flex-1 space-y-1 text-[13px] leading-relaxed">
        <h4 className="font-medium text-(--gold) text-[11px] uppercase tracking-wider">
          {title}
        </h4>
        {children}
      </div>
    </section>
  );
}

function Line({ label, text }: { label: string; text: string }) {
  return (
    <p>
      <b className="font-medium uppercase tracking-wide">{label}:</b> {text}
    </p>
  );
}

/** Bunch of grapes (no such icon in the set). */
function GrapesIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d="M12 6V2.5M12 4c1.5-1.5 3.5-1.5 5 0" />
      <circle cx="8.5" cy="8.5" r="2.2" />
      <circle cx="12" cy="8.5" r="2.2" />
      <circle cx="15.5" cy="8.5" r="2.2" />
      <circle cx="10.2" cy="12.3" r="2.2" />
      <circle cx="13.8" cy="12.3" r="2.2" />
      <circle cx="12" cy="16.1" r="2.2" />
      <circle cx="12" cy="19.6" r="1.6" />
    </svg>
  );
}
