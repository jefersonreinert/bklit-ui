import { type NextRequest, NextResponse } from "next/server";
import { createCheckout, sumupKey } from "@/lib/server/sumup";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

const CURRENCY = /^[A-Z]{3}$/;

/** Creates a SumUp hosted checkout (QR) for a POS order. */
export async function POST(request: NextRequest) {
  if (!sumupKey()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    amount?: number;
    currency?: string;
    reference?: string;
    description?: string;
  };
  const amount = Number(body.amount);
  const currency = String(body.currency ?? "");
  if (!(amount > 0 && amount < 100_000 && CURRENCY.test(currency))) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }
  try {
    const checkout = await createCheckout({
      amount,
      currency,
      reference:
        String(body.reference ?? "").slice(0, 90) || crypto.randomUUID(),
      description: String(body.description ?? "Casa Brasa").slice(0, 120),
    });
    return NextResponse.json(checkout);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na SumUp." },
      { status: 502 }
    );
  }
}

/** Whether the server has a SumUp key (the QR option shows only then). */
export function GET() {
  return NextResponse.json(
    { available: Boolean(sumupKey()) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
