// Copies the ZXing WebAssembly decoder into public/ so the barcode
// scanner loads it from our own domain (works offline, no CDN).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const wasm = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const out = join(process.cwd(), "public/vendor/zxing");
mkdirSync(out, { recursive: true });
copyFileSync(wasm, join(out, "zxing_reader.wasm"));
console.log("zxing_reader.wasm → public/vendor/zxing/");
