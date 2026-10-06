"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ServiceLogo } from "@/components/dashboard/service-logos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WaChat, WaMessage } from "@/lib/whatsapp-types";
import { MessageMedia } from "./media";
import { useWhatsapp } from "./use-whatsapp";
import { WaComposer } from "./wa-composer";

type Wa = ReturnType<typeof useWhatsapp>;

const time = (seconds: number) => {
  const d = new Date(seconds * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

function Panel({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pt-2 md:pt-8">
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm">
            <ServiceLogo brand="whatsapp" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        {children ? (
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function Problem({ text }: { text: string | null }) {
  return text ? <p className="text-destructive text-sm">{text}</p> : null;
}

function Unlock({ wa }: { wa: Wa }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await wa.unlock(code);
    setBusy(false);
  };
  return (
    <Panel
      description="Suas conversas ficam protegidas. Digite o código de acesso uma vez neste aparelho."
      title="Desbloquear WhatsApp"
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Input
          aria-label="Código de acesso"
          autoCapitalize="none"
          autoComplete="one-time-code"
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código de acesso"
          value={code}
        />
        <Problem text={wa.error} />
        <Button disabled={busy || !code.trim()} type="submit">
          {busy ? "Verificando…" : "Desbloquear"}
        </Button>
      </form>
    </Panel>
  );
}

/** "Gerado agora · vale por ~3 min" style hint for the pairing code. */
function pairingAge(at: number | null | undefined) {
  if (!at) {
    return "Vale por cerca de 3 minutos.";
  }
  const min = Math.floor((Date.now() - at) / 60_000);
  const left = Math.max(0, 3 - min);
  return min < 1
    ? "Gerado agora · vale por cerca de 3 minutos."
    : `Gerado há ${min} min · ${left > 0 ? `vale por mais ~${left} min.` : "pode ter expirado."}`;
}

const PAIR_STEPS: string[] = [
  "Abra o WhatsApp no iPhone",
  "Toque em Configurações → Aparelhos conectados → Conectar um aparelho",
  "Toque em “Conectar com número de telefone”",
  "Digite este código",
];

function Pair({ wa, onBack }: { wa: Wa; onBack?: () => void }) {
  const [phone, setPhone] = useState("55");
  const [busy, setBusy] = useState(false);
  const code = wa.status?.bridge?.pairingCode ?? null;
  const blockedAt = wa.status?.bridge?.pairingBlockedAt;
  const blocked = Boolean(blockedAt && Date.now() - blockedAt < 60 * 60_000);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await wa.pair(phone);
    setBusy(false);
  };
  return (
    <Panel
      description="Conecte seu WhatsApp como um aparelho conectado (como o WhatsApp Web). Você continua usando o WhatsApp normalmente no iPhone."
      title="Conectar WhatsApp"
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="wa-phone">
          <span className="font-medium">Seu número com DDI e DDD</span>
          <Input
            id="wa-phone"
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999998888"
            value={phone}
          />
        </label>
        <Problem text={wa.error} />
        {blocked ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            O WhatsApp bloqueou novos códigos temporariamente porque houve
            muitas tentativas seguidas. Espere cerca de 1 hora e gere um código
            só uma vez, digitando-o logo em seguida.
          </p>
        ) : null}
        <Button disabled={busy} type="submit">
          {busy ? "Gerando código…" : "Gerar código de conexão"}
        </Button>
        {onBack ? (
          <Button onClick={onBack} type="button" variant="ghost">
            Ver conversas salvas
          </Button>
        ) : null}
      </form>
      {code ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
          <p className="text-center font-mono font-semibold text-3xl tracking-[0.3em]">
            {code.slice(0, 4)}-{code.slice(4)}
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground text-sm">
            {PAIR_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">
            {pairingAge(wa.status?.bridge?.pairingAt)} Se o WhatsApp disser “Não
            foi possível conectar”, gere um código novo e digite logo em
            seguida.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

const PREVIEW: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Vídeo",
  audio: "🎵 Áudio",
  ptt: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
  vcard: "👤 Contato",
  revoked: "Mensagem apagada",
};

function ChatRow({
  chat,
  active,
  onOpen,
}: {
  chat: WaChat;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-(--chat-out)/50",
        active && "bg-(--chat-out)"
      )}
      onClick={onOpen}
      type="button"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--chat-out) font-medium text-(--chat-out-foreground) text-sm">
        {chat.isGroup ? (
          <Icon className="size-4" name="IconPeople" />
        ) : (
          (chat.name[0] ?? "?").toUpperCase()
        )}
        {chat.avatarUrl ? (
          // biome-ignore lint/performance/noImgElement: signed archive URL
          <img
            alt=""
            className="absolute inset-0 size-full object-cover"
            height={40}
            loading="lazy"
            src={chat.avatarUrl}
            width={40}
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="flex-1 truncate font-medium text-sm">
            {chat.name}
          </span>
          <span
            className={cn(
              "shrink-0 text-xs",
              chat.unread ? "text-(--chat-accent)" : "text-muted-foreground"
            )}
          >
            {chat.timestamp ? time(chat.timestamp) : ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="flex-1 truncate text-muted-foreground text-xs">
            {chat.last?.fromMe ? "Você: " : ""}
            {chat.last?.body ||
              (chat.last ? (PREVIEW[chat.last.type] ?? "Mensagem") : "")}
          </span>
          {chat.unread ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--chat-accent) px-1.5 font-semibold text-(--chat-accent-foreground) text-[11px]">
              {chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

const NO_TEXT_TYPES: Record<string, string> = {
  location: "📍 Localização",
  vcard: "👤 Contato",
  multi_vcard: "👥 Contatos",
  call_log: "📞 Chamada",
  revoked: "🚫 Mensagem apagada",
  poll_creation: "📊 Enquete",
};

function Bubble({ m, group }: { m: WaMessage; group: boolean }) {
  const label = m.hasMedia ? "" : (NO_TEXT_TYPES[m.type] ?? "");
  const text = m.body || label;
  return (
    <div className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1.5 whitespace-pre-wrap break-words rounded-2xl px-2 py-1.5 text-sm",
          m.fromMe
            ? "rounded-br-md bg-(--chat-out) text-(--chat-out-foreground)"
            : "rounded-bl-md border bg-(--chat-in)"
        )}
      >
        {group && !m.fromMe && m.author ? (
          <p className="px-1 font-medium text-(--chat-name) text-xs">
            {m.author.split("@")[0]}
          </p>
        ) : null}
        <MessageMedia m={m} />
        <p className="px-1">
          {text}
          <span
            className={cn(
              "ml-2 align-bottom text-[10px]",
              m.fromMe ? "text-(--chat-out-muted)" : "text-muted-foreground"
            )}
          >
            {time(m.timestamp)}
          </span>
        </p>
      </div>
    </div>
  );
}

function ChatView({ wa, chat }: { wa: Wa; chat: WaChat | undefined }) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = wa.messages?.at(-1)?.id;

  // Follow new messages, not older pages loaded at the top
  useEffect(() => {
    if (lastId) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }
  }, [lastId]);

  const hasMore = (wa.messages?.length ?? 0) >= wa.limit;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          aria-label="Voltar às conversas"
          className="md:hidden"
          onClick={() => wa.open(null)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconChevronLeft" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-medium">
          {chat?.name ?? "Conversa"}
        </p>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3"
        ref={scroller}
      >
        {hasMore ? (
          <Button
            className="mx-auto mb-2"
            disabled={wa.loadingMore}
            onClick={wa.loadMore}
            size="sm"
            variant="outline"
          >
            {wa.loadingMore ? "Carregando…" : "Carregar mensagens anteriores"}
          </Button>
        ) : null}
        {wa.messages === null ? (
          <p className="m-auto text-muted-foreground text-sm">Carregando…</p>
        ) : (
          wa.messages.map((m) => (
            <Bubble group={Boolean(chat?.isGroup)} key={m.id} m={m} />
          ))
        )}
      </div>
      <div className="shrink-0 px-3 pt-1 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.75rem))]">
        <WaComposer
          onSend={(value, file) =>
            file ? wa.sendFile(file, value) : wa.send(value)
          }
        />
      </div>
    </div>
  );
}

function ChatList({ wa, list }: { wa: Wa; list: WaChat[] }) {
  if (wa.chats === null) {
    return (
      <p className="p-4 text-center text-muted-foreground text-sm">
        Carregando conversas…
      </p>
    );
  }
  if (list.length === 0) {
    return (
      <p className="p-4 text-center text-muted-foreground text-sm">
        Nenhuma conversa aqui.
      </p>
    );
  }
  return list.map((c) => (
    <ChatRow
      active={c.id === wa.openId}
      chat={c}
      key={c.id}
      onOpen={() => wa.open(c.id)}
    />
  ));
}

type Tab = "all" | "unread" | "groups" | "archived";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "groups", label: "Grupos" },
  { id: "archived", label: "Arquivadas" },
];

const TAB_FILTERS: Record<Tab, (c: WaChat) => boolean> = {
  all: (c) => !c.archived,
  unread: (c) => c.unread > 0,
  groups: (c) => c.isGroup && !c.archived,
  archived: (c) => c.archived,
};

function Inbox({ wa, onConnect }: { wa: Wa; onConnect: () => void }) {
  const ready = wa.status?.bridge?.state === "ready";
  /** Disconnect takes two taps. */
  const [confirmOut, setConfirmOut] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const me = wa.status?.bridge?.me;
  const stats = wa.status?.bridge?.stats;
  const q = query.trim().toLowerCase();
  const list = (wa.chats ?? []).filter(
    (c) => (!q || c.name.toLowerCase().includes(q)) && TAB_FILTERS[tab](c)
  );
  const openChat = wa.chats?.find((c) => c.id === wa.openId);
  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0",
          wa.openId && "hidden md:flex"
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <ServiceLogo brand="whatsapp" className="size-5" />
          <p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
            {ready ? (me?.name ?? "Conectado") : "Arquivo do WhatsApp"}
            {me?.number ? ` · +${me.number}` : ""}
            {stats ? (
              <span className="block truncate">
                Arquivo: {stats.messages.toLocaleString("pt-BR")} mensagens ·{" "}
                {stats.chats.toLocaleString("pt-BR")} conversas ·{" "}
                {stats.mediaArchived.toLocaleString("pt-BR")} arquivos
              </span>
            ) : null}
          </p>
          {ready ? (
            <Button
              onClick={() => (confirmOut ? wa.logout() : setConfirmOut(true))}
              onMouseLeave={() => setConfirmOut(false)}
              size="sm"
              variant={confirmOut ? "destructive" : "ghost"}
            >
              {confirmOut ? "Confirmar desconexão" : "Desconectar"}
            </Button>
          ) : (
            <Button onClick={onConnect} size="sm">
              Conectar
            </Button>
          )}
        </div>
        {ready ? null : (
          <button
            className="mx-3 mb-2 rounded-xl border border-(--chat-accent)/40 bg-(--chat-accent)/10 px-3 py-2 text-left text-xs"
            onClick={onConnect}
            type="button"
          >
            <b>WhatsApp desconectado.</b> Você está vendo o arquivo salvo. Toque
            para conectar e receber as mensagens novas.
          </button>
        )}
        <div className="px-3 pb-2">
          <Input
            aria-label="Buscar conversa"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa"
            value={query}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
          {TABS.map((t) => (
            <button
              aria-pressed={tab === t.id}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                tab === t.id
                  ? "border-transparent bg-(--chat-accent) text-(--chat-accent-foreground)"
                  : "text-muted-foreground hover:bg-muted"
              )}
              key={t.id}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
              {t.id === "unread" && wa.chats
                ? ` (${wa.chats.filter((c) => c.unread > 0).length})`
                : ""}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          <ChatList list={list} wa={wa} />
        </div>
      </aside>
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          wa.openId ? "flex" : "hidden md:flex"
        )}
      >
        {wa.openId ? (
          <ChatView chat={openChat} wa={wa} />
        ) : (
          <p className="m-auto text-muted-foreground text-sm">
            Escolha uma conversa
          </p>
        )}
        {wa.error ? (
          <p className="border-t px-3 py-2 text-destructive text-sm">
            {wa.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function WhatsappPage() {
  const wa = useWhatsapp();
  const { status } = wa;
  /** Showing the connect flow instead of the saved archive. */
  const [connecting, setConnecting] = useState(false);
  if (!status) {
    return <Panel title="Carregando WhatsApp…" />;
  }
  if (!status.configured) {
    return (
      <Panel
        description="O servidor do WhatsApp (whatsapp-web.js num servidor gratuito) ainda não foi configurado. Veja os passos na página Conectores."
        title="WhatsApp ainda não configurado"
      >
        <Button
          nativeButton={false}
          render={<a href="../conectores/" />}
          variant="outline"
        >
          Abrir Conectores
        </Button>
      </Panel>
    );
  }
  if (!status.unlocked) {
    return <Unlock wa={wa} />;
  }
  if (status.offline || !status.bridge) {
    return (
      <Panel
        description="O servidor gratuito pode estar acordando ou reiniciando. Isso leva de 1 a 3 minutos — a página atualiza sozinha."
        title="Ligando o servidor do WhatsApp…"
      />
    );
  }
  const state = status.bridge.state;
  const hasArchive = (status.bridge.stats?.messages ?? 0) > 0;
  if (state === "ready" || (hasArchive && !connecting)) {
    return <Inbox onConnect={() => setConnecting(true)} wa={wa} />;
  }
  const back = hasArchive ? () => setConnecting(false) : undefined;
  if (state === "qr") {
    return <Pair onBack={back} wa={wa} />;
  }
  return (
    <Panel
      description={
        state === "disconnected"
          ? "A conexão caiu. Reconectando automaticamente…"
          : "Abrindo o WhatsApp no servidor e restaurando a sessão…"
      }
      title={state === "disconnected" ? "WhatsApp desconectado" : "Iniciando…"}
    >
      {back ? (
        <Button onClick={back} variant="outline">
          Ver conversas salvas
        </Button>
      ) : null}
    </Panel>
  );
}
