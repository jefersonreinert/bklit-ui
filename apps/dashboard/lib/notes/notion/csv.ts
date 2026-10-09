const FIELD = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|\r|$)/y;
const DOUBLE_QUOTE = /""/g;

/** RFC 4180 CSV (quotes, commas and newlines inside quotes, BOM). */
export function parseCsv(input: string): string[][] {
  const src = input.charCodeAt(0) === 0xfe_ff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  FIELD.lastIndex = 0;
  while (FIELD.lastIndex < src.length) {
    const m = FIELD.exec(src);
    if (!m) {
      break;
    }
    row.push(
      m[1] === undefined ? (m[2] ?? "") : m[1].replace(DOUBLE_QUOTE, '"')
    );
    if (m[3] !== ",") {
      rows.push(row);
      row = [];
    }
    if (m[0] === "") {
      break;
    }
  }
  if (row.length > 0) {
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const PIPE = /\|/g;
const NEWLINES = /\s*\n\s*/g;

/** A cell safe for a one-line markdown table cell. */
export const tableCell = (s: string) =>
  s.replace(NEWLINES, " ").replace(PIPE, "/").trim();

export function markdownTable(rows: string[][]) {
  const [head, ...body] = rows;
  if (!head) {
    return "";
  }
  const width = head.length;
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => tableCell(r[i] ?? "") || " ").join(" | ")} |`;
  return [
    line(head),
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map(line),
  ].join("\n");
}
