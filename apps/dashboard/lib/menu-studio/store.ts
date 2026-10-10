"use client";

import { createLocalStore, uid } from "@/lib/local-store";
import { closestFont, TEMPLATES } from "./templates";
import type {
  ExtractedMenu,
  MenuData,
  MenuDoc,
  MenuItem,
  MenuSection,
  MenuStyle,
  Ornament,
  PriceStyle,
  TemplateId,
  WineSource,
} from "./types";

export const menuStore = createLocalStore<MenuData>("cb:menus:v1", {
  menus: [],
});

export const useMenus = menuStore.use;

export function templateStyle(id: TemplateId, keep?: Partial<MenuStyle>) {
  const t =
    TEMPLATES.find((x) => x.id === id) ??
    (TEMPLATES[0] as (typeof TEMPLATES)[number]);
  return {
    paper: "A4",
    landscape: false,
    logo: "",
    ...t.style,
    ...keep,
  } as MenuStyle;
}

export function blankItem(patch: Partial<MenuItem> = {}): MenuItem {
  return {
    id: uid("it"),
    name: "",
    description: "",
    price: null,
    secondaryPrice: null,
    secondaryLabel: "",
    tags: [],
    hidden: false,
    details: "",
    ...patch,
  };
}

export const defaultWineSource = (language = "pt"): WineSource => {
  const pt = language.startsWith("pt");
  return {
    groupBy: "style",
    styles: [],
    showGlass: true,
    glassLabel: pt ? "taça" : "glass",
    bottleLabel: pt ? "garrafa" : "bottle",
    showGrapes: true,
    showNotes: false,
  };
};

export function blankSection(patch: Partial<MenuSection> = {}): MenuSection {
  return {
    id: uid("sec"),
    title: "Nova seção",
    note: "",
    kind: "food",
    items: [],
    wineSource: null,
    breakBefore: false,
    ...patch,
  };
}

export function blankMenu(template: TemplateId = "classic"): MenuDoc {
  return {
    id: uid("menu"),
    name: "Novo cardápio",
    restaurantName: "",
    tagline: "",
    footer: "",
    currency: "EUR",
    language: "pt",
    style: templateStyle(template),
    sections: [
      blankSection({
        title: "Entradas",
        items: [blankItem({ name: "Novo prato", price: 0 })],
      }),
    ],
    updatedAt: Date.now(),
  };
}

export function wineListMenu(language = "en"): MenuDoc {
  const pt = language.startsWith("pt");
  return {
    ...blankMenu("elegant"),
    name: pt ? "Carta de vinhos" : "Wine list",
    language,
    sections: [
      blankSection({
        title: pt ? "Carta de vinhos" : "Wine List",
        kind: "wine",
        wineSource: defaultWineSource(language),
      }),
    ],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
const oneOf = <T extends string>(v: string, list: T[], fallback: T): T =>
  (list as string[]).includes(v) ? (v as T) : fallback;

/** Builds an editable menu from what the AI read on the photos. */
export function menuFromExtracted(x: ExtractedMenu, logo: string): MenuDoc {
  const template = oneOf<TemplateId>(
    x.style.layout,
    ["classic", "modern", "bistro", "minimal", "elegant"],
    "classic"
  );
  const base = templateStyle(template);
  const style: MenuStyle = {
    ...base,
    background: hex(x.style.background, base.background),
    text: hex(x.style.text, base.text),
    accent: hex(x.style.accent, base.accent),
    muted: hex(x.style.muted, base.muted),
    headingFont: closestFont(
      x.style.headingFont.closestGoogleFont,
      x.style.headingFont.category
    ),
    bodyFont: closestFont(
      x.style.bodyFont.closestGoogleFont,
      x.style.bodyFont.category
    ),
    columns: Math.min(3, Math.max(1, Math.round(x.style.columns || 1))) as
      | 1
      | 2
      | 3,
    ornament: oneOf<Ornament>(
      x.style.ornament,
      ["none", "line", "dots", "double"],
      base.ornament
    ),
    uppercaseHeadings: x.style.uppercaseHeadings,
    priceStyle: oneOf<PriceStyle>(
      x.style.priceStyle,
      ["right", "inline", "below"],
      base.priceStyle
    ),
    logo,
    decimals: x.sections.some((s) =>
      s.items.some((i) => i.price !== null && !Number.isInteger(i.price))
    )
      ? 2
      : 0,
  };
  return {
    id: uid("menu"),
    name: x.restaurantName
      ? `${x.restaurantName} (recriado)`
      : "Cardápio recriado",
    restaurantName: x.restaurantName,
    tagline: x.tagline,
    footer: "",
    currency: x.currency || "EUR",
    language: x.language?.slice(0, 2).toLowerCase() || "pt",
    style,
    sections: x.sections.map((s) =>
      blankSection({
        title: s.title,
        note: s.note,
        kind: oneOf<MenuSection["kind"]>(
          s.kind,
          ["food", "wine", "drinks", "other"],
          "food"
        ),
        items: s.items.map((i) =>
          blankItem({
            name: [i.name, i.vintage].filter(Boolean).join(" "),
            description: i.description,
            price: i.price,
            secondaryPrice: i.secondaryPrice,
            secondaryLabel: i.secondaryLabel,
            tags: i.tags,
            details: [
              i.grapes.join(", "),
              [i.region, i.country].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
          })
        ),
      })
    ),
    updatedAt: Date.now(),
  };
}

export function saveMenu(doc: MenuDoc) {
  menuStore.update((prev) => {
    const next = { ...doc, updatedAt: Date.now() };
    const exists = prev.menus.some((m) => m.id === doc.id);
    return {
      menus: exists
        ? prev.menus.map((m) => (m.id === doc.id ? next : m))
        : [next, ...prev.menus],
    };
  });
}

export function removeMenu(id: string) {
  menuStore.update((prev) => ({
    menus: prev.menus.filter((m) => m.id !== id),
  }));
}

export function duplicateMenu(doc: MenuDoc): MenuDoc {
  const copy: MenuDoc = {
    ...structuredClone(doc),
    id: uid("menu"),
    name: `${doc.name} (cópia)`,
  };
  saveMenu(copy);
  return copy;
}
