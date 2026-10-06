/**
 * Default build (Vercel) is a regular Next.js app so `/api/chat` can run.
 * `STATIC_EXPORT=1` (GitHub Pages workflow) produces a static `out/` instead;
 * that build has no server, so the AI page falls back to demo mode.
 * `NEXT_PUBLIC_BASE_PATH` is set by the Pages workflow (e.g. `/bklit-ui`).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const staticExport = process.env.STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(staticExport ? { output: "export" } : {}),
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  transpilePackages: ["@bklitui/ui", "@bklitui/icons", "geist"],
  experimental: {
    optimizePackageImports: ["@bklitui/ui/charts"],
  },
};

export default nextConfig;
