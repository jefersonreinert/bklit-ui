import type { Metadata } from "next";
import { SignPage } from "@/components/pages/hr/sign-page";

export const metadata: Metadata = {
  title: "Sign your contract",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SignPage />;
}
