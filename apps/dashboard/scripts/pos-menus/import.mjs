#!/usr/bin/env node
// Loads a business menu into Convex in parts (a command-line argument is
// limited to 128 KB): the first part replaces the menu, the next ones add.
//   node scripts/pos-menus/import.mjs scripts/pos-menus/the-brew.json
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX = 90_000;
const menu = JSON.parse(readFileSync(process.argv[2], "utf8"));
const parts = [[]];
for (const p of menu.products) {
  const part = parts.at(-1);
  if (part.length && JSON.stringify([...part, p]).length > MAX) {
    parts.push([p]);
  } else {
    part.push(p);
  }
}
parts.forEach((products, i) => {
  const args = { ...menu, products, ...(i > 0 ? { keep: true } : {}) };
  const out = execFileSync(
    "npx",
    ["convex", "run", "pos:importMenu", JSON.stringify(args)],
    { encoding: "utf8" }
  );
  console.log(`parte ${i + 1}/${parts.length}: ${out.trim()}`);
});
