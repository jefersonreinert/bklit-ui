import { TODAY } from "./data";
import type { MailMessage, MailSummary, MailThread } from "./mail-types";

/**
 * Sample inbox shown before Google is connected (and on the static build),
 * so the E-mail page can be explored. Never sent anywhere.
 */

const WHITESPACE = /\s+/g;

export const DEMO_ACCOUNT = "gabriela@casabrasa.com.br";

const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

interface DemoSeed {
  id: string;
  from: [string, string];
  subject: string;
  date: number;
  body: string;
  labels: string[];
  attachments?: string[];
  replies?: { from: [string, string]; date: number; body: string }[];
}

const SEEDS: DemoSeed[] = [
  {
    id: "d1",
    from: ["Frigorífico Serra Gaúcha", "vendas@serragaucha.com.br"],
    subject: "Cotação semanal — cortes premium (picanha, ancho, fraldinha)",
    date: at(0, 9, 12),
    labels: ["INBOX", "UNREAD"],
    attachments: ["cotacao-semana-41.pdf"],
    body: "Bom dia, Gabriela!\n\nSegue a cotação desta semana:\n\n• Picanha Angus — R$ 89,90/kg (+4% vs semana passada)\n• Ancho — R$ 94,50/kg (estável)\n• Fraldinha — R$ 52,30/kg (−2%)\n\nPedido mínimo de 30 kg para entrega na quinta. Consegue confirmar até amanhã às 14h?\n\nAbraço,\nRicardo — Serra Gaúcha",
  },
  {
    id: "d2",
    from: ["Mariana Lopes", "mariana.lopes@techcorp.com"],
    subject: "Reserva para evento corporativo — 40 pessoas, 24/10",
    date: at(0, 8, 40),
    labels: ["INBOX", "UNREAD", "STARRED"],
    body: "Olá!\n\nGostaria de reservar o salão para um jantar de fim de ano da nossa equipe no dia 24/10, a partir das 19h30, para 40 pessoas.\n\nVocês têm menu fechado com harmonização? Precisamos de 4 opções vegetarianas.\n\nObrigada,\nMariana Lopes\nTechCorp",
  },
  {
    id: "d3",
    from: ["Contabilidade Prado", "fechamento@pradocontabil.com.br"],
    subject: "DRE de setembro e guia do Simples",
    date: at(1, 17, 5),
    labels: ["INBOX"],
    attachments: ["DRE-setembro-2026.xlsx", "DAS-setembro.pdf"],
    body: "Gabriela, boa tarde.\n\nEm anexo o DRE de setembro e a guia do DAS com vencimento em 20/10.\n\nPontos de atenção:\n1. CMV subiu para 31,2% (meta 30%).\n2. Despesas com manutenção acima do orçado.\n\nQualquer dúvida estou à disposição.\n\nAtt.,\nCarla Prado",
    replies: [
      {
        from: ["Gabriela", DEMO_ACCOUNT],
        date: at(1, 18, 22),
        body: "Obrigada, Carla! Vou revisar com a cozinha o CMV das carnes e te retorno.",
      },
    ],
  },
  {
    id: "d4",
    from: ["Vigilância Sanitária", "alvaras@saude.sp.gov.br"],
    subject: "Renovação de licença sanitária — prazo 31/10",
    date: at(2, 11, 0),
    labels: ["INBOX", "UNREAD"],
    body: "Prezado responsável,\n\nInformamos que a licença sanitária do estabelecimento CASA BRASA vence em 31/10/2026. Para renovação, envie: laudo de dedetização (validade 6 meses), certificado de boas práticas e comprovante de limpeza da caixa d'água.\n\nAtenciosamente,\nCoordenação de Vigilância Sanitária",
  },
  {
    id: "d5",
    from: ["Adega Importadora Douro", "pedidos@adegadouro.com.br"],
    subject: "Nova safra Quinta do Vale 2022 + condição especial",
    date: at(3, 15, 30),
    labels: ["INBOX"],
    body: "Olá, equipe Casa Brasa!\n\nChegou a nova safra do Quinta do Vale Reserva 2022. Para clientes da casa: 12% de desconto na caixa com 6 garrafas até sexta.\n\nPreço unitário: R$ 148,00 (sai a R$ 130,24).\n\nSaudações,\nPedro — Adega Douro",
  },
  {
    id: "d6",
    from: ["João Pedro Alves", "jp.alves.sommelier@gmail.com"],
    subject: "Candidatura — vaga de sommelier",
    date: at(4, 10, 15),
    labels: ["INBOX"],
    attachments: ["curriculo-joao-pedro.pdf"],
    body: "Boa tarde,\n\nVi a vaga de sommelier e gostaria de me candidatar. Tenho certificação WSET nível 3 e 5 anos de experiência em restaurantes de carnes.\n\nDisponibilidade imediata.\n\nObrigado,\nJoão Pedro",
  },
  {
    id: "d7",
    from: ["iFood para Parceiros", "repasses@ifood.com.br"],
    subject: "Repasse semanal disponível: R$ 18.432,70",
    date: at(5, 7, 0),
    labels: ["INBOX"],
    body: "Olá, Casa Brasa!\n\nSeu repasse referente a 22/09 a 28/09 já está disponível.\n\nPedidos: 214 · Ticket médio: R$ 96,40 · Taxas: R$ 2.198,90\nValor líquido: R$ 18.432,70\n\nEquipe iFood",
  },
  {
    id: "d8",
    from: ["Gabriela", DEMO_ACCOUNT],
    subject: "Escala do fim de semana",
    date: at(2, 20, 10),
    labels: ["SENT"],
    body: "Pessoal, segue a escala de sábado e domingo:\n\nSalão: Ana, Bruno, Carla (sábado) / Diego, Ana (domingo)\nCozinha: Chef Rafael + 3\n\nQualquer troca, me avisem até quinta.\n\nGabriela",
  },
];

const message = (
  id: string,
  from: [string, string],
  to: string,
  subject: string,
  date: number,
  body: string,
  labels: string[],
  attachments: string[] = []
): MailMessage => ({
  id,
  from: { name: from[0], email: from[1] },
  to,
  cc: "",
  subject,
  date,
  text: body,
  html: null,
  attachments: attachments.map((filename) => ({
    filename,
    mimeType: "application/octet-stream",
    size: 0,
  })),
  messageId: `<${id}@demo.casabrasa>`,
  references: "",
  unread: labels.includes("UNREAD"),
  starred: labels.includes("STARRED"),
});

/** The sample inbox greets whoever is set in Configurações. */
function seedsFor(name: string): DemoSeed[] {
  const safe = JSON.stringify(name || "Gabriela").slice(1, -1);
  return JSON.parse(
    JSON.stringify(SEEDS).replaceAll("Gabriela", safe)
  ) as DemoSeed[];
}

export function demoThreads(name = "Gabriela"): MailThread[] {
  return seedsFor(name).map((s) => ({
    id: s.id,
    subject: s.subject,
    messages: [
      message(
        s.id,
        s.from,
        s.labels.includes("SENT") ? "equipe@casabrasa.com.br" : DEMO_ACCOUNT,
        s.subject,
        s.date,
        s.body,
        s.labels,
        s.attachments
      ),
      ...(s.replies ?? []).map((r, i) =>
        message(
          `${s.id}-r${i}`,
          r.from,
          s.from[1],
          `Re: ${s.subject}`,
          r.date,
          r.body,
          ["SENT"]
        )
      ),
    ],
  }));
}

export function demoSummaries(name = "Gabriela"): MailSummary[] {
  return seedsFor(name).map((s) => ({
    id: s.id,
    threadId: s.id,
    from: { name: s.from[0], email: s.from[1] },
    to: DEMO_ACCOUNT,
    subject: s.subject,
    snippet: s.body.replace(WHITESPACE, " ").slice(0, 140),
    date: s.date,
    unread: s.labels.includes("UNREAD"),
    starred: s.labels.includes("STARRED"),
    hasAttachments: Boolean(s.attachments?.length),
    labels: s.labels,
  }));
}
