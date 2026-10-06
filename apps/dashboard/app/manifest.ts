import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

/** Uploaded icon through the API; the static build has only the default. */
const icon = (size: number) =>
  process.env.STATIC_EXPORT === "1"
    ? `${base}/icons/icon-${size}.png`
    : `${base}/api/brand/icon/?size=${size}`;

/** Installable app: opened from the Home Screen it runs without Safari's bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casa Brasa — Gestão",
    short_name: "Casa Brasa",
    description:
      "Painel de gestão do restaurante com Assistente IA e modo voz.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#141413",
    theme_color: "#141413",
    lang: "pt-BR",
    icons: [
      {
        src: icon(192),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: icon(512),
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: icon(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
