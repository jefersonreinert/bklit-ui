/**
 * Documents an employee needs to live and work legally in Malta, by origin.
 * EU/EEA/Swiss citizens work freely; third-country nationals (TCNs) need a
 * Single Permit (Identità) and, in tourism and hospitality, the Pre-Departure
 * Course and the Tourism & Hospitality Skills Pass (L.N. 78 of 2024).
 * Sources: identita.gov.mt, jobsplus.gov.mt, tourism.skillspass.org.mt (2026).
 */

export type Origin = "eu" | "non-eu";

export interface DocKind {
  id: string;
  label: string;
  /** Who needs it. */
  for: Origin | "all";
  /** Has an expiry date worth tracking. */
  expires: boolean;
  /** Missing it blocks legal work (shown as a problem, not a hint). */
  required: boolean;
  hint: string;
}

export const DOC_KINDS: DocKind[] = [
  {
    id: "passport",
    label: "Passaporte",
    for: "all",
    expires: true,
    required: true,
    hint: "Não-UE: válido pelo menos 6 meses além da estadia. UE: pode ser o documento de identidade.",
  },
  {
    id: "eu-id",
    label: "Documento de identidade (UE)",
    for: "eu",
    expires: true,
    required: false,
    hint: "Carteira de identidade do país da UE/EEE/Suíça (no lugar do passaporte).",
  },
  {
    id: "eu-residence",
    label: "Registro de residência / eID Malta",
    for: "eu",
    expires: true,
    required: true,
    hint: "Identità: obrigatório para quem fica mais de 3 meses.",
  },
  {
    id: "visa",
    label: "Visto de entrada (D)",
    for: "non-eu",
    expires: true,
    required: false,
    hint: "Quando a nacionalidade exige visto para entrar em Malta.",
  },
  {
    id: "single-permit",
    label: "Single Permit (residência + trabalho)",
    for: "non-eu",
    expires: true,
    required: true,
    hint: "Identità. Preso à empresa e à função; renove antes de vencer.",
  },
  {
    id: "employment-licence",
    label: "Employment Licence (Jobsplus)",
    for: "non-eu",
    expires: true,
    required: false,
    hint: "Só para quem mora em Malta por outra via (não Single Permit).",
  },
  {
    id: "pre-departure",
    label: "Pre-Departure Course",
    for: "non-eu",
    expires: false,
    required: true,
    hint: "Obrigatório desde 1/3/2026 no primeiro pedido feito do exterior.",
  },
  {
    id: "skills-pass",
    label: "Skills Pass Turismo e Hotelaria",
    for: "non-eu",
    expires: true,
    required: true,
    hint: "Exigido para bar e restaurante (L.N. 78 de 2024).",
  },
  {
    id: "medical",
    label: "Exame médico (health screening)",
    for: "non-eu",
    expires: false,
    required: true,
    hint: "Pedido online desde 4/5/2026; raio-X para países de risco de TB.",
  },
  {
    id: "police",
    label: "Atestado de antecedentes criminais",
    for: "non-eu",
    expires: false,
    required: true,
    hint: "Do país de origem (Police Conduct Certificate).",
  },
  {
    id: "accommodation",
    label: "Comprovante de moradia",
    for: "non-eu",
    expires: true,
    required: true,
    hint: "Contrato de aluguel registrado na Housing Authority.",
  },
  {
    id: "health-insurance",
    label: "Seguro saúde",
    for: "non-eu",
    expires: true,
    required: false,
    hint: "Até ter cobertura pela Segurança Social.",
  },
  {
    id: "cv",
    label: "CV e qualificações",
    for: "non-eu",
    expires: false,
    required: false,
    hint: "Usados no pedido do Single Permit.",
  },
  {
    id: "ssn",
    label: "Número da Segurança Social",
    for: "all",
    expires: false,
    required: true,
    hint: "Social Security Number (DSS).",
  },
  {
    id: "tin",
    label: "Número fiscal (TIN)",
    for: "all",
    expires: false,
    required: true,
    hint: "Commissioner for Tax and Customs.",
  },
  {
    id: "fs4",
    label: "FS4 (declaração fiscal do empregado)",
    for: "all",
    expires: false,
    required: true,
    hint: "Entregue no início do emprego.",
  },
  {
    id: "jobsplus",
    label: "Engagement Form (Jobsplus)",
    for: "all",
    expires: false,
    required: true,
    hint: "A empresa registra a contratação na Jobsplus.",
  },
  {
    id: "contract",
    label: "Contrato de trabalho assinado",
    for: "all",
    expires: true,
    required: true,
    hint: "Contrato por prazo: informe a data de término.",
  },
  {
    id: "bank",
    label: "Dados bancários (IBAN)",
    for: "all",
    expires: false,
    required: false,
    hint: "Para pagar o salário.",
  },
  {
    id: "other",
    label: "Outro documento",
    for: "all",
    expires: true,
    required: false,
    hint: "Qualquer outro documento do funcionário.",
  },
];

export const kindsFor = (origin: Origin) =>
  DOC_KINDS.filter((k) => k.for === "all" || k.for === origin);

export const DOC_KIND_IDS = DOC_KINDS.map((k) => k.id);

/** Days to warn before a document expires. */
export const EXPIRY_WARN_DAYS = 60;

export type DocStatus = "ok" | "missing" | "expiring" | "expired";

/** Status of one document (today and expiry as YYYY-MM-DD). */
export function docStatus(
  doc: { expiresAt?: string; hasFile: boolean; number?: string } | undefined,
  today: string
): DocStatus {
  if (!(doc && (doc.hasFile || doc.number))) {
    return "missing";
  }
  if (!doc.expiresAt) {
    return "ok";
  }
  if (doc.expiresAt < today) {
    return "expired";
  }
  const days =
    (Date.parse(`${doc.expiresAt}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  return days <= EXPIRY_WARN_DAYS ? "expiring" : "ok";
}
