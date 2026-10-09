/**
 * Notion's HTML export → note markdown. Keeps what the markdown export
 * loses: page icon and cover, toggles, callouts with their emoji, colors
 * as highlights, equations and table headers. Links and images keep their
 * relative paths; the importer rewrites them afterwards.
 */

export interface HtmlPage {
  title: string;
  icon?: string;
  /** Relative path or URL of the cover image. */
  cover?: string;
  markdown: string;
}

const SPACES = /[ \t\n\r ]+/g;
const LANG = /language-([\w+#-]+)/;
const HEADING_TAG = /^H([1-6])$/;
const BLANK_RUNS = /\n{3,}/g;
const TRAILING_NL = /\n$/;

const clean = (s: string) => s.replace(SPACES, " ");

/* --------------------------------- inline -------------------------------- */

const WRAP: Record<string, [string, string]> = {
  STRONG: ["**", "**"],
  B: ["**", "**"],
  EM: ["*", "*"],
  I: ["*", "*"],
  S: ["~~", "~~"],
  DEL: ["~~", "~~"],
  CODE: ["`", "`"],
  MARK: ["==", "=="],
};

function wrapped(open: string, inner: string, close: string) {
  const t = inner.trim();
  if (!t) {
    return inner;
  }
  // Keep spaces outside the markers (**a** b, not **a **b)
  const lead = inner.startsWith(" ") ? " " : "";
  const tail = inner.endsWith(" ") ? " " : "";
  return `${lead}${open}${t}${close}${tail}`;
}

function inlineElement(el: Element): string {
  const tag = el.tagName;
  if (tag === "BR") {
    return " ";
  }
  if (tag === "IMG") {
    return el.getAttribute("alt") ?? "";
  }
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const label = inline(el).trim() || href;
    return href ? `[${label}](${href.replace(SPACES, "%20")})` : label;
  }
  if (el.classList.contains("notion-text-equation-token")) {
    return `\`${el.querySelector("annotation")?.textContent ?? el.textContent ?? ""}\``;
  }
  const wrap = WRAP[tag];
  if (wrap) {
    return wrapped(wrap[0], inline(el), wrap[1]);
  }
  // Notion colors text with highlight-* classes: show it as a highlight
  if (tag === "SPAN" && el.className.includes("highlight-")) {
    return wrapped("==", inline(el), "==");
  }
  return inline(el);
}

function inline(node: Node): string {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += clean(child.textContent ?? "");
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      out += inlineElement(child as Element);
    }
  }
  return out;
}

/* --------------------------------- blocks -------------------------------- */

type Handler = (el: Element, indent: string) => string[];

const prefixLines = (lines: string[], prefix: string) =>
  lines.map((l) => (l ? `${prefix}${l}` : prefix.trimEnd()));

/** The element's own inline content, without nested block children. */
function ownInline(el: Element) {
  const copy = el.cloneNode(true) as Element;
  for (const nested of copy.querySelectorAll(
    ":scope > ul, :scope > ol, :scope > details, :scope > div, :scope > figure"
  )) {
    nested.remove();
  }
  return inline(copy).trim();
}

const nestedBlocks = (el: Element, indent: string) =>
  [
    ...el.querySelectorAll(
      ":scope > ul, :scope > ol, :scope > details, :scope > div, :scope > figure"
    ),
  ].flatMap((c) => block(c, `${indent}    `));

function listItems(el: Element, indent: string) {
  const ordered = el.tagName === "OL";
  const todo = el.classList.contains("to-do-list");
  const lines: string[] = [];
  let n = Number(el.getAttribute("start") ?? "1") || 1;
  for (const li of el.querySelectorAll(":scope > li")) {
    if (li.querySelector(":scope > details")) {
      lines.push(
        ...block(li.querySelector(":scope > details") as Element, indent)
      );
      continue;
    }
    let marker = "- ";
    if (ordered) {
      marker = `${n}. `;
      n++;
    } else if (todo) {
      marker = li.querySelector(".checkbox-on") ? "- [x] " : "- [ ] ";
    }
    lines.push(
      `${indent}${marker}${ownInline(li)}`,
      ...nestedBlocks(li, indent)
    );
  }
  return lines;
}

function details(el: Element, indent: string) {
  const summary = el.querySelector(":scope > summary");
  const body = [...el.children].filter((c) => c !== summary);
  return [
    `${indent}<details>`,
    `${indent}<summary>${summary ? inline(summary).trim() : "Detalhes"}</summary>`,
    "",
    ...body.flatMap((c) => [...block(c, indent), ""]),
    `${indent}</details>`,
  ];
}

function table(el: Element) {
  const rows = [...el.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th, td")].map((c) =>
      inline(c).trim().replaceAll("|", "/")
    )
  );
  const [head, ...rest] = rows;
  if (!head) {
    return [];
  }
  const line = (r: string[]) =>
    `| ${head.map((_, i) => r[i] || " ").join(" | ")} |`;
  return [
    line(head),
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rest.map(line),
  ];
}

function callout(el: Element) {
  const icon = el.querySelector(".icon");
  const emoji = icon?.textContent?.trim() || "💡";
  const body = [...el.children]
    .filter((c) => !(icon && c.contains(icon)))
    .flatMap((c) => block(c, ""));
  const lines = body.filter((l, i) => l !== "" || i > 0);
  const [first = "", ...rest] = lines;
  return prefixLines([`${emoji} ${first}`, ...rest], "> ");
}

function figure(el: Element, indent: string): string[] {
  if (el.classList.contains("callout")) {
    return prefixLines(callout(el), indent);
  }
  if (el.classList.contains("equation")) {
    const tex =
      el.querySelector("annotation")?.textContent ?? el.textContent ?? "";
    return ["$$", tex.trim(), "$$"];
  }
  const img = el.querySelector("img");
  const caption = el.querySelector("figcaption")?.textContent?.trim() ?? "";
  if (img) {
    const src =
      img.closest("a")?.getAttribute("href") ?? img.getAttribute("src") ?? "";
    return [`${indent}![${caption}](${src.replace(SPACES, "%20")})`];
  }
  const a = el.querySelector("a[href]");
  if (a) {
    const title =
      a.querySelector(".bookmark-title")?.textContent?.trim() ||
      clean(a.textContent ?? "").trim() ||
      a.getAttribute("href");
    return [
      `${indent}[${title}](${(a.getAttribute("href") ?? "").replace(SPACES, "%20")})`,
    ];
  }
  return children(el, indent);
}

const children = (el: Element, indent: string) =>
  [...el.children].flatMap((c) => [...block(c, indent), ""]);

const BY_TAG: Record<string, Handler> = {
  P: (el, indent) => [`${indent}${inline(el).trim()}`],
  UL: listItems,
  OL: listItems,
  DETAILS: details,
  BLOCKQUOTE: (el) => prefixLines([inline(el).trim()], "> "),
  HR: () => ["---"],
  PRE: (el) => {
    const code = el.querySelector("code") ?? el;
    const lang = LANG.exec(code.className)?.[1] ?? "";
    return [
      `\`\`\`${lang}`,
      (code.textContent ?? "").replace(TRAILING_NL, ""),
      "```",
    ];
  },
  TABLE: table,
  FIGURE: figure,
  IMG: (el) => [
    `![](${(el.getAttribute("src") ?? "").replace(SPACES, "%20")})`,
  ],
  NAV: () => [],
  STYLE: () => [],
  SCRIPT: () => [],
};

function block(el: Element, indent: string): string[] {
  const heading = HEADING_TAG.exec(el.tagName);
  if (heading) {
    return [`${"#".repeat(Number(heading[1]))} ${inline(el).trim()}`];
  }
  const handler = BY_TAG[el.tagName];
  if (handler) {
    return handler(el, indent);
  }
  if (el.children.length > 0) {
    return children(el, indent);
  }
  const t = inline(el).trim();
  return t ? [`${indent}${t}`] : [];
}

/* ---------------------------------- page --------------------------------- */

function properties(doc: Document) {
  return [...doc.querySelectorAll("table.properties tr")]
    .map((tr) => {
      const k = tr.querySelector("th")?.textContent?.trim();
      const v = inline(tr.querySelector("td") ?? tr).trim();
      return k && v ? `**${k}:** ${v}` : "";
    })
    .filter(Boolean);
}

export function htmlToMarkdown(html: string): HtmlPage {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title =
    doc.querySelector(".page-title")?.textContent?.trim() ||
    doc.title.trim() ||
    "Sem título";
  const iconEl = doc.querySelector(".page-header-icon");
  const iconImg = iconEl?.querySelector("img")?.getAttribute("src");
  const icon = iconImg ?? (iconEl?.textContent?.trim() || undefined);
  const cover =
    doc.querySelector("img.page-cover-image")?.getAttribute("src") ?? undefined;
  const body =
    doc.querySelector(".page-body") ?? doc.querySelector("article") ?? doc.body;
  const props = properties(doc);
  const lines = [
    ...props,
    props.length ? "" : null,
    ...[...body.children].flatMap((c) => [...block(c, ""), ""]),
  ].filter((l): l is string => l !== null);
  const markdown = lines.join("\n").replace(BLANK_RUNS, "\n\n").trim();
  return { title, icon, cover, markdown };
}
