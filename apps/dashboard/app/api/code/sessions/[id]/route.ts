import type { NextRequest } from "next/server";
import { parseImages } from "@/lib/server/code-input";
import { guarded } from "@/lib/server/code-route";
import {
  archiveSession,
  confirmTool,
  deleteSession,
  getSession,
  interrupt,
  isMode,
  renameSession,
  sendMessage,
  setMode,
} from "@/lib/server/code-sessions";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}
type Body = Record<string, unknown>;
type Client = Parameters<typeof getSession>[0];

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const ACTIONS: Record<
  string,
  (c: Client, id: string, b: Body) => Promise<void>
> = {
  message: (c, id, b) => {
    const images = parseImages(b.images);
    const t = text(b.text) || (images.length ? "Veja a imagem." : "");
    if (!t) {
      throw new Error("Mensagem vazia.");
    }
    return sendMessage(c, id, t.slice(0, 20_000), images);
  },
  interrupt: (c, id) => interrupt(c, id),
  confirm: (c, id, b) => {
    if (typeof b.toolUseId !== "string") {
      throw new Error("Ação inválida.");
    }
    return confirmTool(c, id, b.toolUseId, b.allow === true);
  },
  mode: (c, id, b) => {
    if (!isMode(b.mode)) {
      throw new Error("Modo inválido.");
    }
    return setMode(c, id, b.mode);
  },
  rename: (c, id, b) => {
    const t = text(b.title);
    if (!t) {
      throw new Error("Título vazio.");
    }
    return renameSession(c, id, t.slice(0, 200));
  },
  archive: (c, id) => archiveSession(c, id),
  delete: (c, id) => deleteSession(c, id),
};

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return guarded(request, ({ client }) => getSession(client, id));
}

/** message | interrupt | confirm | mode | rename | archive | delete */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  return guarded(request, async ({ client }) => {
    const action = ACTIONS[String(body.action)];
    if (!action) {
      throw new Error("Ação inválida.");
    }
    await action(client, id, body);
    return { ok: true };
  });
}
