"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useEffect, useState } from "react";
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
  DEFAULT_PREFERENCES,
  FONTS,
  firstName,
  initialsOf,
  loadFonts,
  setPreferences,
  usePreferences,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

function ProfileCard() {
  const prefs = usePreferences();
  const [name, setName] = useState(prefs.name);
  const [role, setRole] = useState(prefs.role);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(prefs.name);
    setRole(prefs.role);
  }, [prefs.name, prefs.role]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setPreferences({
      name: name.trim() || DEFAULT_PREFERENCES.name,
      role: role.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <Button disabled={!changed} type="submit">
              Salvar perfil
            </Button>
            {saved ? (
              <span className="flex items-center gap-1 text-muted-foreground text-sm">
                <Icon className="size-4" name="IconCheckmark1" />
                Salvo
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TypographyCard() {
  const prefs = usePreferences();

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
          Escolha a fonte de todo o app. A mudança é imediata e fica salva neste
          aparelho.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                onClick={() => setPreferences({ font: font.id })}
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
          Personalize o seu nome, o tema e a tipografia do painel.
        </p>
      </div>
      <ProfileCard />
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
