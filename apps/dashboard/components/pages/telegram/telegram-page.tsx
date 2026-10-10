"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TG_TOOLS } from "@/lib/telegram/catalog";
import { TelegramChats, TelegramSearch } from "./telegram-chats";
import { TelegramGallery } from "./telegram-gallery";
import {
  BASE_PATH,
  Notice,
  TelegramProvider,
  useTelegramStatus,
} from "./telegram-shared";
import { ToolExplorer } from "./tool-explorer";

type Tab = "chats" | "search" | "gallery" | "tools";

const TABS: { value: Tab; label: string }[] = [
  { value: "chats", label: "Conversas" },
  { value: "search", label: "Buscar" },
  { value: "gallery", label: "Galeria" },
  { value: "tools", label: `Ferramentas (${TG_TOOLS.length - 2})` },
];

function NotConnected({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice>{text}</Notice>
      <Button
        nativeButton={false}
        render={<a href={`${BASE_PATH}/conectores/`} />}
        size="sm"
      >
        Ir para Conectores
      </Button>
    </div>
  );
}

const NOT_CONNECTED =
  "O Telegram ainda não está conectado. Entre com QR code ou com o número em Conectores → Telegram.";

function Workspace() {
  const status = useTelegramStatus();
  const [tab, setTab] = useState<Tab>("chats");
  const [galleryChat, setGalleryChat] = useState<string | undefined>();
  if (status === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (status === null) {
    return (
      <Notice>
        Desbloqueie o painel com o código de acesso (WhatsApp, POS ou Code) para
        usar o Telegram.
      </Notice>
    );
  }
  const live = (body: React.ReactNode) =>
    status.connected ? body : <NotConnected text={NOT_CONNECTED} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          onValueChange={(v) => {
            setGalleryChat(undefined);
            setTab(v as Tab);
          }}
          value={tab}
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-muted-foreground text-xs">
          {status.me?.name}
          {status.me?.username ? ` · @${status.me.username}` : ""}
        </p>
      </div>
      {tab === "chats"
        ? live(
            <TelegramChats
              me={status.me?.name ?? null}
              onOpenGallery={(chatId) => {
                setGalleryChat(chatId);
                setTab("gallery");
              }}
            />
          )
        : null}
      {tab === "search" ? live(<TelegramSearch />) : null}
      {tab === "gallery" ? (
        <TelegramGallery
          initialChatId={galleryChat}
          key={galleryChat ?? "all"}
        />
      ) : null}
      {tab === "tools" ? live(<ToolExplorer optIn={status.optIn} />) : null}
    </div>
  );
}

export function TelegramPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <TelegramProvider
        fallback={
          <Notice>
            O Telegram usa o banco central do painel (Convex), que não está
            configurado nesta instalação.
          </Notice>
        }
      >
        <Workspace />
      </TelegramProvider>
    </div>
  );
}
