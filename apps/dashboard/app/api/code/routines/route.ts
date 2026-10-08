import { type NextRequest, NextResponse } from "next/server";
import {
  fireRoutine,
  isRoutineToken,
  ROUTINES_COOKIE,
  readRoutines,
  routineIdFromUrl,
  sealRoutines,
} from "@/lib/server/code-routines";
import { cookieOptions } from "@/lib/server/notion-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Routines saved on this browser (tokens never leave the server). */
export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return json({ error: "locked" }, 401);
  }
  const list = await readRoutines(request);
  return json(list.map(({ id, name, addedAt }) => ({ id, name, addedAt })));
}

/** add | remove | fire */
export async function POST(request: NextRequest) {
  if (!connectorsSecret()) {
    return json({ error: "Conectores não configurados no servidor." }, 503);
  }
  if (!(await hasAccess(request))) {
    return json({ error: "locked" }, 401);
  }
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const list = await readRoutines(request);
  const action = str(body.action);

  if (action === "fire") {
    const routine = list.find((r) => r.id === str(body.id));
    const text = str(body.text);
    if (!(routine && text)) {
      return json({ error: "Escolha a rotina e descreva a tarefa." }, 400);
    }
    try {
      return json(await fireRoutine(routine, text));
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Falhou." },
        502
      );
    }
  }

  let next = list;
  if (action === "add") {
    const id = routineIdFromUrl(str(body.url));
    const token = str(body.token);
    if (!id) {
      return json(
        {
          error:
            "Cole a URL da API da rotina (https://api.anthropic.com/v1/claude_code/routines/trig_…/fire).",
        },
        400
      );
    }
    if (!isRoutineToken(token)) {
      return json(
        { error: "O token da rotina começa com sk-ant-oat01-." },
        400
      );
    }
    next = [
      ...list.filter((r) => r.id !== id),
      { id, token, name: str(body.name) || "Claude Code", addedAt: Date.now() },
    ];
  } else if (action === "remove") {
    next = list.filter((r) => r.id !== str(body.id));
  } else {
    return json({ error: "Ação inválida." }, 400);
  }
  const sealed = await sealRoutines(next);
  const res = json(
    next.map(({ id, name, addedAt }) => ({ id, name, addedAt }))
  );
  res.cookies.set(
    ROUTINES_COOKIE,
    sealed.value,
    cookieOptions(request, sealed.maxAge)
  );
  return res;
}
