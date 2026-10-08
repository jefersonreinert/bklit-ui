"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlock } from "@/lib/code/client";
import { Icon, type IconName } from "@/lib/icons";

/** Screens shown before the Code page can start sessions. */

function Shell({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-6" name={icon} />
      </span>
      <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function NotConfigured() {
  return (
    <Shell icon="IconCloud" title="Code na nuvem">
      <p className="text-muted-foreground text-sm">
        As sessões rodam em containers da Anthropic (Claude Managed Agents), com
        os seus repositórios do GitHub clonados. Para ativar, adicione a
        variável <code className="text-foreground">ANTHROPIC_API_KEY</code> no
        Cloudflare (Workers → casa-brasa → Settings → Variables and Secrets) e
        recarregue a página.
      </p>
      <p className="text-muted-foreground text-xs">
        O uso é cobrado na sua conta da API da Anthropic (por tokens e tempo de
        container), separado da assinatura do Claude.
      </p>
    </Shell>
  );
}

export function Locked({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await unlock(code)) {
      onDone();
    } else {
      setError("Código incorreto.");
    }
  };
  return (
    <Shell icon="IconShieldCheck" title="Desbloquear o Code">
      <form className="flex flex-col gap-2" onSubmit={submit}>
        <p className="text-muted-foreground text-sm">
          O Code roda o Claude Code na nuvem pela sua assinatura e age no seu
          GitHub. Digite o código de acesso do painel (o mesmo do WhatsApp).
        </p>
        <Input
          aria-label="Código de acesso"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value)}
          type="password"
          value={code}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="h-11 rounded-full" disabled={!code} type="submit">
          Desbloquear
        </Button>
      </form>
    </Shell>
  );
}

export function ConnectGithub() {
  return (
    <Link
      className="flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-card px-4 py-2 text-sm shadow-xs transition-colors hover:bg-muted"
      href="/conectores"
    >
      <Icon className="size-4" name="IconGithub" />
      Conectar GitHub
    </Link>
  );
}
