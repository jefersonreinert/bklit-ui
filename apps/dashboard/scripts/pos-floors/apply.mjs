#!/usr/bin/env node
// Replaces a business's floor plan (POS tables + reservations):
//   node scripts/pos-floors/apply.mjs scripts/pos-floors/vinomad.json
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const floor = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = execFileSync("npx", ["convex", "run", "pos:setFloor", JSON.stringify(floor)], {
  encoding: "utf8",
});
console.log(out.trim());
