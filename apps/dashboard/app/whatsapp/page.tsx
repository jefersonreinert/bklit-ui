import type { Metadata } from "next";
import { WhatsappPage } from "@/components/pages/whatsapp/whatsapp-page";

export const metadata: Metadata = { title: "WhatsApp" };

export default function Page() {
  return <WhatsappPage />;
}
