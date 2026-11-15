import type { NextRequest } from "next/server";
import { FinderError, findBarcodes } from "@/lib/server/barcode-finder";
import { POS_SESSION_HEADER } from "@/lib/server/pos-session";
import { isCrossSite } from "@/lib/server/same-site";

/**
 * Looks up the barcodes of a few dispenser wines (POST { company, skus }).
 * The screen calls it batch after batch; the POS session in the header
 * decides what may be read and saved.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = request.headers.get(POS_SESSION_HEADER) ?? "";
  const body = (await request.json().catch(() => null)) as { company?: string; skus?: unknown } | null;
  const company = typeof body?.company === "string" ? body.company.slice(0, 40) : "";
  const skus = Array.isArray(body?.skus) ? body.skus.filter((s): s is string => typeof s === "string").slice(0, 5) : [];
  if (!(session && company && skus.length)) {
    return Response.json({ error: "Entre no POS com permissão de estoque." }, { status: 401 });
  }
  try {
    return Response.json(await findBarcodes({ session, company, skus }));
  } catch (error) {
    console.error("[inv/barcodes]", error);
    return Response.json(
      { error: error instanceof FinderError ? error.message : "A busca falhou. Tente de novo." },
      { status: error instanceof FinderError ? error.status : 500 }
    );
  }
}
