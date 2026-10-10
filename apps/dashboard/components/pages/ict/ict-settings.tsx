"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import { Field, splitList } from "@/components/pages/beverages/wine-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import {
  type AlertRules,
  ICT_CATEGORIES,
  RELEVANCE,
  RELEVANCE_LABEL,
  type Relevance,
} from "@/lib/ict/types";
import { cn } from "@/lib/utils";

export interface IctSettings {
  enabled: boolean;
  aiEnabled: boolean;
  intervalMinutes: number;
  interests: string[];
  alertRules: AlertRules;
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ICT_CATEGORIES.map((c) => (
        <button
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            value.includes(c) && "border-primary bg-primary/10"
          )}
          key={c}
          onClick={() =>
            onChange(
              value.includes(c) ? value.filter((x) => x !== c) : [...value, c]
            )
          }
          type="button"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

const NONE = "none";

/** Interval, categories of interest and alert criteria. */
export function IctSettingsSheet({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: IctSettings;
}) {
  const update = useMutation(api.ict.updateSettings);
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const rules = draft.alertRules;
  const setRules = (patch: Partial<AlertRules>) =>
    setDraft({ ...draft, alertRules: { ...rules, ...patch } });

  async function save() {
    setSaving(true);
    try {
      await update({
        intervalMinutes: draft.intervalMinutes,
        interests: draft.interests,
        alertRules: draft.alertRules,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      onOpenChange={(o) => {
        if (o) {
          setDraft(settings);
        } else {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Configurar monitorização</SheetTitle>
          <SheetDescription>
            Cada verificação consome pedidos da API do X; cada publicação nova
            analisada consome créditos da xAI.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5">
          <Field label="Verificar a cada (minutos, 5 a 1440)">
            <Input
              inputMode="numeric"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  intervalMinutes: Number(e.target.value) || 15,
                })
              }
              value={draft.intervalMinutes}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">
              Categorias de interesse (destacadas no feed)
            </span>
            <CategoryPicker
              onChange={(interests) => setDraft({ ...draft, interests })}
              value={draft.interests}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border p-3">
            <p className="font-medium text-sm">Alertas no painel</p>
            <div className="flex items-center justify-between text-sm">
              <span>Toda publicação nova</span>
              <Switch
                checked={rules.newPost}
                onCheckedChange={(newPost) => setRules({ newPost })}
              />
            </div>
            <Field label="Relevância mínima (segundo o Grok)">
              <FilterSelect
                className="sm:w-full"
                items={[
                  { value: NONE, label: "Não alertar por relevância" },
                  ...RELEVANCE.map((r) => ({
                    value: r,
                    label: `${RELEVANCE_LABEL[r]} ou mais`,
                  })),
                ]}
                onChange={(v) =>
                  setRules({
                    minRelevance: v === NONE ? null : (v as Relevance),
                  })
                }
                value={rules.minRelevance ?? NONE}
              />
            </Field>
            <Field label="Palavras-chave no texto (vírgula)">
              <Input
                defaultValue={rules.keywords.join(", ")}
                onBlur={(e) =>
                  setRules({ keywords: splitList(e.target.value) })
                }
                placeholder="NQ, ES, FOMC, killzone"
              />
            </Field>
            <Field label="Conceitos de trading (vírgula)">
              <Input
                defaultValue={rules.concepts.join(", ")}
                onBlur={(e) =>
                  setRules({ concepts: splitList(e.target.value) })
                }
                placeholder="Fair Value Gap, Order Block, Liquidity"
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs">Categorias</span>
              <CategoryPicker
                onChange={(categories) => setRules({ categories })}
                value={rules.categories}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Os alertas aparecem nesta página. Não há canal externo (e-mail,
              Telegram, push) configurado no painel.
            </p>
          </div>
          <Button disabled={saving} onClick={save}>
            Guardar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
