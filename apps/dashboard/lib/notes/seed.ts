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

export function seedNotes(): Note[] {
  const now = Date.now();
  return NOTES.map(([title, folder, content], i) => ({
    id: `seed-${i + 1}`,
    title,
    folder,
    content,
    pinned: i === 0,
    createdAt: now - (NOTES.length - i) * DAY,
    updatedAt: now - (NOTES.length - i) * DAY,
  }));
}
