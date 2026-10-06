"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  firstName,
  initialsOf,
  loadFonts,
  type SaveResult,
  saveIcon,
  savePreferences,
  usePreferences,
} from "@/lib/preferences";
import { DEFAULT_PREFERENCES, FONTS } from "@/lib/preferences-fonts";
import { cn } from "@/lib/utils";
import { iconPngs } from "./settings-icon";

const STATUS_TEXT: Record<SaveResult, string> = {
  cloud: "Salvo — vale para todos os seus aparelhos",
  device: "Salvo neste aparelho",
  error: "Não foi possível salvar no servidor. Tente de novo.",
};

function SaveStatus({ status }: { status: SaveResult | "saving" | null }) {
  if (!status || status === "saving") {
    return null;
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-sm",
        status === "error" ? "text-destructive" : "text-muted-foreground"
      )}
      role="status"
    >
      <Icon
        className="size-4 shrink-0"
        name={status === "error" ? "IconCircleInfo" : "IconCheckmark1"}
      />
      {STATUS_TEXT[status]}
    </span>
  );
}

function IconCard() {
  const prefs = usePreferences();
  const [draft, setDraft] = useState<Record<number, string> | null>(null);
  const [status, setStatus] = useState<SaveResult | "saving" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    setStatus(null);
    setProblem(null);
    if (!file) {
      return;
    }
    try {
      setDraft(await iconPngs(file));
    } catch {
      setProblem("Não consegui abrir essa imagem. Use PNG, JPG, WEBP ou SVG.");
    }
  };

  const run = async (pngs: Record<number, string> | null) => {
    setStatus("saving");
    const result = await saveIcon(pngs);
    setStatus(result);
    if (result !== "error") {
      setDraft(null);
    }
  };

  const custom = Boolean(prefs.icon || prefs.iconData);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" name="IconImages1" />
          Ícone do app
        </CardTitle>
        <CardDescription>
          Aparece no topo, no menu e na Tela de Início do iPhone. Use uma imagem
          quadrada (ela é recortada no centro).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {draft ? (
            // biome-ignore lint/performance/noImgElement: local preview (data URL)
            <img
              alt="Prévia do novo ícone"
              className="size-16 rounded-2xl object-cover"
              height={64}
              src={draft[192]}
              width={64}
            />
          ) : (
            <BrandLogo className="size-16 rounded-2xl" />
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <label className="w-fit">
              <input
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/heic"
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
                type="file"
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 font-medium text-sm hover:bg-muted">
                <Icon className="size-4" name="IconArrowUp" />
                Escolher imagem
              </span>
            </label>
            {custom && !draft ? (
              <button
                className="w-fit text-muted-foreground text-xs underline-offset-2 hover:underline"
                disabled={status === "saving"}
                onClick={() => run(null)}
                type="button"
              >
                Voltar ao ícone padrão
              </button>
            ) : null}
          </div>
        </div>
        {problem ? <p className="text-destructive text-sm">{problem}</p> : null}
        {draft ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={status === "saving"} onClick={() => run(draft)}>
              {status === "saving" ? "Salvando…" : "Salvar ícone"}
            </Button>
            <Button onClick={() => setDraft(null)} variant="ghost">
              Cancelar
            </Button>
          </div>
        ) : (
          <SaveStatus status={status} />
        )}
        <p className="text-muted-foreground text-xs">
          Para trocar o ícone da Tela de Início, o iPhone pede para adicionar o
          app de novo: remova o ícone antigo, abra o painel no Safari e toque em
          Compartilhar → Adicionar à Tela de Início.
        </p>
      </CardContent>
    </Card>
  );
}

function ProfileCard() {
  const prefs = usePreferences();
  const [name, setName] = useState(prefs.name);
  const [role, setRole] = useState(prefs.role);
  const [status, setStatus] = useState<SaveResult | "saving" | null>(null);

  useEffect(() => {
    setName(prefs.name);
    setRole(prefs.role);
  }, [prefs.name, prefs.role]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    setStatus(
      await savePreferences({
        name: name.trim() || DEFAULT_PREFERENCES.name,
        role: role.trim(),
      })
    );
  };

  const changed = name.trim() !== prefs.name || role.trim() !== prefs.role;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          Seu nome aparece nas saudações, no avatar do topo e o Assistente IA
          passa a chamar você por ele.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background text-lg">
              {initialsOf(name || DEFAULT_PREFERENCES.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                Olá, {firstName(name || DEFAULT_PREFERENCES.name)}!
              </p>
              <p className="truncate text-muted-foreground text-sm">
                {role || "Sem cargo definido"}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className="flex flex-col gap-1.5 text-sm"
              htmlFor="pref-name"
            >
              <span className="font-medium">Nome</span>
              <Input
                autoComplete="name"
                id="pref-name"
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                value={name}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm"
              htmlFor="pref-role"
            >
              <span className="font-medium">Cargo</span>
              <Input
                id="pref-role"
                maxLength={60}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex.: Proprietário, Gerente"
                value={role}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={!changed || status === "saving"} type="submit">
              {status === "saving" ? "Salvando…" : "Salvar perfil"}
            </Button>
            <SaveStatus status={changed ? null : status} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TypographyCard() {
  const prefs = usePreferences();
  const [status, setStatus] = useState<SaveResult | "saving" | null>(null);

  const choose = async (font: string) => {
    setStatus("saving");
    setStatus(await savePreferences({ font }));
  };

  // Previews need every option loaded (only on this page)
  useEffect(() => {
    loadFonts(FONTS, "app-font-previews");
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" name="IconFontStyle" />
          Tipografia
        </CardTitle>
        <CardDescription>
          Escolha a fonte de todo o app. A mudança é imediata e fica salva.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SaveStatus status={status} />
        <div className="grid gap-3 sm:grid-cols-2">
          {FONTS.map((font) => {
            const active = prefs.font === font.id;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/50",
                  active &&
                    "border-foreground bg-muted/40 ring-1 ring-foreground"
                )}
                key={font.id}
                onClick={() => choose(font.id)}
                style={{ fontFamily: font.stack }}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-base">{font.label}</span>
                  {active ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                      <Icon className="size-3" name="IconCheckmark1" />
                    </span>
                  ) : null}
                </span>
                <span className="text-2xl leading-tight tracking-tight">
                  Aa Casa Brasa
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  Faturamento R$ 184.320,50 · CMV 27,6%
                </span>
                <span className="text-muted-foreground text-xs">
                  {font.note}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 md:gap-6">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">Configurações</h2>
        <p className="text-muted-foreground text-sm">
          Personalize o seu nome, o ícone, o tema e a tipografia do painel.
        </p>
      </div>
      <ProfileCard />
      <IconCard />
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>Escuro, bege ou claro.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
      <TypographyCard />
    </div>
  );
}
