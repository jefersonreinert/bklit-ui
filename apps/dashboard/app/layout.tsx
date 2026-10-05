import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { ClientOnly } from "@/components/dashboard/client-only";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: "Casa Brasa — Dashboard",
    template: "%s · Casa Brasa",
  },
  description:
    "Dashboard de gestão do restaurante: finanças, recursos humanos, cardápio e documentos — construído com Bklit UI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable)}
      lang="pt-BR"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body className="relative isolate">
        <ThemeProvider attribute="class" forcedTheme="dark">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none fixed inset-0 -z-10"
          />
          <div className="relative flex min-h-dvh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
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
