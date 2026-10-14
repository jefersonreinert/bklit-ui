import { type NextRequest, NextResponse } from "next/server";
import { canCharge } from "@/lib/server/pos-session";
import { checkoutStatus } from "@/lib/server/sumup";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canCharge(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const { id } = await params;
  try {
    return NextResponse.json(await checkoutStatus(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na SumUp." },
      { status: 502 }
    );
  }
}
