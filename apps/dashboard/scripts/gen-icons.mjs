/**
 * The full Central Icons bundle holds every icon in every style (~54 MB of
 * JS), which ships to the browser because <Icon name> looks icons up by
 * name. This keeps only the icons the dashboard uses, in its one style, in
 * lib/icons/icon-data.json. Runs before dev and build.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STYLE = "round-outlined-radius-0-stroke-1.5";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = /["'`](Icon[A-Z][A-Za-z0-9]*)["'`]/g;
const SOURCE_FILE = /\.(ts|tsx)$/;
const CJS = /\.js$/;

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* sources(path);
    } else if (SOURCE_FILE.test(entry)) {
      yield path;
    }
  }
}

const used = new Set();
for (const dir of ["app", "components", "lib"]) {
  for (const file of sources(join(root, dir))) {
    for (const m of readFileSync(file, "utf8").matchAll(NAME)) {
      used.add(m[1]);
    }
  }
}

const require = createRequire(join(root, "../../packages/icons/package.json"));
const bundle = readFileSync(
  require.resolve("@central-icons-react/all").replace(CJS, ".mjs"),
  "utf8"
);

const icons = {};
for (const name of [...used].sort()) {
  const key = `"${STYLE}/${name}":`;
  const at = bundle.indexOf(key);
  if (at < 0) {
    continue; // not an icon (e.g. a component named Icon…)
  }
  const start = at + key.length;
  const quote = bundle[start];
  const end = bundle.indexOf(quote, start + 1);
  icons[name] = bundle.slice(start + 1, end);
}

writeFileSync(
  join(root, "lib/icons/icon-data.json"),
  `${JSON.stringify(icons, null, 0)}\n`
);
console.log(`icons: ${Object.keys(icons).length} of ${used.size} names`);
