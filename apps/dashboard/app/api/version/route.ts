export const dynamic = "force-dynamic";

/** Commit of the live deployment; the app reloads when it differs from its own. */
export function GET() {
  return Response.json(
    // Inlined at build time (Vercel or the Cloudflare GitHub Actions build)
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
