/**
 * Builds lib/telegram/tool-catalog.json from @overpod/mcp-telegram: every
 * tool it registers (name, description, tier and JSON input schema), grouped
 * by the module that registers it. The browser and the assistant read this
 * file instead of booting GramJS. Run after upgrading the package:
 *
 *   node scripts/gen-telegram-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
// dist/telegram-client.js → dist/ (tools/ is not in the package exports)
const dist = dirname(require.resolve("@overpod/mcp-telegram/service"));
const { version } = JSON.parse(
  readFileSync(join(dist, "..", "package.json"), "utf8")
);

const { McpServer } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js"))
);
const { Client } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js"))
);
const { InMemoryTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/inMemory.js"))
);

// Opt-in groups are listed too; the server enables them at run time
for (const flag of [
  "MCP_TELEGRAM_ENABLE_STARS",
  "MCP_TELEGRAM_ENABLE_GROUP_CALLS",
  "MCP_TELEGRAM_ENABLE_QUICK_REPLIES",
]) {
  process.env[flag] = "1";
}

/** Module file → register function, in the package's own order. */
const MODULES = [
  ["auth", "registerAuthTools"],
  ["messages", "registerMessageTools"],
  ["chats", "registerChatTools"],
  ["media", "registerMediaTools"],
  ["send-media", "registerSendMediaTools"],
  ["contacts", "registerContactTools"],
  ["reactions", "registerReactionTools"],
  ["transcribe", "registerTranscribeTools"],
  ["fact-check", "registerFactCheckTools"],
  ["extras", "registerExtraTools"],
  ["account", "registerAccountTools"],
  ["business", "registerBusinessTools"],
  ["folders", "registerFolderTools"],
  ["stickers", "registerStickerTools"],
  ["stories", "registerStoryTools"],
  ["boosts", "registerBoostTools"],
  ["group-calls", "registerGroupCallTools"],
  ["stars", "registerStarsTools"],
  ["quick-replies", "registerQuickRepliesTools"],
  ["music", "registerMusicTools"],
];

const server = new McpServer({ name: "catalog", version: "0.0.0" });
const moduleOf = new Map();
for (const [file, fn] of MODULES) {
  const mod = await import(pathToFileURL(join(dist, "tools", `${file}.js`)));
  const before = new Set(Object.keys(server._registeredTools));
  mod[fn](server, {});
  for (const name of Object.keys(server._registeredTools)) {
    if (!before.has(name)) {
      moduleOf.set(name, file);
    }
  }
}

const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(b);
const client = new Client({ name: "catalog", version: "0.0.0" });
await client.connect(a);
const { tools } = await client.listTools();

const tier = (t) => {
  if (t.annotations?.destructiveHint) {
    return "destructive";
  }
  return t.annotations?.readOnlyHint ? "read-only" : "write";
};

const catalog = {
  package: "@overpod/mcp-telegram",
  version,
  tools: tools.map((t) => {
    const { $schema: _s, ...inputSchema } = t.inputSchema ?? {};
    return {
      name: t.name,
      module: moduleOf.get(t.name) ?? "extras",
      tier: tier(t),
      description: t.description ?? "",
      inputSchema,
    };
  }),
};

const out = join(root, "lib/telegram/tool-catalog.json");
writeFileSync(out, `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`Wrote ${catalog.tools.length} tools (v${version}) to ${out}`);
process.exit(0);
