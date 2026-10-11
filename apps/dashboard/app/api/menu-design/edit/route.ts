import type { NextRequest } from "next/server";
import { ExtractError, editDesign } from "@/lib/server/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ELEMENTS = 600;
const MAX_JSON = 400_000;

/**
 * POST { width, height, background, elements, instruction } → the page's
 * new elements after applying the instruction (typed or dictated).
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > MAX_JSON) {
    return Response.json(
      { error: "Página grande demais para editar com IA." },
      { status: 413 }
    );
  }
  let body: {
    width?: number;
    height?: number;
    background?: string;
    elements?: unknown[];
    instruction?: string;
  } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (
    !(body && instruction && Array.isArray(body.elements)) ||
    body.elements.length > MAX_ELEMENTS
  ) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  try {
    const result = await editDesign({
      width: Number(body.width) || 794,
      height: Number(body.height) || 1123,
      background: String(body.background ?? "#ffffff"),
      elements: body.elements,
      instruction: instruction.slice(0, 2000),
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof ExtractError ? error.status : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha na edição." },
      { status }
    );
  }
}
