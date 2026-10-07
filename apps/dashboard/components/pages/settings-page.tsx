"use client";

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
import { Icon } from "@/lib/icons";
import {
  firstName,
  loadFonts,
  type SaveResult,
  savePreferences,
  usePreferences,
} from "@/lib/preferences";
import { DEFAULT_PREFERENCES, FONTS } from "@/lib/preferences-fonts";
import { cn } from "@/lib/utils";
import { IconCard, PhotoPicker } from "./settings-images";
import { SaveStatus } from "./settings-status";

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
          Sua foto e seu nome aparecem nas saudações e no avatar do topo, e o
          Assistente IA passa a chamar você pelo nome.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <PhotoPicker name={name || DEFAULT_PREFERENCES.name}>
            <p className="truncate font-medium">
              Olá, {firstName(name || DEFAULT_PREFERENCES.name)}!
            </p>
            <p className="truncate text-muted-foreground text-sm">
              {role || "Sem cargo definido"}
            </p>
          </PhotoPicker>
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
