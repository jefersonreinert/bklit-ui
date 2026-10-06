import { type NextRequest, NextResponse } from "next/server";
import {
  googleConfig,
  readGoogleConnection,
} from "@/lib/server/google-connector";
import { readConnection } from "@/lib/server/notion-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";

export const dynamic = "force-dynamic";

/** Which connectors this browser has linked (never returns tokens). */
export async function GET(request: NextRequest) {
  const configured = Boolean(connectorsSecret());
  const notion = configured ? await readConnection(request) : null;
  const google = configured ? await readGoogleConnection(request) : null;
  return NextResponse.json(
    {
      configured,
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
      notion: notion
        ? { connected: true, connectedAt: notion.connectedAt }
        : { connected: false },
      google: {
        available: Boolean(googleConfig()),
        connected: Boolean(google),
        ...(google
          ? { email: google.email, connectedAt: google.connectedAt }
          : {}),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
