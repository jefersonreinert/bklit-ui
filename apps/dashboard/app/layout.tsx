import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { ClientOnly } from "@/components/dashboard/client-only";
import { InstallHint } from "@/components/dashboard/install-hint";
import { UpdateChecker } from "@/components/dashboard/update-checker";
import { ThemeProvider } from "@/components/theme-provider";
import { PreferencesBoot } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: {
    default: "Casa Brasa — Dashboard",
    template: "%s · Casa Brasa",
  },
  description:
    "Dashboard de gestão do restaurante: finanças, recursos humanos, cardápio e documentos — construído com Bklit UI.",
  // Home Screen app: full screen, no Safari toolbars
  appleWebApp: {
    capable: true,
    title: "Casa Brasa",
    statusBarStyle: "black-translucent",
  },
  // The API serves the icon uploaded in Configurações (static build: default)
  icons: {
    apple:
      process.env.STATIC_EXPORT === "1"
        ? `${base}/icons/icon-180.png`
        : `${base}/api/brand/icon/?size=180`,
  },
  formatDetection: { telephone: false },
  // Older iOS versions still look for Apple's original tag
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141413",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable)}
      lang="pt-BR"
      suppressHydrationWarning
    >
      <body className="relative isolate">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={["dark", "beige", "light"]}
        >
          <PreferencesBoot />
          <UpdateChecker />
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none fixed inset-0 -z-10"
          />
          <div className="relative flex min-h-dvh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
              <InstallHint />
              <AppHeader />
              <main className="flex-1 p-4 md:p-6">
                <ClientOnly>{children}</ClientOnly>
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
