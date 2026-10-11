import { fontStack, googleFontsUrls, resolveFont } from "./fonts";
import type {
  AiEdit,
  AiElement,
  Design,
  DesignElement,
  DesignPage,
  ExtractedDesign,
  IconElement,
  ImageElement,
  ShapeElement,
  TextAlign,
  TextElement,
} from "./types";

/** Pure helpers of the design editor (shared by UI, AI and tests). */

export const PAGE_SIZES = [
  { id: "a4", label: "A4 retrato", w: 794, h: 1123 },
  { id: "a4l", label: "A4 paisagem", w: 1123, h: 794 },
  { id: "a5", label: "A5", w: 559, h: 794 },
  { id: "a3", label: "A3", w: 1123, h: 1587 },
  { id: "letter", label: "Carta", w: 816, h: 1056 },
  { id: "dl", label: "Volante DL", w: 374, h: 794 },
  { id: "square", label: "Post quadrado", w: 1080, h: 1080 },
  { id: "story", label: "Story / tela", w: 1080, h: 1920 },
  { id: "tv", label: "TV 16:9", w: 1920, h: 1080 },
] as const;

/** Icons offered in the picker (Central Icons names). */
export const MENU_ICONS = [
  "IconForkKnife",
  "IconForkSpoon",
  "IconFoodBell",
  "IconPizza",
  "IconBurger",
  "IconCheeseburger",
  "IconSteak",
  "IconSushi",
  "IconSlice",
  "IconPancakes",
  "IconBirthdayCake",
  "IconCookies",
  "IconDonut",
  "IconCandy",
  "IconIcebowl",
  "IconPopcorn",
  "IconCherry",
  "IconApples",
  "IconJavaCoffeeBean",
  "IconCup",
  "IconCupHot",
  "IconHotDrinkCup",
  "IconTea",
  "IconGlass",
  "IconGlassWater",
  "IconBottle",
  "IconBeer",
  "IconCocktail",
  "IconDrink",
  "IconFire2",
  "IconFire3",
  "IconStar",
  "IconHeart",
  "IconCrown",
  "IconGoldMedal",
  "IconSparkle",
  "IconSparklesSoft",
  "IconFlowerShape",
  "IconSun",
  "IconMoonStar",
  "IconSnowFlakes",
  "IconDrop",
  "IconGiftBox",
  "IconTag",
  "IconPercent",
  "IconClock",
  "IconMapPin",
  "IconPhone",
  "IconWhatsapp",
  "IconInstagram",
  "IconFacebook",
  "IconWifiFull",
  "IconDeliveryBike",
  "IconQrCode",
] as const;

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
export const hex = (v: string, fallback: string) =>
  HEX.test(v.trim()) ? v.trim() : fallback;

let seq = 0;
export const newId = (prefix = "el") =>
  `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const base = (type: DesignElement["type"], name: string) => ({
  id: newId(),
  type,
  name,
  x: 80,
  y: 80,
  w: 300,
  h: 60,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export function textElement(patch: Partial<TextElement> = {}): TextElement {
  return {
    ...base("text", "Texto"),
    type: "text",
    text: "Seu texto",
    fontFamily: "Montserrat",
    fontSize: 24,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: "#1f1a17",
    align: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    uppercase: false,
    background: "",
    ...patch,
  };
}

/** Text presets of the "Texto" menu. */
export const TEXT_PRESETS: { label: string; patch: Partial<TextElement> }[] = [
  {
    label: "Título",
    patch: {
      name: "Título",
      text: "Nome do restaurante",
      fontFamily: "Playfair Display",
      fontSize: 56,
      fontWeight: 700,
      align: "center",
      w: 600,
      h: 80,
    },
  },
  {
    label: "Subtítulo",
    patch: {
      name: "Subtítulo",
      text: "ENTRADAS",
      fontFamily: "Montserrat",
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 4,
      uppercase: true,
      align: "center",
      w: 400,
      h: 40,
    },
  },
  {
    label: "Prato e preço",
    patch: {
      name: "Prato",
      text: "Bacalhau à Brás ........ 18,50",
      fontFamily: "Lora",
      fontSize: 20,
      w: 520,
      h: 32,
    },
  },
  {
    label: "Descrição",
    patch: {
      name: "Descrição",
      text: "Batata palha, ovo, cebola e azeitonas",
      fontFamily: "Lora",
      fontSize: 15,
      italic: true,
      color: "#6b5f57",
      w: 520,
      h: 26,
    },
  },
  {
    label: "Manuscrito",
    patch: {
      name: "Manuscrito",
      text: "Sugestão do chef",
      fontFamily: "Great Vibes",
      fontSize: 44,
      align: "center",
      w: 420,
      h: 64,
    },
  },
];

export function shapeElement(patch: Partial<ShapeElement> = {}): ShapeElement {
  return {
    ...base("shape", "Forma"),
    type: "shape",
    shape: "rect",
    w: 200,
    h: 120,
    fill: "#d4a27f",
    stroke: "",
    strokeWidth: 0,
    radius: 0,
    dashed: false,
    ...patch,
  };
}

export function imageElement(patch: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base("image", "Imagem"),
    type: "image",
    src: "",
    w: 300,
    h: 200,
    fit: "cover",
    radius: 0,
    flipX: false,
    borderColor: "",
    borderWidth: 0,
    ...patch,
  };
}

export function iconElement(patch: Partial<IconElement> = {}): IconElement {
  return {
    ...base("icon", "Ícone"),
    type: "icon",
    icon: "IconForkKnife",
    w: 64,
    h: 64,
    color: "#1f1a17",
    strokeWidth: 1.5,
    ...patch,
  };
}

export function blankPage(background = "#fbf7f0"): DesignPage {
  return { id: newId("pg"), background, backgroundImage: "", elements: [] };
}

export function blankDesign(sizeId = "a4"): Design {
  const size = PAGE_SIZES.find((s) => s.id === sizeId) ?? PAGE_SIZES[0];
  const page = blankPage();
  page.elements = [
    textElement({
      ...TEXT_PRESETS[0]?.patch,
      x: (size.w - 600) / 2,
      y: 90,
    }),
    shapeElement({
      name: "Linha",
      shape: "line",
      x: size.w / 2 - 80,
      y: 190,
      w: 160,
      h: 2,
      fill: "",
      stroke: "#b07a52",
      strokeWidth: 2,
    }),
  ];
  return {
    id: newId("ds"),
    name: "Novo design",
    width: size.w,
    height: size.h,
    pages: [page],
    updatedAt: Date.now(),
  };
}

/** Deep copy with fresh ids (duplicate element, page or design). */
export function cloneElement<T extends DesignElement>(el: T, offset = 16): T {
  return { ...el, id: newId(), x: el.x + offset, y: el.y + offset };
}

export function clonePage(page: DesignPage): DesignPage {
  return {
    ...page,
    id: newId("pg"),
    elements: page.elements.map((e) => cloneElement(e, 0)),
  };
}

/* ------------------------------ AI mapping ------------------------------ */

const ALIGNS: TextAlign[] = ["left", "center", "right"];
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function textFromAi(
  a: AiElement,
  common: Partial<TextElement>,
  fontSize: number
): TextElement | null {
  if (!a.text.trim()) {
    return null;
  }
  return textElement({
    ...common,
    name: a.text.trim().slice(0, 24),
    text: a.text,
    fontFamily: resolveFont(a.fontFamily, a.fontCategory),
    fontSize: clamp(fontSize, 6, 400),
    fontWeight: clamp(Math.round(a.fontWeight / 100) * 100, 100, 900),
    italic: a.italic,
    color: hex(a.color, "#1f1a17"),
    align: ALIGNS.includes(a.align as TextAlign)
      ? (a.align as TextAlign)
      : "left",
    lineHeight: a.lineHeight > 0.6 ? clamp(a.lineHeight, 0.7, 3) : 1.2,
    letterSpacing: clamp(a.letterSpacing, -5, 40),
    uppercase: a.uppercase,
  });
}

const optionalHex = (v: string) => (v ? hex(v, "") : "");

/** AI element → design element, with its box already in pixels. */
function fromAi(
  a: AiElement,
  box: Box,
  fontSize: number
): DesignElement | null {
  const common = {
    x: box.x,
    y: box.y,
    w: Math.max(4, box.w),
    h: Math.max(2, box.h),
    rotation: clamp(a.rotation, -180, 180),
    opacity: a.opacity > 0 ? clamp(a.opacity, 0.05, 1) : 1,
  };
  switch (a.type) {
    case "text":
      return textFromAi(a, common, fontSize);
    case "line":
      return shapeElement({
        ...common,
        name: "Linha",
        shape: "line",
        fill: "",
        stroke: hex(a.stroke || a.color, "#1f1a17"),
        strokeWidth: clamp(a.strokeWidth || 1, 0.5, 40),
      });
    case "shape":
      return shapeElement({
        ...common,
        name: a.shape === "ellipse" ? "Círculo" : "Forma",
        shape: a.shape === "ellipse" ? "ellipse" : "rect",
        fill: optionalHex(a.fill),
        stroke: optionalHex(a.stroke),
        strokeWidth: clamp(a.strokeWidth, 0, 40),
        radius: clamp(a.radius, 0, 1000),
      });
    case "icon":
      return iconElement({
        ...common,
        icon: (MENU_ICONS as readonly string[]).includes(a.icon)
          ? a.icon
          : "IconStar",
        color: hex(a.color, "#1f1a17"),
      });
    default:
      return null;
  }
}

export interface ImageRegion {
  pageIndex: number;
  /** Fractions of the photo. */
  box: Box;
  /** Pixels on the new page. */
  target: Box;
}

/**
 * Turns what the AI read on the photos into a design. Images (logo,
 * photos, ornaments) come back as regions to crop from the photo.
 */
export function designFromExtracted(x: ExtractedDesign): {
  design: Design;
  images: { pageId: string; regions: ImageRegion[] }[];
} {
  const aspect = clamp(x.aspect || Math.SQRT1_2, 0.3, 3);
  const width = aspect >= 1 ? 1123 : 794;
  const height = Math.round(width / aspect);
  const images: { pageId: string; regions: ImageRegion[] }[] = [];
  const pages = (
    x.pages.length
      ? x.pages
      : [{ pageIndex: 0, background: "#ffffff", elements: [] }]
  ).map((p) => {
    const page = blankPage(hex(p.background, "#ffffff"));
    const regions: ImageRegion[] = [];
    for (const a of p.elements) {
      const box = {
        x: clamp(a.x, 0, 1) * width,
        y: clamp(a.y, 0, 1) * height,
        w: clamp(a.w, 0, 1) * width,
        h: clamp(a.h, 0, 1) * height,
      };
      if (a.type === "image") {
        regions.push({
          pageIndex: p.pageIndex,
          box: { x: a.x, y: a.y, w: a.w, h: a.h },
          target: box,
        });
        continue;
      }
      const el = fromAi(a, box, a.fontSize * height);
      if (el) {
        page.elements.push(el);
      }
    }
    images.push({ pageId: page.id, regions });
    return page;
  });
  return {
    design: {
      id: newId("ds"),
      name: x.name.trim() || "Cardápio recriado",
      width,
      height,
      pages,
      updatedAt: Date.now(),
    },
    images,
  };
}

const EMPTY_AI: Omit<AiElement, "id" | "type" | "x" | "y" | "w" | "h"> = {
  rotation: 0,
  text: "",
  fontFamily: "",
  fontCategory: "",
  fontSize: 0,
  fontWeight: 0,
  italic: false,
  color: "",
  align: "",
  letterSpacing: 0,
  lineHeight: 0,
  uppercase: false,
  fill: "",
  stroke: "",
  strokeWidth: 0,
  radius: 0,
  shape: "",
  icon: "",
  opacity: 1,
};

function typeFields(e: DesignElement): Partial<AiElement> {
  switch (e.type) {
    case "text":
      return {
        text: e.text,
        fontFamily: e.fontFamily,
        fontSize: e.fontSize,
        fontWeight: e.fontWeight,
        italic: e.italic,
        color: e.color,
        align: e.align,
        letterSpacing: e.letterSpacing,
        lineHeight: e.lineHeight,
        uppercase: e.uppercase,
      };
    case "shape":
      return {
        type: e.shape === "line" ? "line" : "shape",
        fill: e.fill,
        stroke: e.stroke,
        strokeWidth: e.strokeWidth,
        radius: e.radius,
        shape: e.shape,
      };
    case "icon":
      return { color: e.color, icon: e.icon };
    case "image":
      return { radius: e.radius };
    default:
      return {};
  }
}

/** Page elements as the AI sees them (no image data, pixels). */
export function toAiElements(page: DesignPage): AiElement[] {
  return page.elements.map((e) => ({
    ...EMPTY_AI,
    id: e.id,
    type: e.type,
    x: Math.round(e.x),
    y: Math.round(e.y),
    w: Math.round(e.w),
    h: Math.round(e.h),
    rotation: e.rotation,
    opacity: e.opacity,
    ...typeFields(e),
  }));
}

/**
 * Applies the AI's edited element list to a page: known ids keep their
 * other properties (images keep their picture), new ids become new
 * elements, missing ids are removed. Order = layer order.
 */
export function applyAiEdit(page: DesignPage, edit: AiEdit): DesignPage {
  const byId = new Map(page.elements.map((e) => [e.id, e]));
  const elements: DesignElement[] = [];
  for (const a of edit.elements) {
    const box = { x: a.x, y: a.y, w: a.w, h: a.h };
    const old = byId.get(a.id);
    if (old?.type === "image") {
      elements.push({
        ...old,
        ...box,
        rotation: a.rotation,
        opacity: a.opacity > 0 ? clamp(a.opacity, 0.05, 1) : old.opacity,
        radius: clamp(a.radius, 0, 1000),
      });
      continue;
    }
    const fresh = fromAi(a, box, a.fontSize);
    if (!fresh) {
      continue;
    }
    if (old && old.type === fresh.type) {
      elements.push({
        ...old,
        ...fresh,
        id: old.id,
        name: old.name,
        locked: old.locked,
        hidden: old.hidden,
      } as DesignElement);
    } else {
      elements.push(fresh);
    }
  }
  return {
    ...page,
    background: edit.background
      ? hex(edit.background, page.background)
      : page.background,
    elements,
  };
}

/* ------------------------------- rendering ------------------------------ */

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;

const esc = (s: string) =>
  s
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;");

const safeUrl = (u: string) =>
  u.startsWith("data:image/") || u.startsWith("https://") ? u : "";

/** CSS of an element's box (shared by the editor and the export). */
export function boxStyle(e: DesignElement): Record<string, string | number> {
  return {
    position: "absolute",
    left: e.x,
    top: e.y,
    width: e.w,
    // Text boxes grow with their content, like Canva's
    height: e.type === "text" ? "auto" : e.h,
    transform: e.rotation ? `rotate(${e.rotation}deg)` : "none",
    opacity: e.opacity,
  };
}

export function textStyle(e: TextElement): Record<string, string | number> {
  return {
    fontFamily: fontStack(e.fontFamily),
    fontSize: e.fontSize,
    fontWeight: e.fontWeight,
    fontStyle: e.italic ? "italic" : "normal",
    textDecoration: e.underline ? "underline" : "none",
    color: e.color,
    textAlign: e.align,
    lineHeight: e.lineHeight,
    letterSpacing: e.letterSpacing,
    textTransform: e.uppercase ? "uppercase" : "none",
    background: e.background || "transparent",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
}

const CAMEL = /[A-Z]/g;
const PX_PROPS = new Set([
  "left",
  "top",
  "width",
  "height",
  "fontSize",
  "letterSpacing",
  "borderRadius",
  "borderWidth",
]);

const css = (style: Record<string, string | number>) =>
  Object.entries(style)
    .map(([k, v]) => {
      const prop = k.replace(CAMEL, (m) => `-${m.toLowerCase()}`);
      const value = typeof v === "number" && PX_PROPS.has(k) ? `${v}px` : v;
      return `${prop}:${value}`;
    })
    .join(";");

/** SVG markup of a shape filling its box. */
export function shapeSvg(e: ShapeElement) {
  const sw = e.strokeWidth;
  const stroke = e.stroke || "none";
  const dash = e.dashed ? ` stroke-dasharray="${sw * 3} ${sw * 2}"` : "";
  if (e.shape === "line") {
    return `<svg width="100%" height="100%" viewBox="0 0 ${e.w} ${Math.max(e.h, 1)}" preserveAspectRatio="none" overflow="visible"><line x1="0" y1="${e.h / 2}" x2="${e.w}" y2="${e.h / 2}" stroke="${esc(e.stroke || e.fill || "#000")}" stroke-width="${Math.max(sw, 1)}"${dash}/></svg>`;
  }
  const fill = e.fill || "none";
  const inner =
    e.shape === "ellipse"
      ? `<ellipse cx="${e.w / 2}" cy="${e.h / 2}" rx="${Math.max(0, e.w / 2 - sw / 2)}" ry="${Math.max(0, e.h / 2 - sw / 2)}"`
      : `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, e.w - sw)}" height="${Math.max(0, e.h - sw)}" rx="${e.radius}"`;
  return `<svg width="100%" height="100%" viewBox="0 0 ${e.w} ${e.h}" preserveAspectRatio="none" overflow="visible">${inner} fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}"${dash}/></svg>`;
}

/** SVG markup of an icon (paths from lib/icons use currentColor). */
export function iconSvg(e: IconElement, paths: string) {
  return `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" style="color:${esc(e.color)}" stroke-width="${e.strokeWidth}">${paths}</svg>`;
}

function elementHtml(e: DesignElement, icons: Record<string, string>) {
  if (e.hidden) {
    return "";
  }
  const box = css(boxStyle(e));
  switch (e.type) {
    case "text":
      return `<div style="${box};${css(textStyle(e))}">${esc(e.text)}</div>`;
    case "image": {
      const src = safeUrl(e.src);
      const border = e.borderWidth
        ? `;border:${e.borderWidth}px solid ${esc(e.borderColor || "#000")}`
        : "";
      return src
        ? `<img alt="" src="${esc(src)}" style="${box};object-fit:${e.fit};border-radius:${e.radius}px${border}${e.flipX ? ";scale:-1 1" : ""}">`
        : "";
    }
    case "shape":
      return `<div style="${box}">${shapeSvg(e)}</div>`;
    case "icon":
      return `<div style="${box}">${iconSvg(e, icons[e.icon] ?? "")}</div>`;
    default:
      return "";
  }
}

export function designFonts(d: Design) {
  const out = new Set<string>();
  for (const p of d.pages) {
    for (const e of p.elements) {
      if (e.type === "text") {
        out.add(e.fontFamily);
      }
    }
  }
  return out;
}

/** Standalone HTML of the design, one page per printed sheet. */
export function renderDesignHtml(
  d: Design,
  icons: Record<string, string>,
  opts: { autoPrint?: boolean } = {}
) {
  const links = googleFontsUrls(designFonts(d))
    .map((u) => `<link rel="stylesheet" href="${esc(u)}">`)
    .join("\n");
  const pages = d.pages
    .map((p) => {
      const bgImage = safeUrl(p.backgroundImage);
      const bg = `background:${esc(p.background)}${bgImage ? ` url('${esc(bgImage)}') center/cover no-repeat` : ""}`;
      return `<section class="page" style="${bg}">${p.elements.map((e) => elementHtml(e, icons)).join("")}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
${links}
<style>
@page { size: ${d.width}px ${d.height}px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #e9e5df; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: ${d.width}px; height: ${d.height}px; overflow: hidden; margin: 24px auto; box-shadow: 0 6px 30px rgba(0,0,0,.15); break-after: page; }
@media print { html, body { background: none; } .page { margin: 0; box-shadow: none; } }
</style></head>
<body>
${pages}
${opts.autoPrint ? "<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script>" : ""}
</body></html>`;
}
