"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartEmbed, MediaEmbed } from "./note-embeds";

/**
 * Markdown for notes (no innerHTML): headings, paragraphs, lists, tasks,
 * quotes, code, tables, rules, [[links]], #tags, links, media embeds
 * (images, video, YouTube, audio, PDFs, files) and ```chart blocks.
 */

export interface MarkdownActions {
  /** Whether a [[title]] resolves to a note. */
  exists: (title: string) => boolean;
  onLink: (title: string) => void;
  onTag: (tag: string) => void;
  /** Toggles the task on that source line. */
  onToggleTask: (line: number) => void;
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

function ListItem({ ctx, index }: { ctx: Ctx; index: number }) {
  const raw = line(ctx, index);
  const task = TASK.exec(raw);
  if (task) {
    const done = task[1] !== " ";
    return (
      <li className="flex items-start gap-2">
        <input
          aria-label={done ? "Marcar como pendente" : "Marcar como feito"}
          checked={done}
          className="mt-1.5 size-4 shrink-0 accent-[#d97757]"
          onChange={() => ctx.actions.onToggleTask(index)}
          type="checkbox"
        />
        <span className={cn(done && "text-muted-foreground line-through")}>
          <Inline actions={ctx.actions} text={raw.replace(TASK, "")} />
        </span>
      </li>
    );
  }
  return (
    <li>
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
  return {
    node: (
      <List
        className={cn(
          "my-3 flex flex-col gap-1.5 pl-6",
          ordered ? "list-decimal" : "list-disc",
          tasks && "list-none pl-1"
        )}
      >
        {items.map((k) => (
          <ListItem ctx={ctx} index={k} key={k} />
        ))}
      </List>
    ),
    next: j,
  };
};

const STARTS: Parser[] = [
  parseFence,
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
  return {
    node: (
      <p className="my-3 leading-relaxed">
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

export function NoteMarkdown({
  text,
  actions,
}: {
  text: string;
  actions: MarkdownActions;
}) {
  const ctx: Ctx = { lines: text.replace(CRLF, "\n").split("\n"), actions };
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
  return <div className="note-prose text-[15px]">{blocks}</div>;
}
