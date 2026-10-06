// Fixes for Baileys 7.0.0-rc pairing/login (see openclaw/openclaw#19907):
// with `passive: true` WhatsApp treats the linked device as a passive
// listener and logs it out (401 / device_removed) right after pairing.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = dirname(
  createRequire(import.meta.url).resolve("baileys/package.json")
);

const PATCHES = [
  {
    file: "lib/Utils/validate-connection.js",
    from: "        passive: true,\n        pull: true,",
    to: "        passive: false,\n        pull: true,",
  },
  {
    file: "lib/Utils/validate-connection.js",
    from: "        // TODO: investigate (hard set as false atm)\n        lidDbMigrated: false\n",
    to: "",
  },
  {
    file: "lib/Socket/socket.js",
    from: "        await noise.finishInit();\n        startKeepAliveRequest();",
    to: "        noise.finishInit();\n        startKeepAliveRequest();",
  },
];

for (const p of PATCHES) {
  const path = join(root, p.file);
  const source = readFileSync(path, "utf8");
  if (source.includes(p.from)) {
    writeFileSync(path, source.replace(p.from, p.to));
    console.log(`patched ${p.file}`);
  } else if (!source.includes(p.to) || p.to === "") {
    throw new Error(`Baileys changed: patch target not found in ${p.file}`);
  }
}
