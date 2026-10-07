import type { Note } from "./types";

/** Starter notes that show off links, tags, charts and embeds. */

const DAY = 86_400_000;

const NOTES: [string, string, string][] = [
  [
    "Bem-vindo às Notas",
    "",
    `Este é o seu **segundo cérebro** do restaurante. Cada nota é Markdown puro, salva no aparelho.

## Como funciona
- Ligue notas com colchetes duplos: [[Ideias de cardápio]], [[Fornecedores]], [[Rotina de abertura]].
- Organize com tags: #gestao #inicio
- Arraste **imagens, vídeos e PDFs** para o editor, ou use os botões da barra.
- Insira gráficos animados com um bloco \`chart\` — toque em ⤢ para expandir.

\`\`\`chart
{ "dataset": "vendas_diarias" }
\`\`\`

> Dica: abra o **Grafo** para ver como tudo se conecta.

- [x] Conhecer o editor
- [ ] Criar minha primeira nota
- [ ] Ligar duas notas com [[links]]`,
  ],
  [
    "Ideias de cardápio",
    "Cardápio",
    `Ideias para a próxima estação. Relacionado: [[Fornecedores]], [[Custos e margens]].

## Pratos
1. Costela no bafo com farofa de banana
2. Moqueca de banana-da-terra (opção vegana) #vegano
3. Sobremesa de goiabada com queijo coalho

| Prato | Custo | Preço | Margem |
|---|---|---|---|
| Costela | € 6,20 | € 19,50 | 68% |
| Moqueca vegana | € 4,10 | € 16,00 | 74% |

#cardapio #ideias`,
  ],
  [
    "Fornecedores",
    "Restaurante",
    `Contatos e prazos dos fornecedores. Ver [[Rotina de abertura]] para os horários de recebimento.

- **Carnes** — entrega terça e sexta
- **Hortifrúti** — todos os dias até 9h
- **Bebidas** — quinzenal

Negociação de preços em [[Custos e margens]].

#fornecedores #gestao`,
  ],
  [
    "Custos e margens",
    "Financeiro",
    `Acompanhamento de CMV e margens. Fonte: painel de [[Fornecedores]] e [[Ideias de cardápio]].

\`\`\`chart
{ "dataset": "receita_despesas" }
\`\`\`

\`\`\`chart
{ "dataset": "cmv_categoria" }
\`\`\`

Meta do trimestre: **CMV abaixo de 30%**. #financeiro #gestao`,
  ],
  [
    "Rotina de abertura",
    "Restaurante",
    `Checklist diário antes de abrir. Faz parte do [[Manual da equipe]].

- [ ] Conferir temperatura das câmaras
- [ ] Receber hortifrúti ([[Fornecedores]])
- [ ] Revisar reservas do dia
- [ ] Briefing com a equipe às 17h

#rotina #equipe`,
  ],
  [
    "Manual da equipe",
    "Equipe",
    `Regras e cultura da casa.

> Hospitalidade é fazer o cliente se sentir em casa.

Leia também: [[Rotina de abertura]], [[Treinamento de vinhos]].

#equipe #cultura`,
  ],
  [
    "Treinamento de vinhos",
    "Equipe",
    `Harmonizações para o salão. Ligado ao [[Manual da equipe]] e às [[Ideias de cardápio]].

\`\`\`chart
{ "dataset": "bebidas_diarias" }
\`\`\`

- Tinto encorpado → carnes da brasa
- Branco fresco → peixes e moqueca

#vinhos #equipe #treinamento`,
  ],
  [
    "Reunião de outubro",
    "Reuniões",
    `Pauta: resultados do mês, [[Custos e margens]], novo prato das [[Ideias de cardápio]].

\`\`\`chart
{ "dataset": "resultado_mensal" }
\`\`\`

**Decisões**
- Lançar a costela no bafo em novembro
- Revisar contrato de carnes com [[Fornecedores]]
- Agendar [[Degustação com a equipe]]

#reuniao #gestao`,
  ],
];

export const HUB_ID = "seed-hub";

/** Icon, cover and parent page for each starter note (by seed id). */
export const SEED_LOOKS: Record<
  string,
  Pick<Note, "icon" | "cover" | "parentId">
> = {
  "seed-1": { icon: "👋", cover: "grad:6", parentId: null },
  "seed-2": { icon: "💡", cover: "grad:0", parentId: null },
  "seed-3": { icon: "📦", parentId: HUB_ID },
  "seed-4": { icon: "💰", cover: "grad:1", parentId: null },
  "seed-5": { icon: "⏰", parentId: HUB_ID },
  "seed-6": { icon: "🧑‍🍳", parentId: HUB_ID },
  "seed-7": { icon: "🍷", parentId: HUB_ID },
  "seed-8": { icon: "🗓️", cover: "grad:2", parentId: null },
  [HUB_ID]: { icon: "🍽️", cover: "grad:3", parentId: null },
};

export function hubNote(now = Date.now()): Note {
  return {
    id: HUB_ID,
    title: "Restaurante",
    folder: "",
    content: `Tudo sobre a operação da casa. As páginas acima vivem **dentro** desta página.

Veja também [[Ideias de cardápio]] e [[Custos e margens]]. #gestao`,
    pinned: true,
    ...SEED_LOOKS[HUB_ID],
    createdAt: now - 10 * DAY,
    updatedAt: now - 10 * DAY,
  };
}

export function seedNotes(): Note[] {
  const now = Date.now();
  return [
    hubNote(now),
    ...NOTES.map(([title, folder, content], i) => {
      const id = `seed-${i + 1}`;
      const looks = SEED_LOOKS[id];
      return {
        id,
        title,
        folder: looks?.parentId ? "" : folder,
        content,
        pinned: i === 0,
        ...looks,
        createdAt: now - (NOTES.length - i) * DAY,
        updatedAt: now - (NOTES.length - i) * DAY,
      };
    }),
  ];
}
