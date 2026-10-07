import { type NextRequest, NextResponse } from "next/server";
import {
  checkGithubToken,
  GITHUB_COOKIE,
  sealGithubConnection,
} from "@/lib/server/github-connector";
import { cookieOptions } from "@/lib/server/notion-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";

export const dynamic = "force-dynamic";

const TOKEN = /^(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/;

/** Saves a GitHub personal access token for this browser (encrypted). */
export async function POST(request: NextRequest) {
  if (!connectorsSecret()) {
    return NextResponse.json(
      { error: "Conectores não configurados no servidor." },
      { status: 503 }
    );
  }
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim() ?? "";
  if (!TOKEN.test(token)) {
    return NextResponse.json(
      {
        error:
          "Isso não parece um token do GitHub (começa com github_pat_ ou ghp_).",
      },
      { status: 400 }
    );
  }
  const check = await checkGithubToken(token);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const sealed = await sealGithubConnection({
    token,
    login: check.login,
    name: check.name,
    connectedAt: Date.now(),
  });
  const res = NextResponse.json({ ok: true, login: check.login });
  res.cookies.set(
    GITHUB_COOKIE,
    sealed.value,
    cookieOptions(request, sealed.maxAge)
  );
  return res;
}
