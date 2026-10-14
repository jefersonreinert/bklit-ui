"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { InvoicesPage } from "../invoices/invoices-page";
import { Notice, TelegramProvider } from "../telegram/telegram-shared";
import { FilesBrowser } from "./files-browser";

/** Documentos: personal files (folders, uploads, scans) and invoices. */

type Tab = "files" | "invoices";

function Files() {
  return (
    <TelegramProvider
      fallback={
        <Notice>
          Os arquivos usam o banco central do painel (Convex), que não está
          configurado nesta instalação.
        </Notice>
      }
    >
      <FilesBrowserOrLock />
    </TelegramProvider>
  );
}

function FilesBrowserOrLock() {
  const listing = useQuery(api.files.list, {});
  if (listing === null) {
    return <PanelUnlock what="ver e guardar os seus arquivos" />;
  }
  return <FilesBrowser />;
}

export function DocumentsPage() {
  const [tab, setTab] = useState<Tab>("files");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Tabs onValueChange={(v) => setTab(v as Tab)} value={tab}>
        <TabsList>
          <TabsTrigger value="files">Arquivos</TabsTrigger>
          <TabsTrigger value="invoices">Notas fiscais</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "files" ? <Files /> : <InvoicesPage />}
    </div>
  );
}
