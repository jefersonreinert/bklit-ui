// Lists every interface text of the dashboard (JSX text and string literals
// in props, objects and ternaries) into lib/i18n/catalog.json, the texts the
// app translates into other languages. Run after adding screens:
//   node scripts/i18n-extract.mjs

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.argv[2] ?? path.join(import.meta.dirname, "..");
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) {
      if (!["__tests__", "node_modules", "_generated"].includes(f.name))
        walk(p);
    } else if (
      /\.(tsx?|mts)$/.test(f.name) &&
      !/\.test\./.test(f.name) &&
      !p.includes("/i18n/")
    )
      files.push(p);
  }
};
for (const d of ["app", "components", "lib"]) walk(path.join(root, d));
const SKIP_PROPS = new Set([
  "className",
  "href",
  "src",
  "key",
  "id",
  "type",
  "name",
  "role",
  "rel",
  "target",
  "method",
  "inputMode",
  "autoComplete",
  "htmlFor",
  "variant",
  "size",
  "side",
  "align",
  "as",
  "mode",
  "accept",
  "pattern",
  "lang",
  "dir",
  "fill",
  "stroke",
  "d",
  "viewBox",
  "xmlns",
  "data-slot",
  "icon",
  "color",
  "kind",
  "format",
  "locale",
  "ref",
]);
const looksText = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (/^(https?:|\/|#|\.|@|mailto:|data:|[a-z]+:\/\/)/.test(t)) return false;
  if (
    /^[a-z0-9_\-:./[\]()%#=,&>*!+ ]+$/.test(t) &&
    !/ [a-zà-ú]{3,} [a-zà-ú]/.test(t) &&
    !/[A-ZÀ-Ú]/.test(t)
  ) {
    // lowercase token soup (classes, ids): keep only if it reads like a phrase with accents
    if (!/[à-úç]/.test(t)) return false;
  }
  if (/^[A-Z0-9_]+$/.test(t)) return false; // CONSTANTS
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(t)) return false; // camelCase
  if (/^Icon[A-Z]/.test(t)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+$/.test(t)) return false; // kebab ids
  if (
    /\b(flex|grid|px-|py-|text-|bg-|rounded|border|size-|gap-|items-|justify-)/.test(
      t
    )
  )
    return false;
  return true;
};
const out = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(
    f,
    src,
    ts.ScriptTarget.Latest,
    true,
    f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const add = (text) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (looksText(t))
      out.set(t, (out.get(t) ?? new Set()).add(path.relative(root, f)));
  };
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) add(n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (ts.isJsxAttribute(p) && SKIP_PROPS.has(p.name.getText())) return;
      if (ts.isPropertyAssignment(p) && p.name === n) return; // object keys
      if (
        ts.isPropertyAssignment(p) &&
        [
          "className",
          "href",
          "id",
          "icon",
          "color",
          "key",
          "type",
          "kind",
          "src",
          "swatch",
          "unit",
          "format",
        ].includes(p.name.getText?.() ?? "")
      )
        return;
      if (
        ts.isCallExpression(p) &&
        /^(cn|clsx|require|import|getElementById|querySelector|addEventListener|setAttribute|fetch|localStorage\.\w+|JSON\.\w+|new URL|Intl\.\w+|startsWith|endsWith|includes|split|replace|match|test)$/.test(
          p.expression.getText().split(".").pop() ?? ""
        )
      )
        return;
      if (ts.isLiteralTypeNode(p) || ts.isCaseClause(p)) return;
      if (
        ts.isBinaryExpression(p) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(p.operatorToken.kind)
      )
        return;
      if (ts.isElementAccessExpression(p)) return;
      add(n.text);
    } else if (ts.isTemplateExpression(n)) {
      // `Pedido ${n}` → "Pedido {0}" kept for reference only
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const list = [...out.keys()].sort();
fs.writeFileSync(
  process.argv[3] ?? path.join(root, "lib/i18n/catalog.json"),
  JSON.stringify(list, null, 0)
);
console.log(list.length, "textos de", files.length, "arquivos");
