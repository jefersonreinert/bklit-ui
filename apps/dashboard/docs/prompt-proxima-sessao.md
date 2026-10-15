# Prompt para a próxima sessão (copie tudo abaixo da linha)

---

Você vai continuar o trabalho no meu app (painel "Casa Brasa"), no
repositório GitHub `jefersonreinert/bklit-ui`. O app fica em
`apps/dashboard`: Next.js 16 com pnpm, Biome, Convex e deploy no Vercel
(projeto `dashboard-4p9r`). Fale comigo sempre em **português**.

## Antes de começar

1. Leia `AGENTS.md` (raiz) e `apps/dashboard/docs/layout-minimalista.md`.
   Esse segundo arquivo explica o que já foi feito e por quê.
2. Veja se o PR #36 (branch `claude/tela-cheia`) já foi mergeado:
   - **Se não foi**, trabalhe a partir dessa branch.
   - **Se já foi**, crie uma branch nova a partir do `main`.
3. Rode o app com `pnpm dev` dentro de `apps/dashboard` (porta 3004).
   Confira cada mudança no Playwright com o iPhone 13
   (`devices["iPhone 13"]`) e tire prints antes de me mostrar.
4. Antes de abrir o PR, rode `npx tsc --noEmit -p .` e
   `npx biome check <arquivos alterados>` em `apps/dashboard`.
   Rode também os testes que existirem para o que você mexeu
   (`pnpm vitest run <arquivo>`).

## Regras que já combinamos

- **Só faça merge quando eu disser explicitamente** ("faça o merge").
- Nunca me peça para colar tokens, senhas ou chaves no chat.
- Antes de codar uma tela nova, resuma o que entendeu do meu pedido e
  espere eu confirmar.
- O deploy "Vercel – bklit-ui" falha em todo PR e não é deste app. Os que
  importam são `dashboard` e `dashboard-4p9r`.
- Abra um PR por tarefa e me mande o link da prévia, no formato
  `https://dashboard-4p9r-git-<branch>-iamthereinerts-projects.vercel.app`.

## Tarefa 1 — Logos das empresas e mais ações (fazer primeiro)

Hoje, na página **Gráficos** (`/graficos`), as ações aparecem só com uma
bolinha colorida com a letra inicial. Quero o **logo de verdade** de cada
empresa, como no app do TradingView. Quero também **pelo menos as 50
maiores e mais conhecidas empresas** do Nasdaq, Dow Jones e S&P 500
disponíveis no app.

Onde está o código:

- `components/pages/trading/symbol-icon.tsx`: `SymbolIcon` desenha os ícones
  redondos.
  - Bandeiras para pares de moedas.
  - `BADGES` para índices, cripto e metais.
  - Para ações, cai em `hashColor` com a letra inicial. É aqui que entram os
    logos.
- `lib/markets/sections.ts`: `DEFAULT_ITEMS` é a watchlist padrão. Hoje tem
  só AAPL, NVDA e TSLA na seção "Ações".
- `lib/markets/explore.ts`: as listas da aba Explorar, incluindo "stocks".
- `components/dashboard/service-logos.tsx`: exemplo de como o projeto já
  guarda logos como SVG inline (vindos do svgl.app). Siga o mesmo padrão.
- Os símbolos seguem o padrão do Yahoo Finance (ex.: `BRK-B`, não `BRK.B`).

O que fazer:

1. Crie um mapa `ticker → logo` com SVG inline. Fonte sugerida: o pacote
   `simple-icons` (licença CC0) ou o svgl.app.
   - Mostre o logo dentro do mesmo círculo de 40 px, com a cor da marca no
     fundo e o logo branco, ou fundo branco com o logo colorido. Escolha o
     que ficar mais legível e mantenha um padrão.
   - Se uma empresa não tiver logo disponível, mantenha a letra colorida
     atual como reserva.
   - Os logos precisam ficar bons nos 3 temas (escuro, bege, claro).
2. Adicione as empresas abaixo na aba Explorar / busca de ações, com nome em
   português quando fizer sentido. Não encha a watchlist padrão: deixe ali
   umas 8 a 10 das maiores e o resto disponível para eu adicionar.
3. Lista (50, símbolos do Yahoo):
   AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AVGO, BRK-B, JPM,
   LLY, V, MA, UNH, XOM, WMT, JNJ, PG, HD, COST,
   ORCL, NFLX, ABBV, BAC, KO, PEP, CVX, MRK, ADBE, CRM,
   AMD, INTC, CSCO, MCD, DIS, NKE, IBM, QCOM, TXN, GS,
   CAT, BA, PFE, T, VZ, WFC, AXP, SBUX, PYPL, UBER.
4. Garanta que o mesmo logo apareça em todos os lugares que usam
   `SymbolIcon`:
   - watchlist (`trading-watchlist.tsx`);
   - Explorar (`explore-view.tsx`);
   - visão geral do ativo (`symbol-overview.tsx`);
   - cabeçalho do gráfico (`trading-page.tsx`).
5. Tire prints no iPhone simulado nos 3 temas e me mostre antes de abrir o
   PR.

## Tarefa 2 — Continuar o layout minimalista (depois da Tarefa 1)

O objetivo é usar o máximo da tela do celular em **todas as páginas**,
principalmente para ver os gráficos. Já foi feito, no PR #36:

- A barra do topo saiu.
- Temas, sino e perfil estão dentro da sidebar.
- O logo virou um botão flutuante que eu arrasto para qualquer lugar.
- A barra de baixo do Gráficos (Watchlist, Gráfico, Explorar, Operar,
  Diário) virou um botão flutuante expansível que também se arrasta.

Os componentes reutilizáveis são `FloatingButton` / `useFloatingPosition`
(`components/dashboard/floating-button.tsx`) e `FloatingMenu`. Para as
próximas telas, eu vou te mandar fotos com marcações dizendo o que mover,
remover ou adicionar. Faça uma tela de cada vez, sempre confirmando comigo
antes.

## Pendências que não são para agora (só se eu pedir)

- **Telegram/ICT bloqueados mesmo com o código certo.** É preciso
  configurar `PANEL_AUTH_ISSUER` e `PANEL_AUTH_JWKS_URL` no Convex
  (deployment `first-elk-379`), e `PANEL_JWT_PRIVATE_KEY` +
  `PANEL_AUTH_ISSUER` no Vercel (`dashboard-4p9r`). Os detalhes estão no
  `layout-minimalista.md`. Se a chave privada não existir, faça uma página
  que gera a chave no meu próprio aparelho, sem passar pelo chat.
- **Ferry:** ainda falta eu mandar a foto da tabela de horários de inverno.
