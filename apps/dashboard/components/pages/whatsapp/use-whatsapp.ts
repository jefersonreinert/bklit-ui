"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/use-connectors";
import type { WaChat, WaMessage, WaStatus } from "@/lib/whatsapp-types";

const API = `${BASE_PATH}/api/whatsapp`;
const STATUS_MS = 5000;
const CHATS_MS = 12_000;
const MESSAGES_MS = 4000;

async function call<T>(
  path: string,
  body?: unknown
): Promise<
  { ok: true; data: T } | { ok: false; error: string; status: number }
> {
  try {
    const res = await fetch(`${API}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok
      ? { ok: true, data }
      : {
          ok: false,
          error: data.error ?? `Erro ${res.status}`,
          status: res.status,
        };
  } catch {
    return { ok: false, error: "Sem conexão", status: 0 };
  }
}

/** Polls only while the page is visible. */
function usePoll(fn: () => void, ms: number, enabled: boolean) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    saved.current();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        saved.current();
      }
    }, ms);
    return () => clearInterval(timer);
  }, [ms, enabled]);
}

export function useWhatsapp() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [chats, setChats] = useState<WaChat[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const r = await call<WaStatus>("status/");
    if (r.ok) {
      setStatus(r.data);
    } else if (r.status === 404) {
      // Static build: no server routes
      setStatus({
        configured: false,
        locked: false,
        unlocked: false,
        bridge: null,
      });
    }
  }, []);

  const ready = status?.bridge?.state === "ready";

  const refreshChats = useCallback(async () => {
    const r = await call<{ chats: WaChat[] }>("chats/");
    if (r.ok) {
      setChats(r.data.chats);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!openId) {
      return;
    }
    const r = await call<{ messages: WaMessage[] }>(
      `messages/?chat=${encodeURIComponent(openId)}`
    );
    if (r.ok) {
      setMessages(r.data.messages);
    }
  }, [openId]);

  usePoll(refreshStatus, STATUS_MS, true);
  usePoll(refreshChats, CHATS_MS, ready);
  usePoll(refreshMessages, MESSAGES_MS, ready && Boolean(openId));

  const unlock = async (code: string) => {
    setError(null);
    const r = await call("unlock/", { code });
    if (!r.ok) {
      setError(r.error === "wrong_code" ? "Código incorreto." : r.error);
      return false;
    }
    await refreshStatus();
    return true;
  };

  const pair = async (phone: string) => {
    setError(null);
    const r = await call<{ code: string }>("pair/", { phone });
    if (!r.ok) {
      setError(
        r.error === "invalid phone"
          ? "Número inválido. Use DDI + DDD + número, ex.: 5511999998888."
          : r.error
      );
      return null;
    }
    await refreshStatus();
    return r.data.code;
  };

  const open = async (id: string | null) => {
    setOpenId(id);
    setMessages(null);
    if (id) {
      await call("seen/", { chat: id });
      setChats((list) =>
        list ? list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) : list
      );
    }
  };

  const send = async (text: string) => {
    if (!openId) {
      return false;
    }
    setError(null);
    const r = await call<{ message: WaMessage }>("send/", {
      chat: openId,
      text,
    });
    if (!r.ok) {
      setError(`Não foi possível enviar: ${r.error}`);
      return false;
    }
    setMessages((list) => [...(list ?? []), r.data.message]);
    refreshChats();
    return true;
  };

  const logout = async () => {
    await call("logout/", {});
    setChats(null);
    setOpenId(null);
    await refreshStatus();
  };

  return {
    status,
    chats,
    openId,
    messages,
    error,
    setError,
    unlock,
    pair,
    open,
    send,
    logout,
  };
}
