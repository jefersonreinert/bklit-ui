// Connectivity probe: does WhatsApp accept a new Baileys device from this
// network? Prints connection updates for ~60 s (no account is linked).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import makeWASocket, {
  Browsers,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "baileys";
import pino from "pino";

const { state } = await useMultiFileAuthState(
  mkdtempSync(join(tmpdir(), "wa-"))
);
const { version } = await fetchLatestWaWebVersion({}).catch(() => ({}));
const sock = makeWASocket({
  auth: state,
  version,
  browser: Browsers.macOS("Desktop"),
  logger: pino({ level: "silent" }),
});
sock.ev.on("connection.update", (u) => {
  const code = u.lastDisconnect?.error?.output?.statusCode;
  console.log(
    JSON.stringify({ connection: u.connection, qr: Boolean(u.qr), code })
  );
  if (u.qr) {
    console.log("RESULT: OK — WhatsApp offered a link (QR) from this network");
    process.exit(0);
  }
});
setTimeout(() => {
  console.log("RESULT: no QR within 60 s");
  process.exit(1);
}, 60_000);
