import { type NextRequest, NextResponse } from "next/server";
import { readGithubConnection } from "@/lib/server/github-connector";
import {
  googleConfig,
  hasScope,
  hasYoutube,
  readGoogleConnection,
  YOUTUBE_MANAGE_SCOPE,
} from "@/lib/server/google-connector";
import { readConnection } from "@/lib/server/notion-connector";
import { panelAuthConfigured } from "@/lib/server/panel-jwt";
import { connectorsSecret } from "@/lib/server/sealed-cookie";
import { telegramSummary } from "@/lib/server/telegram-tools";
import { geminiKey } from "@/lib/server/transcript";
import { hasAccess, whatsappConfig } from "@/lib/server/whatsapp";
import { youtubeKey } from "@/lib/server/youtube";

export const dynamic = "force-dynamic";

/** Which connectors this browser has linked (never returns tokens). */
export async function GET(request: NextRequest) {
  const configured = Boolean(connectorsSecret());
  const notion = configured ? await readConnection(request) : null;
  const google = configured ? await readGoogleConnection(request) : null;
  const github = configured ? await readGithubConnection(request) : null;
  const unlocked = await hasAccess(request);
  const telegram =
    unlocked && panelAuthConfigured() ? await telegramSummary() : null;
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
        youtube: hasYoutube(google),
        youtubeManage: hasScope(google, YOUTUBE_MANAGE_SCOPE),
      },
      github: github
        ? {
            connected: true,
            login: github.login,
            connectedAt: github.connectedAt,
          }
        : { connected: false },
      youtube: {
        available: Boolean(youtubeKey()),
        transcripts: Boolean(geminiKey()),
      },
      whatsapp: {
        available: Boolean(whatsappConfig()),
        unlocked,
      },
      telegram: {
        available: panelAuthConfigured(),
        unlocked,
        connected: Boolean(telegram?.connected),
        ...(telegram?.name ? { name: telegram.name } : {}),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
