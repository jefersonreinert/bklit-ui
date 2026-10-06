"use client";

import { Icon } from "@bklitui/icons";
import { type ReactNode, useState } from "react";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import { ProfileAvatar } from "@/components/dashboard/profile-avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type SaveResult, saveImage, usePreferences } from "@/lib/preferences";
import type { ImageKind } from "@/lib/settings-types";
import { imagePngs } from "./settings-icon";
import { SaveStatus } from "./settings-status";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/heic";

/** Picking a file uploads it right away (no extra "save" step). */
function useImageUpload(kind: ImageKind) {
  const [status, setStatus] = useState<SaveResult | "saving" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    setProblem(null);
    if (!file) {
      return;
    }
    let pngs: Record<number, string>;
    try {
      pngs = await imagePngs(file, kind);
    } catch {
      setStatus(null);
      setProblem("Não consegui abrir essa imagem. Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    setStatus("saving");
    setStatus(await saveImage(kind, pngs));
  };

  const remove = async () => {
    setProblem(null);
    setStatus("saving");
    setStatus(await saveImage(kind, null));
  };

  return { status, problem, upload, remove };
}

function PickButton({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <label className="w-fit">
      <input
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
        type="file"
      />
      <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 font-medium text-sm hover:bg-muted">
        <Icon className="size-4" name="IconArrowUp" />
        {label}
      </span>
    </label>
  );
}

function Feedback({
  status,
  problem,
}: {
  status: SaveResult | "saving" | null;
  problem: string | null;
}) {
  if (problem) {
    return <p className="text-destructive text-sm">{problem}</p>;
  }
  if (status === "saving") {
    return <p className="text-muted-foreground text-sm">Salvando…</p>;
  }
  return <SaveStatus status={status} />;
}

/** Profile photo next to the name (Configurações → Perfil). */
export function PhotoPicker({
  name,
  children,
}: {
  name: string;
  /** Greeting shown next to the photo. */
  children?: ReactNode;
}) {
  const prefs = usePreferences();
  const { status, problem, upload, remove } = useImageUpload("avatar");
  const hasPhoto = Boolean(prefs.avatar || prefs.avatarData);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <ProfileAvatar
          className="size-20"
          fallbackClassName="text-lg"
          name={name}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="min-w-0">{children}</div>
          <div className="flex flex-wrap items-center gap-3">
            <PickButton
              disabled={status === "saving"}
              label={hasPhoto ? "Trocar foto" : "Adicionar foto"}
              onPick={upload}
            />
            {hasPhoto ? (
              <button
                className="w-fit text-muted-foreground text-xs underline-offset-2 hover:underline"
                disabled={status === "saving"}
                onClick={remove}
                type="button"
              >
                Remover foto
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <Feedback problem={problem} status={status} />
    </div>
  );
}

export function IconCard() {
  const prefs = usePreferences();
  const { status, problem, upload, remove } = useImageUpload("icon");
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
          <BrandLogo className="size-16 rounded-2xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <PickButton
              disabled={status === "saving"}
              label="Enviar ícone"
              onPick={upload}
            />
            {custom ? (
              <button
                className="w-fit text-muted-foreground text-xs underline-offset-2 hover:underline"
                disabled={status === "saving"}
                onClick={remove}
                type="button"
              >
                Voltar ao ícone padrão
              </button>
            ) : null}
          </div>
        </div>
        <Feedback problem={problem} status={status} />
        <p className="text-muted-foreground text-xs">
          Para trocar o ícone da Tela de Início, o iPhone pede para adicionar o
          app de novo: remova o ícone antigo, abra o painel no Safari e toque em
          Compartilhar → Adicionar à Tela de Início.
        </p>
      </CardContent>
    </Card>
  );
}
