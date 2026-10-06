import { Fragment, type ReactNode } from "react";

/**
 * Small, dependency-free markdown renderer for assistant replies:
 * headings, paragraphs, bold/italic/inline code, ordered & unordered lists,
 * block quotes, fenced code and pipe tables. Never uses innerHTML.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
const ORDERED = /^\d+\.\s+/;
const BULLET = /^[-*•]\s+/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const TABLE_SEP = /^\|?\s*:?-{2,}/;
const ROW_START = /^\|/;
const ROW_END = /\|$/;
const QUOTE_MARK = /^>\s?/;
const CRLF = /\r\n/g;
const FENCE = "```";

interface Parsed {
  node: ReactNode;
  next: number;
}

type BlockParser = (lines: string[], i: number, key: string) => Parsed | null;

const at = (lines: string[], i: number) => (lines[i] ?? "").trim();

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong className="font-semibold" key={key}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          key={key}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const splitRow = (row: string) =>
  row
    .trim()
    .replace(ROW_START, "")
    .replace(ROW_END, "")
    .split("|")
    .map((c) => c.trim());

const parseFence: BlockParser = (lines, i, key) => {
  if (!at(lines, i).startsWith(FENCE)) {
    return null;
  }
  const code: string[] = [];
  let j = i + 1;
  while (j < lines.length && !at(lines, j).startsWith(FENCE)) {
    code.push(lines[j] ?? "");
    j++;
  }
  return {
    node: (
      <pre
        className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-[13px] leading-relaxed"
        key={key}
      >
        {code.join("\n")}
      </pre>
    ),
    next: j + 1,
  };
};

const parseHeading: BlockParser = (lines, i, key) => {
  const match = HEADING.exec(lines[i] ?? "");
  if (!match) {
    return null;
  }
  const level = match[1]?.length ?? 2;
  const content = inline(match[2] ?? "", key);
  return {
    node:
      level <= 2 ? (
        <h3 className="mt-2 font-semibold text-lg tracking-tight" key={key}>
          {content}
        </h3>
      ) : (
        <h4 className="mt-1 font-semibold" key={key}>
          {content}
        </h4>
      ),
    next: i + 1,
  };
};

const parseTable: BlockParser = (lines, i, key) => {
  if (!(at(lines, i).startsWith("|") && TABLE_SEP.test(at(lines, i + 1)))) {
    return null;
  }
  const header = splitRow(lines[i] ?? "");
  const rows: string[][] = [];
  let j = i + 2;
  while (j < lines.length && at(lines, j).startsWith("|")) {
    rows.push(splitRow(lines[j] ?? ""));
    j++;
  }
  return {
    node: (
      <div className="overflow-x-auto rounded-xl border" key={key}>
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              {header.map((h, c) => (
                <th
                  className="px-3 py-2 text-left font-medium"
                  key={`${key}-h${c}`}
                >
                  {inline(h, `${key}-h${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr className="border-t" key={`${key}-r${ri}`}>
                {r.map((cell, c) => (
                  <td
                    className="px-3 py-2 tabular-nums"
                    key={`${key}-r${ri}c${c}`}
                  >
                    {inline(cell, `${key}-r${ri}c${c}`)}
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

const parseQuote: BlockParser = (lines, i, key) => {
  if (!at(lines, i).startsWith(">")) {
    return null;
  }
  const quote: string[] = [];
  let j = i;
  while (j < lines.length && at(lines, j).startsWith(">")) {
    quote.push(at(lines, j).replace(QUOTE_MARK, ""));
    j++;
  }
  return {
    node: (
      <blockquote
        className="border-[#d97757] border-l-2 pl-3 text-muted-foreground"
        key={key}
      >
        {inline(quote.join(" "), key)}
      </blockquote>
    ),
    next: j,
  };
};

const parseList: BlockParser = (lines, i, key) => {
  const first = at(lines, i);
  const ordered = ORDERED.test(first);
  if (!(ordered || BULLET.test(first))) {
    return null;
  }
  const marker = ordered ? ORDERED : BULLET;
  const items: string[] = [];
  let j = i;
  while (j < lines.length && marker.test(at(lines, j))) {
    items.push(at(lines, j).replace(marker, ""));
    j++;
  }
  const children = items.map((item, n) => (
    <li className="pl-1" key={`${key}-${n}`}>
      {inline(item, `${key}-${n}`)}
    </li>
  ));
  return {
    node: ordered ? (
      <ol className="list-decimal space-y-1 pl-5" key={key}>
        {children}
      </ol>
    ) : (
      <ul className="list-disc space-y-1 pl-5" key={key}>
        {children}
      </ul>
    ),
    next: j,
  };
};

const isBlockStart = (line: string) =>
  HEADING.test(line) ||
  BULLET.test(line) ||
  ORDERED.test(line) ||
  line.startsWith("|") ||
  line.startsWith(">") ||
  line.startsWith(FENCE);

const parseParagraph: BlockParser = (lines, i, key) => {
  const para: string[] = [lines[i] ?? ""];
  let j = i + 1;
  while (
    j < lines.length &&
    at(lines, j) !== "" &&
    !isBlockStart(at(lines, j))
  ) {
    para.push(lines[j] ?? "");
    j++;
  }
  return {
    node: (
      <p className="leading-relaxed" key={key}>
        {inline(para.join(" "), key)}
      </p>
    ),
    next: j,
  };
};

const PARSERS: BlockParser[] = [
  parseFence,
  parseHeading,
  parseTable,
  parseQuote,
  parseList,
  // Always matches, so a line that looks like a block start but isn't one
  // (e.g. a stray "|") still advances.
  parseParagraph,
];

function parseBlock(lines: string[], i: number): Parsed {
  for (const parse of PARSERS) {
    const parsed = parse(lines, i, `b${i}`);
    if (parsed) {
      return parsed;
    }
  }
  return { node: null, next: i + 1 };
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(CRLF, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (at(lines, i) === "") {
      i++;
      continue;
    }
    const parsed = parseBlock(lines, i);
    blocks.push(parsed.node);
    i = parsed.next;
  }
  return <div className="flex flex-col gap-3">{blocks}</div>;
}
