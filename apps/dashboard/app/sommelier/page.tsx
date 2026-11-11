import type { Metadata, Viewport } from "next";
import { SommelierGuest } from "@/components/pages/sommelier/sommelier-guest";

export const metadata: Metadata = {
  title: "AI Sommelier",
  description: "Ask our sommelier about the wines: tasting notes, pairings and stories.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c0a10",
  viewportFit: "cover",
};

export default function Page() {
  return <SommelierGuest />;
}
