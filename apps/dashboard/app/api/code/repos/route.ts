import type { NextRequest } from "next/server";
import { isRepoName, listBranches, listRepos } from "@/lib/server/code-github";
import { guarded } from "@/lib/server/code-route";

export const dynamic = "force-dynamic";

/** The GitHub repositories the token can reach, or one repo's branches. */
export function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("branches");
  return guarded(request, ({ githubToken }) => {
    if (!githubToken) {
      throw new Error("Conecte o GitHub em Conectores primeiro.");
    }
    if (repo) {
      if (!isRepoName(repo)) {
        throw new Error("Repositório inválido.");
      }
      return listBranches(githubToken, repo);
    }
    return listRepos(githubToken);
  });
}
