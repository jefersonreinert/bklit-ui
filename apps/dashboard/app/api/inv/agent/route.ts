import type { NextRequest } from "next/server";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentError, runInvoiceAgent } from "@/lib/server/invoice-agent";
import { POS_SESSION_HEADER } from "@/lib/server/pos-session";
import { isCrossSite } from "@/lib/server/same-site";

/**
 * Runs the invoice agent on one invoice (POST { id }). The POS session in
 * the header is the reviewer's: the agent reads and writes with exactly
 * their permissions, and only on that invoice.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ID = /^[a-z0-9]{20,40}$/;

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = request.headers.get(POS_SESSION_HEADER) ?? "";
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = typeof body?.id === "string" && ID.test(body.id) ? body.id : "";
  if (!(session && id)) {
    return Response.json({ error: "Entre no POS com permissão de estoque." }, { status: 401 });
  }
  try {
    const review = await runInvoiceAgent({ session, invoiceId: id as Id<"invInvoices"> });
    return Response.json(review);
  } catch (error) {
    console.error("[inv/agent]", error);
    const status = error instanceof AgentError ? error.status : 500;
    return Response.json(
      { error: error instanceof AgentError ? error.message : "O agente falhou. Tente de novo." },
      { status }
    );
  }
}
