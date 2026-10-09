"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartEmbed, MediaEmbed } from "./note-embeds";

/**
 * Markdown for notes (no innerHTML): headings, paragraphs, nested lists,
 * tasks, quotes, callouts (a quote starting with an emoji), toggles
 * (<details>), code, $$ equations, tables, rules, [[links]], page links
 * (note:<id>), #tags, links, media embeds (images, video, YouTube, audio,
 * PDFs, files) and ```chart blocks.
 */

export interface MarkdownActions {
  /** Whether a [[title]] resolves to a note. */
  exists: (title: string) => boolean;
  onLink: (title: string) => void;
  onTag: (tag: string) => void;
  /** Toggles the task on that source line. */
  onToggleTask: (line: number) => void;
  /** Page links by id ([label](note:<id>), from imports). */
  hasId?: (id: string) => boolean;
  onOpenId?: (id: string) => void;
}

const INLINE =
  /(!\[[^\]]*\]\([^)\s]+\)|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|~~[^~]+~~|==[^=]+==|\*[^*\s][^*]*\*|`[^`]+`|(?:^|(?<=\s))#[\p{L}\d][\p{L}\d_/-]*)/u;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const WIKI = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+/;
const BULLET = /^\s*[-*+]\s+/;
const TASK = /^\s*[-*+]\s+\[( |x|X)\]\s+/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_SEP = /^\|?\s*:?-{2,}/;
const ROW_EDGES = /^\||\|$/g;
const QUOTE = /^>\s?/;
const EMBED_LINE = /^!\[[^\]]*\]\([^)\s]+\)$/;
const FENCE = "```";
const CRLF = /\r\n/g;
const SAFE_URL = /^(https?:|mailto:|tel:|att:|\/|#)/i;
const NOTE_LINK = /^note:/;
const LEADING = /^\s*/;
const EMOJI_START =
  /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
const DETAILS_OPEN = /^<details(\s[^>]*)?>$/i;
const DETAILS_CLOSE = /^<\/details>$/i;
const SUMMARY = /^<summary>(.*?)<\/summary>$/i;
const MATH = "$$";

function Inline({ text, actions }: { text: string; actions: MarkdownActions }) {
  const parts = text.split(INLINE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => (
        <InlinePart
          actions={actions}
          key={`${i}-${part.slice(0, 8)}`}
          part={part}
        />
      ))}
    </>
  );
}

/** [label](note:<id>): a link to a page by id (imported pages). */
function PageLink({
  id,
  label,
  actions,
}: {
  id: string;
  label: string;
  actions: MarkdownActions;
}) {
  const resolved = actions.hasId?.(id) ?? false;
  return (
    <button
      className={cn(
        "cursor-pointer font-medium underline-offset-4 hover:underline",
        resolved ? "text-[#d97757]" : "text-[#d97757]/55 italic"
      )}
      onClick={() => actions.onOpenId?.(id)}
      type="button"
    >
      {label}
    </button>
  );
}

function InlinePart({
  part,
  actions,
}: {
  part: string;
  actions: MarkdownActions;
}) {
  const image = IMAGE.exec(part);
  if (image) {
    return <MediaEmbed alt={image[1] ?? ""} src={image[2] ?? ""} />;
  }
  const wiki = WIKI.exec(part);
  if (wiki) {
    const title = (wiki[1] ?? "").trim();
    const resolved = actions.exists(title);
    return (
      <button
        className={cn(
          "cursor-pointer font-medium underline-offset-4 hover:underline",
          resolved ? "text-[#d97757]" : "text-[#d97757]/55 italic"
        )}
        onClick={() => actions.onLink(title)}
        title={resolved ? title : `Criar “${title}”`}
        type="button"
      >
        {wiki[2] ?? title}
      </button>
    );
  }
  const link = LINK.exec(part);
  if (link && NOTE_LINK.test(link[2] ?? "")) {
    return (
      <PageLink
        actions={actions}
        id={(link[2] ?? "").slice(5)}
        label={link[1] ?? ""}
      />
    );
  }
  if (link) {
    const href = link[2] ?? "";
    return (
      <a
        className="text-[#d97757] underline underline-offset-4"
        href={SAFE_URL.test(href) ? href : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        {link[1]}
      </a>
    );
  }
  return <Styled actions={actions} part={part} />;
}

function Styled({ part, actions }: { part: string; actions: MarkdownActions }) {
  const wrap = (open: string, close = open) =>
    part.startsWith(open) &&
    part.endsWith(close) &&
    part.length > open.length + close.length;
  if (wrap("**")) {
    return <strong className="font-semibold">{part.slice(2, -2)}</strong>;
  }
  if (wrap("~~")) {
    return <s className="opacity-70">{part.slice(2, -2)}</s>;
  }
  if (wrap("==")) {
    return (
      <mark className="rounded bg-[#d97757]/25 px-0.5 text-inherit">
        {part.slice(2, -2)}
      </mark>
    );
  }
  if (wrap("`")) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
        {part.slice(1, -1)}
      </code>
    );
  }
  if (wrap("*")) {
    return <em>{part.slice(1, -1)}</em>;
  }
  if (part.startsWith("#") && part.length > 1) {
    return (
      <button
        className="rounded-full bg-muted px-2 py-0.5 text-[0.8em] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => actions.onTag(part.slice(1).toLowerCase())}
        type="button"
      >
        {part}
      </button>
    );
  }
  return <>{part}</>;
}

/* --------------------------------- blocks -------------------------------- */

interface Block {
  node: ReactNode;
  next: number;
}

interface Ctx {
  lines: string[];
  actions: MarkdownActions;
  /** Line of lines[0] in the whole note (toggles render a slice). */
  offset: number;
}
type Parser = (ctx: Ctx, i: number) => Block | null;

const line = (ctx: Ctx, i: number) => ctx.lines[i] ?? "";
const trimmed = (ctx: Ctx, i: number) => line(ctx, i).trim();

const parseFence: Parser = (ctx, i) => {
  const first = trimmed(ctx, i);
  if (!first.startsWith(FENCE)) {
    return null;
  }
  const lang = first.slice(FENCE.length).trim();
  const body: string[] = [];
  let j = i + 1;
  while (j < ctx.lines.length && !trimmed(ctx, j).startsWith(FENCE)) {
    body.push(line(ctx, j));
    j++;
  }
  const next = j + 1;
  if (lang.startsWith("chart")) {
    const source = [lang.slice(5).trim(), ...body].join("\n").trim();
    return { node: <ChartEmbed source={source} />, next };
  }
  return {
    node: (
      <pre className="my-3 overflow-x-auto rounded-2xl border bg-muted/60 p-4 font-mono text-[13px] leading-relaxed">
        {lang ? (
          <span className="mb-2 block text-muted-foreground text-xs">
            {lang}
          </span>
        ) : null}
        {body.join("\n")}
      </pre>
    ),
    next,
  };
};

const HEADING_CLASS = [
  "mt-2 mb-4 font-semibold text-3xl tracking-tight",
  "mt-8 mb-3 font-semibold text-2xl tracking-tight",
  "mt-6 mb-2 font-semibold text-xl",
  "mt-5 mb-2 font-semibold text-lg",
  "mt-4 mb-1 font-semibold",
  "mt-4 mb-1 font-semibold text-muted-foreground",
];

const parseHeading: Parser = (ctx, i) => {
  const m = HEADING.exec(trimmed(ctx, i));
  if (!m) {
    return null;
  }
  const level = m[1]?.length ?? 1;
  const Tag = `h${Math.min(level, 6)}` as "h1";
  return {
    node: (
      <Tag className={HEADING_CLASS[level - 1]}>
        <Inline actions={ctx.actions} text={m[2] ?? ""} />
      </Tag>
    ),
    next: i + 1,
  };
};

const parseRule: Parser = (ctx, i) =>
  RULE.test(trimmed(ctx, i))
    ? { node: <hr className="my-6 border-border" />, next: i + 1 }
    : null;

const parseEmbed: Parser = (ctx, i) => {
  const m = IMAGE.exec(trimmed(ctx, i));
  return m && EMBED_LINE.test(trimmed(ctx, i))
    ? { node: <MediaEmbed alt={m[1] ?? ""} src={m[2] ?? ""} />, next: i + 1 }
    : null;
};

const parseQuote: Parser = (ctx, i) => {
  if (!QUOTE.test(trimmed(ctx, i))) {
    return null;
  }
  const body: string[] = [];
  let j = i;
  while (j < ctx.lines.length && QUOTE.test(trimmed(ctx, j))) {
    body.push(trimmed(ctx, j).replace(QUOTE, ""));
    j++;
  }
  const emoji = EMOJI_START.exec(body[0] ?? "");
  if (emoji) {
    body[0] = (body[0] ?? "").slice(emoji[0].length);
    return {
      node: (
        <div className="my-4 flex gap-3 rounded-2xl bg-muted/60 px-4 py-3">
          <span className="text-lg leading-relaxed">{emoji[1]}</span>
          <div className="min-w-0 flex-1 leading-relaxed">
            {body.map((b, k) => (
              <p className="min-h-[0.5em]" key={`${k}-${b.slice(0, 6)}`}>
                <Inline actions={ctx.actions} text={b} />
              </p>
            ))}
          </div>
        </div>
      ),
      next: j,
    };
  }
  return {
    node: (
      <blockquote className="my-4 border-[#d97757]/60 border-l-2 pl-4 text-muted-foreground italic">
        {body.map((b, k) => (
          <p key={`${k}-${b.slice(0, 6)}`}>
            <Inline actions={ctx.actions} text={b} />
          </p>
        ))}
      </blockquote>
    ),
    next: j,
  };
};

const splitRow = (row: string) =>
  row
    .trim()
    .replace(ROW_EDGES, "")
    .split("|")
    .map((c) => c.trim());

const parseTable: Parser = (ctx, i) => {
  if (
    !(trimmed(ctx, i).startsWith("|") && TABLE_SEP.test(trimmed(ctx, i + 1)))
  ) {
    return null;
  }
  const head = splitRow(line(ctx, i));
  const rows: string[][] = [];
  let j = i + 2;
  while (j < ctx.lines.length && trimmed(ctx, j).startsWith("|")) {
    rows.push(splitRow(line(ctx, j)));
    j++;
  }
  return {
    node: (
      <div className="my-4 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              {head.map((h, k) => (
                <th
                  className="px-3 py-2 text-left font-medium"
                  key={`${k}-${h}`}
                >
                  <Inline actions={ctx.actions} text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr className="border-t" key={`${k}-${r[0]}`}>
                {r.map((c, m) => (
                  <td className="px-3 py-2" key={`${m}-${c}`}>
                    <Inline actions={ctx.actions} text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    next: j,
  };
};

const indentOf = (raw: string) =>
  Math.min((LEADING.exec(raw)?.[0] ?? "").replace("\t", "    ").length, 24);

function ListItem({ ctx, index }: { ctx: Ctx; index: number }) {
  const raw = line(ctx, index);
  const task = TASK.exec(raw);
  const indent = indentOf(raw) * 0.375;
  if (task) {
    const done = task[1] !== " ";
    return (
      <li
        className="flex items-start gap-2"
        style={{ marginLeft: `${indent}rem` }}
      >
        <input
          aria-label={done ? "Marcar como pendente" : "Marcar como feito"}
          checked={done}
          className="mt-1.5 size-4 shrink-0 accent-[#d97757]"
          onChange={() => ctx.actions.onToggleTask(index + ctx.offset)}
          type="checkbox"
        />
        <span className={cn(done && "text-muted-foreground line-through")}>
          <Inline actions={ctx.actions} text={raw.replace(TASK, "")} />
        </span>
      </li>
    );
  }
  return (
    <li style={indent ? { marginLeft: `${indent}rem` } : undefined}>
      <Inline
        actions={ctx.actions}
        text={raw.replace(ORDERED, "").replace(BULLET, "")}
      />
    </li>
  );
}

const parseList: Parser = (ctx, i) => {
  const ordered = ORDERED.test(line(ctx, i));
  if (!(ordered || BULLET.test(line(ctx, i)))) {
    return null;
  }
  const items: number[] = [];
  let j = i;
  while (
    j < ctx.lines.length &&
    (ORDERED.test(line(ctx, j)) || BULLET.test(line(ctx, j)))
  ) {
    items.push(j);
    j++;
  }
  const tasks = items.every((k) => TASK.test(line(ctx, k)));
  const List = ordered ? "ol" : "ul";
  const start = ordered ? Number.parseInt(trimmed(ctx, i), 10) : 1;
  return {
    node: (
      <List
        className={cn(
          "my-3 flex flex-col gap-1.5 pl-6",
          ordered ? "list-decimal" : "list-disc",
          tasks && "list-none pl-1"
        )}
        start={start > 1 ? start : undefined}
      >
        {items.map((k) => (
          <ListItem ctx={ctx} index={k} key={k} />
        ))}
      </List>
    ),
    next: j,
  };
};

/** <details><summary>Title</summary> … </details> (Notion toggles). */
const parseDetails: Parser = (ctx, i) => {
  if (!DETAILS_OPEN.test(trimmed(ctx, i))) {
    return null;
  }
  let j = i + 1;
  const summary = SUMMARY.exec(trimmed(ctx, j));
  if (summary) {
    j++;
  }
  const start = j;
  let depth = 1;
  for (; j < ctx.lines.length; j++) {
    const t = trimmed(ctx, j);
    if (DETAILS_OPEN.test(t)) {
      depth++;
    } else if (DETAILS_CLOSE.test(t)) {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }
  return {
    node: (
      <details className="group my-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 font-medium [&::-webkit-details-marker]:hidden">
          <span className="text-muted-foreground text-xs transition-transform group-open:rotate-90">
            ▶
          </span>
          <Inline actions={ctx.actions} text={summary?.[1] ?? "Detalhes"} />
        </summary>
        <div className="border-border border-l pl-5">
          <Blocks
            actions={ctx.actions}
            lines={ctx.lines.slice(start, j)}
            offset={ctx.offset + start}
          />
        </div>
      </details>
    ),
    next: j + 1,
  };
};

/** $$ … $$ blocks (shown as the TeX source). */
const parseMath: Parser = (ctx, i) => {
  const first = trimmed(ctx, i);
  if (!first.startsWith(MATH)) {
    return null;
  }
  if (first.length > 4 && first.endsWith(MATH)) {
    return { node: <MathBlock tex={first.slice(2, -2)} />, next: i + 1 };
  }
  const body: string[] = [first.slice(2)];
  let j = i + 1;
  while (j < ctx.lines.length && !trimmed(ctx, j).endsWith(MATH)) {
    body.push(line(ctx, j));
    j++;
  }
  body.push(trimmed(ctx, j).slice(0, -2));
  return { node: <MathBlock tex={body.join("\n").trim()} />, next: j + 1 };
};

function MathBlock({ tex }: { tex: string }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl bg-muted/40 px-4 py-3 text-center font-serif text-[15px] italic">
      {tex}
    </div>
  );
}

const STARTS: Parser[] = [
  parseFence,
  parseDetails,
  parseMath,
  parseHeading,
  parseRule,
  parseEmbed,
  parseQuote,
  parseTable,
  parseList,
];

/** Cheap check for "a new block starts here" (ends a paragraph). */
function isStart(ctx: Ctx, i: number) {
  const t = trimmed(ctx, i);
  return (
    t === "" ||
    t.startsWith(FENCE) ||
    t.startsWith(MATH) ||
    DETAILS_OPEN.test(t) ||
    HEADING.test(t) ||
    RULE.test(t) ||
    EMBED_LINE.test(t) ||
    QUOTE.test(t) ||
    (t.startsWith("|") && TABLE_SEP.test(trimmed(ctx, i + 1))) ||
    ORDERED.test(line(ctx, i)) ||
    BULLET.test(line(ctx, i))
  );
}

function firstBlock(ctx: Ctx, i: number) {
  for (const parse of STARTS) {
    const block = parse(ctx, i);
    if (block) {
      return block;
    }
  }
  return parseParagraph(ctx, i);
}

const parseParagraph: Parser = (ctx, i) => {
  const body = [trimmed(ctx, i)];
  let j = i + 1;
  while (j < ctx.lines.length && !isStart(ctx, j)) {
    body.push(trimmed(ctx, j));
    j++;
  }
  const indent = indentOf(line(ctx, i)) * 0.375;
  return {
    node: (
      <p
        className="my-3 leading-relaxed"
        style={indent ? { marginLeft: `${indent}rem` } : undefined}
      >
        {body.map((b, k) => (
          <Fragment key={`${k}-${b.slice(0, 6)}`}>
            {k > 0 ? <br /> : null}
            <Inline actions={ctx.actions} text={b} />
          </Fragment>
        ))}
      </p>
    ),
    next: j,
  };
};

function Blocks({
  lines,
  actions,
  offset,
}: {
  lines: string[];
  actions: MarkdownActions;
  offset: number;
}) {
  const ctx: Ctx = { lines, actions, offset };
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < ctx.lines.length) {
    if (trimmed(ctx, i) === "") {
      i++;
      continue;
    }
    const block = firstBlock(ctx, i);
    if (!block) {
      break;
    }
    blocks.push(<Fragment key={i}>{block.node}</Fragment>);
    i = block.next;
  }
  return <>{blocks}</>;
}

export function NoteMarkdown({
  text,
  actions,
}: {
  text: string;
  actions: MarkdownActions;
}) {
  return (
    <div className="note-prose text-[15px]">
      <Blocks
        actions={actions}
        lines={text.replace(CRLF, "\n").split("\n")}
        offset={0}
      />
    </div>
  );
}
