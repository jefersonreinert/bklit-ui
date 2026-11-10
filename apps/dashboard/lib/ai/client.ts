"use client";

import { getSession } from "@/lib/pos/store";
import type {
  AiConfigView,
  AiLogEntry,
  RecognizeResponse,
} from "./providers-meta";

/**
 * Browser side of the AI routes. Keys never pass through here after they
 * are saved; requests carry the POS session so staff without the panel
 * code can use recognition on the phone.
 */

const headers = () => {
  const session = getSession();
  return {
    "content-type": "application/json",
    ...(session ? { "x-pos-session": session } : {}),
  };
};

export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export async function recognizeProduct(input: {
  requestId: string;
  image: string;
  barcode: string | null;
  categories: { name: string; subs: string[] }[];
}): Promise<RecognizeResponse> {
  try {
    const res = await fetch("/api/ai/recognize", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as RecognizeResponse | null;
    return (
      data ?? { ok: false, attempts: [], error: `Erro ${res.status} no servidor.` }
    );
  } catch {
    return { ok: false, attempts: [], error: "Sem conexão com o servidor." };
  }
}

export class AiApiError extends Error {
  readonly kind?: string;
  constructor(message: string, kind?: string) {
    super(message);
    this.kind = kind;
  }
}

async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch("/api/ai/providers", {
    ...init,
    headers: headers(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    kind?: string;
  };
  if (!res.ok) {
    throw new AiApiError(data.error ?? `Erro ${res.status}`, data.kind);
  }
  return data;
}

export const fetchAiConfig = () =>
  call<{ config: AiConfigView; log: AiLogEntry[] }>();

export const aiAction = <T = { config: AiConfigView }>(body: Record<string, unknown>) =>
  call<T>({ method: "POST", body: JSON.stringify(body) });
