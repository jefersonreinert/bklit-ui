export const dynamic = "force-dynamic";

/** Commit of the live deployment; the app reloads when it differs from its own. */
export function GET() {
  return Response.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
