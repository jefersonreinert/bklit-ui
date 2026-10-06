import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { WaBridgeStatus, WaChat, WaMessage } from "@/lib/whatsapp-types";
import { seal, unseal } from "./sealed-cookie";

/**
 * Client for the whatsapp-web.js bridge (services/whatsapp-bridge, hosted on
 * Render's free plan). Server-only: the bridge secret never reaches
 * the browser, and every route is locked behind WHATSAPP_ACCESS_CODE.
 */

export const WA_COOKIE = "cb_wa_access";
export const WA_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const TIMEOUT_MS = 25_000;
const TRAILING_SLASHES = /\/+$/;
const SPACES = /\s+/g;

export class WhatsappError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function whatsappConfig() {
  const url = process.env.WHATSAPP_BRIDGE_URL?.replace(TRAILING_SLASHES, "");
  const secret = process.env.WHATSAPP_BRIDGE_SECRET;
  return url && secret ? { url, secret } : null;
}

const accessCode = () => process.env.WHATSAPP_ACCESS_CODE?.trim() || null;

export const isLocked = () => Boolean(accessCode());

/** Compares the typed code with WHATSAPP_ACCESS_CODE (case/space-insensitive). */
export function codeMatches(typed: string) {
  const expected = accessCode();
  if (!expected) {
    return false;
  }
  const norm = (s: string) => Buffer.from(s.toLowerCase().replace(SPACES, ""));
  const a = norm(typed);
  const b = norm(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Access {
  ok: true;
  at: number;
}

export const accessCookie = () =>
  seal({ ok: true, at: Date.now() } satisfies Access);

/** True when this browser entered the access code. */
export async function hasAccess(request: NextRequest) {
  if (!isLocked()) {
    return false;
  }
  const access = await unseal<Access>(request.cookies.get(WA_COOKIE)?.value);
  return Boolean(access?.ok);
}

async function bridge<T>(path: string, init?: RequestInit): Promise<T> {
  const config = whatsappConfig();
  if (!config) {
    throw new WhatsappError("WhatsApp não configurado", 503);
  }
  const headers = {
    "x-bridge-secret": config.secret,
    "content-type": "application/json",
  };
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new WhatsappError("Servidor do WhatsApp fora do ar", 502);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new WhatsappError(data.error ?? `Erro ${res.status}`, res.status);
  }
  return data;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const bridgeHealth = () => bridge<{ ok: boolean }>("/health");
export const bridgeStatus = () => bridge<WaBridgeStatus>("/status");
export const pairPhone = (phone: string) =>
  bridge<{ code: string }>("/pair", post({ phone }));
export const logout = () => bridge<{ ok: boolean }>("/logout", post({}));
export const listChats = (limit = 40) =>
  bridge<{ chats: WaChat[] }>(`/chats?limit=${limit}`);
export const readChat = (chat: string, limit = 50) =>
  bridge<{ chat: WaChat; messages: WaMessage[] }>(
    `/messages?chat=${encodeURIComponent(chat)}&limit=${limit}`
  );
export const sendText = (chat: string, text: string) =>
  bridge<{ message: WaMessage }>("/send", post({ chat, text }));
export const markSeen = (chat: string) =>
  bridge<{ ok: boolean }>("/seen", post({ chat }));
