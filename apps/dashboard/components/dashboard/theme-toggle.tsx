"use client";

import { Icon, type IconName } from "@/lib/icons";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const themeOptions: { value: string; label: string; icon: IconName }[] = [
  { value: "dark", label: "Escuro", icon: "IconMoon" },
  { value: "beige", label: "Bege", icon: "IconJavaCoffeeBean" },
  { value: "light", label: "Claro", icon: "IconSun" },
];

/** Segmented switch between the dark acrylic, beige and light themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : undefined;

  return (
    <fieldset
      aria-label="Tema"
      className={cn(
        "m-0 flex min-w-0 items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5",
        className
      )}
    >
      {themeOptions.map((option) => {
        const active = current === option.value;
        return (
          <button
            aria-label={`Tema ${option.label.toLowerCase()}`}
            aria-pressed={active}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
              active
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={option.value}
            onClick={() => setTheme(option.value)}
            type="button"
          >
            <Icon className="size-3.5" name={option.icon} />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
