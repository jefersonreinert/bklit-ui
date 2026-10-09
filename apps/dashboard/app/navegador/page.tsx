import { Suspense } from "react";
import { BrowserPage } from "@/components/pages/browser/browser-page";

export default function Page() {
  return (
    <Suspense>
      <BrowserPage />
    </Suspense>
  );
}
