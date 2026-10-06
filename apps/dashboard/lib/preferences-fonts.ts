/** Fonts and defaults shared by the client store and the settings API. */

export interface FontOption {
  id: string;
  label: string;
  /** Short description shown in Configurações. */
  note: string;
  stack: string;
  /** Google Fonts family query (absent = already bundled or system). */
  google?: string;
}

export const FONTS: FontOption[] = [
  {
    id: "geist",
    label: "Geist",
    note: "Padrão do app — moderna e neutra",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "system",
    label: "Sistema (San Francisco)",
    note: "A fonte nativa do iPhone e do Mac",
    stack:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "inter",
    label: "Inter",
    note: "Ótima leitura em telas e números",
    stack: "'Inter', ui-sans-serif, system-ui, sans-serif",
    google: "Inter:wght@400;500;600;700",
  },
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    note: "Geométrica e elegante",
    stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    google: "Plus+Jakarta+Sans:wght@400;500;600;700",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    note: "Suave, ótima para painéis",
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    google: "DM+Sans:wght@400;500;600;700",
  },
  {
    id: "manrope",
    label: "Manrope",
    note: "Contemporânea e compacta",
    stack: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    google: "Manrope:wght@400;500;600;700",
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Sans",
    note: "Técnica, com personalidade",
    stack: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    google: "IBM+Plex+Sans:wght@400;500;600;700",
  },
  {
    id: "source-serif",
    label: "Source Serif 4",
    note: "Serifada, estilo editorial",
    stack: "'Source Serif 4', ui-serif, Georgia, serif",
    google: "Source+Serif+4:wght@400;500;600;700",
  },
  {
    id: "lora",
    label: "Lora",
    note: "Serifada clássica, calorosa",
    stack: "'Lora', ui-serif, Georgia, serif",
    google: "Lora:wght@400;500;600;700",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    note: "Monoespaçada, visual técnico",
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    google: "JetBrains+Mono:wght@400;500;600;700",
  },
];

export interface Preferences {
  name: string;
  role: string;
  font: string;
  /** Version of the uploaded app icon (served by /api/brand/icon). */
  icon?: string;
  /** Local copy of the uploaded icon (data URL) for instant display. */
  iconData?: string;
  /** Version of the uploaded profile photo (served by /api/brand/avatar). */
  avatar?: string;
  /** Local copy of the profile photo (data URL). */
  avatarData?: string;
  /** Last change (ms); the newest of device and server wins. */
  updatedAt?: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  name: "Gabriela",
  role: "Gerente",
  font: "geist",
};
