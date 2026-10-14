import { type NextRequest, NextResponse } from "next/server";
import { panelAuthConfigured, panelIssuer } from "@/lib/server/panel-jwt";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Why the database may refuse this address after the access code: shows
 * whether the panel can sign its token here and which issuer it signs as.
 * Nothing secret (the issuer is a public URL; Convex reads the same value).
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      configured: panelAuthConfigured(),
      issuer: panelIssuer(),
      unlocked: await hasAccess(request),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
