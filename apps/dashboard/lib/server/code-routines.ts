import type { NextRequest } from "next/server";
import { seal, unseal } from "./sealed-cookie";

/**
 * Claude Code on the web through the person's own claude.ai subscription:
 * a routine created at claude.ai/code/routines with an API trigger starts a
 * real cloud session when fired (no API credits). The routine id and its
 * token are kept encrypted in an httpOnly cookie on this browser.
 */

export const ROUTINES_COOKIE = "cb_cc_routines";
const MAX_AGE = 60 * 60 * 24 * 365;
const MAX_ROUTINES = 8;
const FIRE_URL = /\/v1\/claude_code\/routines\/(trig_[A-Za-z0-9]+)\/fire\/?$/;
const TOKEN = /^sk-ant-oat01-[A-Za-z0-9_-]{20,}$/;

export interface Routine {
  id: string;
  name: string;
  token: string;
  addedAt: number;
}

const apiBase = () =>
  process.env.ROUTINES_API_BASE ?? "https://api.anthropic.com";

export async function readRoutines(request: NextRequest) {
  return (
    (await unseal<Routine[]>(request.cookies.get(ROUTINES_COOKIE)?.value)) ?? []
  );
}

export async function sealRoutines(list: Routine[]) {
  return { value: await seal(list.slice(0, MAX_ROUTINES)), maxAge: MAX_AGE };
}

/** The routine id from the URL the API-trigger modal shows. */
export function routineIdFromUrl(url: string) {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "api.anthropic.com") {
      return null;
    }
    return FIRE_URL.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const isRoutineToken = (token: string) => TOKEN.test(token.trim());

const ERRORS: Record<number, string> = {
  400: "A rotina está pausada ou o texto é grande demais. Confira em claude.ai/code/routines.",
  401: "Token da rotina inválido. Gere um novo em claude.ai/code/routines (API → Generate token).",
  403: "Sua conta não tem acesso às rotinas do Claude Code (plano Pro, Max, Team ou Enterprise).",
  404: "Rotina não encontrada. Confira a URL em claude.ai/code/routines.",
  429: "Limite de disparos por hora atingido (30 por rotina, 100 por conta). Tente mais tarde.",
};

export async function fireRoutine(routine: Routine, text: string) {
  const res = await fetch(
    `${apiBase()}/v1/claude_code/routines/${routine.id}/fire`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${routine.token}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 65_536) }),
      cache: "no-store",
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    claude_code_session_id?: string;
    claude_code_session_url?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.claude_code_session_url)) {
    throw new Error(
      ERRORS[res.status] ??
        data.error?.message ??
        `O Claude Code respondeu com erro ${res.status}.`
    );
  }
  return {
    sessionId: data.claude_code_session_id ?? "",
    url: data.claude_code_session_url,
  };
}
