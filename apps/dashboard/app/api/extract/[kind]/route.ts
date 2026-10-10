import type { NextRequest } from "next/server";
import {
  ExtractError,
  type ExtractFile,
  extractInvoice,
  extractMenu,
} from "@/lib/server/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** ~24 MB of base64 in total (the API takes 32 MB per request). */
const MAX_BASE64 = 24_000_000;
const MAX_FILES = 12;

/** POST /api/extract/menu|invoice { files: [{ data, mimeType }], hint? } */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { kind } = await params;
  if (kind !== "menu" && kind !== "invoice") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    files?: ExtractFile[];
    hint?: string;
  } | null;
  const files = body?.files?.filter(
    (f) => typeof f?.data === "string" && typeof f?.mimeType === "string"
  );
  if (!files?.length) {
    return Response.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (
    files.length > MAX_FILES ||
    files.reduce((n, f) => n + f.data.length, 0) > MAX_BASE64
  ) {
    return Response.json(
      { error: "Arquivos grandes demais; envie menos páginas por vez." },
      { status: 413 }
    );
  }
  const hint = typeof body?.hint === "string" ? body.hint.slice(0, 2000) : "";
  try {
    const result =
      kind === "menu"
        ? await extractMenu(files, hint)
        : await extractInvoice(files, hint);
    return Response.json(result);
  } catch (error) {
    const status = error instanceof ExtractError ? error.status : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha na leitura." },
      { status }
    );
  }
}
