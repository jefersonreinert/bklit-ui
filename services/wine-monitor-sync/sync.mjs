// Wine Monitor Online (By The Glass) → Casa Brasa mirror.
//
// READ-ONLY by construction: every request to the portal that is not a GET
// is aborted unless it is
//   1. the login form,
//   2. the page's own automatic "InitialPageLoad" (what a browser does just
//      by opening the page), or
//   3. a grid's "Next Page" pager button.
// Save, edit, delete, top-up, export, settings: none of them can leave the
// browser. Requests to other hosts (the live SignalR hub) are aborted too.
//
// Env:
//   WM_SECRETS   file with the portal user (line 1) and password (line 2)
//   WM_POST_URL  Convex HTTP endpoint, e.g. https://site.…/winemonitor/sync
//   WM_TOKEN     shared secret sent as x-wm-token
//   WM_COMPANY   POS company id (default "vinomad")
//   WM_OUT       optional: also write the JSON snapshot to this file
import fs from "node:fs";
import { chromium } from "playwright";

const PORTAL = "https://www.remote-bytheglass.eu/";
const BASE = `${PORTAL}Pages/`;
const TZ = "Europe/Malta";
const SECRETS = process.env.WM_SECRETS || "/root/.secrets/bytheglass";
const [user, pw] = fs
  .readFileSync(SECRETS, "utf8")
  .split("\n")
  .map((s) => s.trim());
const PAGER = /\$RadGridDetail\$ctl00\$ctl03\$ctl01\$ctl\d+$/;
const FILTER_BOX = /\$FilterTextBox_\w+$/;
const AUTH_PAGE = /\/Auth\//;
const NO_ROWS = /No rows to display/;
const PORTAL_DATE =
  /(\d{1,4})\/(\d{1,2})\/(\d{1,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i;
const DEBIT = /debit/i;
const LIMIT = /LIMIT/i;
const FROM_PREFIX = /^FROM:\s*/i;
const ACTION =
  /(Save|Update|Insert|Delete|Edit|Add|Create|Export|Logout|Settings|Button)$/i;

/* ------------------------------- browser ------------------------------- */

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  locale: "en-US",
});
const page = await ctx.newPage();
let loggingIn = true;
const blocked = [];

await page.route("**/*", (route) => {
  const r = route.request();
  if (r.method() === "GET") {
    return route.continue();
  }
  if (!r.url().startsWith(PORTAL)) {
    blocked.push(new URL(r.url()).host);
    return route.abort();
  }
  const body = new URLSearchParams(r.postData() || "");
  const keys = [...body.keys()];
  const tgt = body.get("__EVENTTARGET") || "";
  const arg = body.get("__EVENTARGUMENT") || "";
  const pagerButton =
    !tgt &&
    keys.filter((k) => PAGER.test(k)).length === 1 &&
    !keys.some((k) => !FILTER_BOX.test(k) && ACTION.test(k));
  const ok =
    (loggingIn && r.url().includes("/Login.aspx")) ||
    (tgt.endsWith("RadAjaxManager1") && arg === "InitialPageLoad") ||
    PAGER.test(tgt) ||
    pagerButton;
  if (!ok) {
    blocked.push(`${new URL(r.url()).pathname} target=${tgt}`);
  }
  return ok ? route.continue() : route.abort();
});

async function login() {
  await page.goto(`${BASE}Login.aspx`);
  await page.fill("#ctl00_contentBody_AppLogin_UserName", user);
  await page.fill("#ctl00_contentBody_AppLogin_Password", pw);
  await Promise.all([
    page.waitForURL(AUTH_PAGE, { timeout: 45_000 }),
    page.click("#contentBody_AppLogin_LoginButton"),
  ]);
  loggingIn = false;
}

const settle = async () => {
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
};

async function open(path) {
  await page.goto(`${BASE}Auth/${path}`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  await settle();
}

/** Visible cells of every row of the page's grid, following every page. */
async function grid(path) {
  await open(path);
  const read = () =>
    page.evaluate(() => {
      const t = document.querySelector('[id$="RadGridDetail_ctl00"]');
      if (!t) {
        return null;
      }
      const vis = (el) => getComputedStyle(el).display !== "none";
      const rows = [
        ...t.querySelectorAll(
          ":scope > tbody > tr.rgRow, :scope > tbody > tr.rgAltRow"
        ),
      ].map((r) =>
        [...r.children]
          .filter(vis)
          .map((td) => td.innerText.replace(/[ \t]+/g, " ").trim())
      );
      const info = document.querySelector(".rgInfoPart")?.innerText || "";
      // biome-ignore lint/performance/useTopLevelRegex: runs inside the page
      const m = info.match(/(\d+)\s+items in\s+(\d+)\s+pages/);
      return { rows, items: m ? +m[1] : null, pages: m ? +m[2] : 1 };
    });
  const first = await read();
  if (!first) {
    return [];
  }
  const all = [...first.rows];
  for (let p = 2; p <= first.pages; p++) {
    await page
      .locator('[id$="RadGridDetail_ctl00"] input.rgPageNext')
      .first()
      .click();
    await page.waitForFunction(
      (n) =>
        document.querySelector(".rgCurrentPage")?.innerText?.trim() ===
        String(n),
      p,
      { timeout: 60_000 }
    );
    await settle();
    all.push(...(await read()).rows);
  }
  if (first.items !== null && all.length !== first.items) {
    throw new Error(`${path}: expected ${first.items} rows, got ${all.length}`);
  }
  return all.filter((r) => r.some((c) => c && !NO_ROWS.test(c)));
}

const inputValue = (sel) =>
  page.evaluate((s) => document.querySelector(s)?.value ?? "", sel);

/* ------------------------------- parsing ------------------------------- */

const num = (s) => {
  const n = Number.parseFloat(String(s ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const text = (s) => {
  const t = String(s ?? "").trim();
  return t || undefined;
};
const lines = (s) =>
  String(s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Offset (ms) of the portal's time zone at a given UTC instant. */
function tzOffset(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second
  );
  return asUtc - utcMs;
}

/**
 * Portal date ("11/3/2026 08:14 PM", "2026/11/03 10:25:25 PM",
 * "10/30/2026") in Malta time → epoch ms.
 */
function when(s) {
  const m = String(s ?? "").match(PORTAL_DATE);
  if (!m) {
    return undefined;
  }
  const [, a, b, c, h = "0", mi = "0", se = "0", ap] = m;
  const [y, mo, d] = a.length === 4 ? [+a, +b, +c] : [+c, +a, +b];
  let hour = +h;
  if (ap) {
    hour = (hour % 12) + (ap.toUpperCase() === "PM" ? 12 : 0);
  }
  const wall = Date.UTC(y, mo - 1, d, hour, +mi, +se);
  return wall - tzOffset(wall - tzOffset(wall));
}

const triple = (r, i) => [num(r[i]), num(r[i + 1]), num(r[i + 2])];

const parse = {
  dispensers: (rows) =>
    rows.map((r) => ({
      code: r[1],
      name: r[2],
      model: text(r[3]),
      positions: num(r[5]) ?? 0,
      valid: r[6] === "Yes",
    })),
  positions: (rows) =>
    rows.map((r) => ({
      dispenser: r[1],
      position: num(r[2]) ?? 0,
      sku: text(r[3]),
      wine: text(r[4]),
      variety: text(r[5]),
      changedAt: when(r[6]),
      calibration: num(r[7]),
      residueMl: num(r[8]) ?? 0,
      prices: triple(r, 9),
      doses: triple(r, 12),
    })),
  wines: (rows) =>
    rows.map((r) => ({
      valid: r[1] === "Yes",
      name: r[2],
      sku: text(r[3]),
      description: text(r[4]),
      vintage: text(r[5]),
      producer: text(r[6]),
      origin: text(r[7]),
      variety: text(r[8]),
      title1: text(r[9]),
      title2: text(r[10]),
      volumeMl: num(r[11]),
      lifespanDays: num(r[12]),
      doses: triple(r, 13),
      minResidueMl: num(r[16]),
      prices: triple(r, 17),
    })),
  cards: (rows) =>
    rows.map((r) => {
      const [id, type = ""] = lines(r[5]);
      const debit = DEBIT.test(type);
      const bal = lines(r[14]);
      const period = lines(r[15]);
      return {
        cardId: id,
        kind: debit ? "debit" : "credit",
        valid: r[4] === "Yes",
        branch: text(r[6]),
        clientId: text(r[7]),
        firstName: text(r[8]),
        surname: text(r[9]),
        label: text(r[10]),
        email: text(r[11]),
        discount: num(r[12]) ?? 0,
        // Prepaid cards keep a credit; debit cards run a tab up to a limit
        balance: (debit ? num(bal[0]) : num(r[13])) ?? 0,
        limit: num(bal.find((l) => LIMIT.test(l))),
        period: text(period[0]) === "None" ? undefined : text(period[0]),
        lastAt: when(period[1]),
      };
    }),
  sales: (rows) =>
    rows.map((r) => ({
      cardId: text(r[2]),
      clientId: text(r[3]),
      dispenser: r[5],
      wine: r[6],
      sku: text(r[7]),
      ml: num(r[8]) ?? 0,
      price: num(r[9]) ?? 0,
      discount: num(r[10]) ?? 0,
      at: when(r[11]),
    })),
  credits: (rows) =>
    rows.map((r) => ({
      record: r[1],
      cardId: text(r[2]),
      clientId: text(r[3]),
      source: [r[4], r[6]].filter(Boolean).join(" · ") || undefined,
      at: when(r[7]),
      oldValue: num(r[8]) ?? 0,
      newValue: num(r[9]) ?? 0,
      diff: num(r[10]) ?? 0,
    })),
  changes: (rows, kind) =>
    rows.map((r) => {
      const [sku, ...wine] = lines(r[2]);
      const [dispenser] = lines(r[3]);
      const [cardId] = lines(r[7]);
      const [to, from] = lines(r[8]);
      return {
        kind,
        sku: text(sku),
        wine: wine.join(" ") || sku,
        dispenser,
        position: num(r[4]) ?? 0,
        oldMl: num(r[5]) ?? 0,
        newMl: num(r[6]) ?? 0,
        cardId: text(cardId),
        at: when(to),
        since: when(String(from ?? "").replace(FROM_PREFIX, "")),
      };
    }),
};

/** Wine Monitor node and last-seen of each dispenser (branch page text). */
function branchInfo(t) {
  const after = (label) =>
    t.match(new RegExp(`${label}:?\\s*\\n?\\s*([^\\n]+)`))?.[1]?.trim();
  const seen = {};
  for (const m of t.matchAll(
    /(\d{8})\s+(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M)/g
  )) {
    seen[m[1]] = when(m[2]);
  }
  return {
    node: {
      version: after("WMNODE VERSION"),
      ip: after("IP"),
      ram: after("RAM"),
      hdd: after("HDD"),
      cpu: after("CPU"),
    },
    seen,
  };
}

/* --------------------------------- run --------------------------------- */

const started = Date.now();
await login();

const dispensers = parse.dispensers(await grid("Device.aspx"));
const positions = parse.positions(await grid("ReportPositions.aspx"));
const wines = parse.wines(await grid("Product.aspx"));
const cards = parse.cards(await grid("Card.aspx"));
const sales = parse.sales(await grid("ReportDispense.aspx"));
// The sales report covers the last 24 h: everything stored since its start
// is replaced by what the portal shows now
const salesFrom = when(
  await inputValue("#ctl00_ctl00_contentBody_RadDateTimePickerOd_dateInput")
);
const credits = parse.credits(await grid("ReportCredits.aspx"));
const changes = [
  ...parse.changes(await grid("ReportWineChanges.aspx"), "change"),
  ...parse.changes(await grid("ReportWineChanges.aspx?adjust=true"), "adjust"),
];
await open("Department.aspx");
const branch = branchInfo(
  await page.evaluate(() => document.querySelector("form").innerText)
);
await browser.close();

for (const d of dispensers) {
  d.lastSeen = branch.seen[d.code];
}

const snapshot = {
  company: process.env.WM_COMPANY || "vinomad",
  takenAt: started,
  ms: Date.now() - started,
  node: branch.node,
  dispensers,
  positions,
  wines,
  cards,
  sales: sales.filter((s) => s.at),
  salesFrom: salesFrom ?? started - 24 * 3_600_000,
  credits: credits.filter((c) => c.record && c.at),
  changes: changes.filter((c) => c.at),
  blocked: blocked.filter((b) => !b.endsWith(".azurewebsites.net")),
};

const out = JSON.stringify(snapshot);
if (process.env.WM_OUT) {
  fs.writeFileSync(process.env.WM_OUT, out);
}
const summary = {
  ms: snapshot.ms,
  dispensers: dispensers.length,
  positions: positions.length,
  wines: wines.length,
  cards: cards.length,
  sales: snapshot.sales.length,
  credits: snapshot.credits.length,
  changes: snapshot.changes.length,
  blocked: snapshot.blocked,
};
if (process.env.WM_POST_URL) {
  const res = await fetch(process.env.WM_POST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wm-token": process.env.WM_TOKEN || "",
    },
    body: out,
  });
  summary.post = `${res.status} ${(await res.text()).slice(0, 300)}`;
  if (!res.ok) {
    console.error(JSON.stringify(summary));
    process.exit(1);
  }
}
console.log(JSON.stringify(summary));
