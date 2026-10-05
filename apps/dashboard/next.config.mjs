/**
 * Static export for GitHub Pages.
 * `NEXT_PUBLIC_BASE_PATH` is set by the Pages workflow (e.g. `/bklit-ui`).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
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
