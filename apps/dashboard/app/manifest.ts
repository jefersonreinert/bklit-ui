import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

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
        src: `${base}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${base}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `${base}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
