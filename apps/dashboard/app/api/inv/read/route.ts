import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { ExtractError, type ExtractFile, extractInvoice } from "@/lib/server/extract";
import { convexUrl } from "@/lib/server/panel-jwt";
import { POS_SESSION_HEADER } from "@/lib/server/pos-session";
import { isCrossSite } from "@/lib/server/same-site";

/**
 * Reads a supplier invoice (photos or a PDF) with AI for the stock
 * screens. Only a POS user allowed to handle stock in that business may
 * spend AI on it (the session travels in a header).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BASE64 = 24_000_000;
const MAX_FILES = 8;
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    company?: string;
    files?: ExtractFile[];
  } | null;
  const session = request.headers.get(POS_SESSION_HEADER) ?? "";
  const company = typeof body?.company === "string" ? body.company.slice(0, 40) : "";
  const url = convexUrl();
  const allowed =
    session && company && url
      ? await new ConvexHttpClient(url)
          .query(api.invoices.canRead, { session, company })
          .catch(() => false)
      : false;
  if (!allowed) {
    return Response.json({ error: "Entre no POS com permissão de estoque." }, { status: 401 });
  }
  const files = body?.files?.filter(
    (f) => typeof f?.data === "string" && TYPES.has(f?.mimeType)
  );
  if (!files?.length) {
    return Response.json({ error: "Envie uma foto ou PDF do invoice." }, { status: 400 });
  }
  if (files.length > MAX_FILES || files.reduce((n, f) => n + f.data.length, 0) > MAX_BASE64) {
    return Response.json({ error: "Arquivo grande demais: envie menos páginas." }, { status: 413 });
  }
  try {
    return Response.json(await extractInvoice(files, ""));
  } catch (error) {
    console.error("[inv/read]", error);
    return Response.json(
      { error: error instanceof ExtractError ? error.message : "Não consegui ler o invoice." },
      { status: error instanceof ExtractError ? error.status : 500 }
    );
  }
}
