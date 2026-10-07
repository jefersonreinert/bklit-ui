import { type NextRequest, NextResponse } from "next/server";
import { checkoutStatus } from "@/lib/server/sumup";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAccess(request))) {
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
