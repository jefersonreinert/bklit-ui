import { type NextRequest, NextResponse } from "next/server";
import { isCrossSite } from "@/lib/server/same-site";
import {
  accessCookie,
  bridgeHealth,
  bridgeStatus,
  codeMatches,
  hasAccess,
  isLocked,
  listChats,
  logout,
  markSeen,
  pairPhone,
  readChat,
  sendText,
  signedUrl,
  WA_COOKIE,
  WA_COOKIE_MAX_AGE,
  WhatsappError,
  whatsappConfig,
} from "@/lib/server/whatsapp";
import type { WaStatus } from "@/lib/whatsapp-types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ action: string }>;
}

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

async function status(request: NextRequest): Promise<WaStatus> {
  const unlocked = await hasAccess(request);
  const base = {
    configured: Boolean(whatsappConfig()),
    locked: isLocked(),
    unlocked,
    bridge: null,
  };
  if (!(unlocked && base.configured)) {
    return base;
  }
  try {
    return { ...base, bridge: await bridgeStatus() };
  } catch {
    return { ...base, offline: true };
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

type Handler = (body: Record<string, unknown>, url: URL) => Promise<unknown>;

/** Routes that need the access cookie. */
const PROTECTED: Record<string, Handler> = {
  "POST pair": (b) => pairPhone(str(b.phone)),
  "POST logout": () => logout(),
  "GET chats": () => listChats(),
  "GET messages": (_b, url) =>
    readChat(
      url.searchParams.get("chat") ?? "",
      Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 2000)
    ),
  "POST upload-url": async (b) => ({ url: signedUrl("upload", str(b.chat)) }),
  "POST send": (b) => sendText(str(b.chat), str(b.text)),
  "POST seen": (b) => markSeen(str(b.chat)),
};

export async function GET(request: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action === "status") {
    return json(await status(request));
  }
  // Daily Vercel cron (backup to the GitHub keep-alive): wakes the bridge
  if (action === "keepalive") {
    try {
      return json(await bridgeHealth());
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 502);
    }
  }
  return run(request, `GET ${action}`, {});
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (isCrossSite(request)) {
    return json({ error: "forbidden" }, 403);
  }
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (action === "unlock") {
    return await unlock(str(body.code));
  }
  if (action === "lock") {
    const res = json({ ok: true });
    res.cookies.delete(WA_COOKIE);
    return res;
  }
  return run(request, `POST ${action}`, body);
}

async function unlock(code: string) {
  if (!isLocked()) {
    return json({ error: "access_code_missing" }, 503);
  }
  if (!codeMatches(code)) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: "wrong_code" }, 401);
  }
  const res = json({ ok: true });
  res.cookies.set(WA_COOKIE, await accessCookie(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: WA_COOKIE_MAX_AGE,
  });
  return res;
}

async function run(
  request: NextRequest,
  key: string,
  body: Record<string, unknown>
) {
  const handler = PROTECTED[key];
  if (!handler) {
    return json({ error: "not_found" }, 404);
  }
  if (!(await hasAccess(request))) {
    return json({ error: "locked" }, 401);
  }
  try {
    return json(await handler(body, request.nextUrl));
  } catch (e) {
    const status = e instanceof WhatsappError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
}
