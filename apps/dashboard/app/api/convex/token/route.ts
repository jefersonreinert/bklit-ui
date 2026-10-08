import { type NextRequest, NextResponse } from "next/server";
import { panelAuthConfigured, signPanelToken } from "@/lib/server/panel-jwt";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** A Convex token for browsers that entered the panel's access code. */
export async function GET(request: NextRequest) {
  if (!panelAuthConfigured()) {
    return NextResponse.json(
      { error: "not_configured" },
      { status: 503, headers: noStore }
    );
  }
  if (!(await hasAccess(request))) {
    return NextResponse.json(
      { error: "locked" },
      { status: 401, headers: noStore }
    );
  }
  const signed = await signPanelToken("panel");
  return NextResponse.json(signed, { headers: noStore });
}
