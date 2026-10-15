# Prompt para o próximo Claude Code (copie tudo abaixo da linha)

Estado de referência: commit `4197ca4` no `main` (PRs #36 e #37).

---

Você vai continuar o desenvolvimento do meu app **Casa Brasa**. É um painel
pessoal e do meu restaurante que uso principalmente no **iPhone**, instalado
na Tela de Início. Fale comigo sempre em **português**, de forma simples e
direta. Eu não sou programador.

## Onde está o projeto

- Repositório GitHub: `jefersonreinert/bklit-ui`, branch **`main`**.
- Comece pelo commit `4197ca4`: "Gráficos: logos das 50 maiores empresas +
  tela cheia com botões flutuantes (#37, #36)". Esse é o estado aprovado.
- O app fica em **`apps/dashboard`**. O resto do monorepo (`apps/web`,
  `packages/ui`) é a biblioteca de gráficos bklit-ui, que eu não estou
  mexendo agora.
- Stack:
  - Next.js 16 (turbopack, `trailingSlash`), React 19 e Tailwind 4;
  - pnpm (monorepo) e Biome/ultracite (lint; o pre-commit roda
    `npx ultracite fix`);
  - Convex (banco e tempo real; pasta `apps/dashboard/convex`);
  - `motion` (framer-motion).
- Testes:
  - `pnpm test` dentro de `apps/dashboard`: `node --test` com tsx em
    `lib/**/__tests__` e vitest com convex-test em `convex/*.test.ts`.
  - Typecheck: `npx tsc --noEmit -p .`.
- Rodar local: `pnpm dev` em `apps/dashboard`, na porta **3004**.
  - Teste no Playwright simulando o iPhone 13 (`devices["iPhone 13"]`) e
    mostre prints antes de me pedir para aprovar.
  - Para esconder o aviso "Instale o app", use
    `localStorage.setItem("casa-brasa-install-hint","1")`.
  - Para trocar de tema, use `localStorage.theme`, com `"dark"`, `"beige"` ou
    `"light"`.

## Deploy

- **Vercel**: o projeto que eu uso é **`dashboard-4p9r`**. Existe também o
  `dashboard`.
  - Cada PR gera uma prévia em
    `https://dashboard-4p9r-git-<branch>-iamthereinerts-projects.vercel.app`.
    Quando o nome da branch é longo, o Vercel encurta. Pegue o link no
    comentário do bot do Vercel no PR.
  - O deploy **"Vercel – bklit-ui" falha em todo PR**. Ele não é deste app;
    ignore (só deixe um comentário no PR dizendo isso).
- **Cloudflare**: um workflow do GitHub roda `npx convex deploy` (Convex
  `first-elk-379`) e publica o worker em
  `https://casa-brasa.casabrasa.workers.dev`.

## Regras combinadas (siga sempre)

1. **Merge só quando eu disser explicitamente** ("faça o merge").
2. Nunca me peça para colar tokens, senhas ou chaves no chat.
3. Antes de codar uma tela nova, **resuma o que entendeu e espere eu
   confirmar**.
4. **Um PR por tarefa**, com o link da prévia.
   - Se um PR anterior ainda não foi mergeado, comece o próximo **em cima
     dele**, e não do `main`. Senão a prévia parece "voltar atrás".
   - Esse erro já aconteceu uma vez e eu não gostei.
5. Não reimplemente o que já existe; reaproveite os componentes.
6. Mantenha o padrão do código: comentários curtos em inglês, textos da
   interface em português.

## Como o app está hoje (o que já foi feito)

**Layout tela cheia, para usar o máximo da tela do celular:**
- Não existe mais a barra do topo nem o título da página. O nome fica só num
  `h1` invisível (`sr-only`) em `components/dashboard/app-shell.tsx`.
- Temas (escuro, bege, claro), sino de notificações e perfil ficam **dentro
  da sidebar**: `SidebarTools` em `components/dashboard/app-sidebar.tsx`.
- No celular, o menu é um **botão redondo flutuante com o logo**, que eu
  arrasto para qualquer lugar e que fica onde eu soltar.
  - Fica em `components/dashboard/floating-menu.tsx`.
  - Usa `FloatingButton` / `useFloatingPosition`
    (`components/dashboard/floating-button.tsx`): a posição é salva no
    `localStorage` como fração da tela.
- Na página **Gráficos** (`/graficos`), as abas Watchlist, Gráfico, Explorar,
  Operar e Diário viraram **um botão flutuante expansível**, que também se
  arrasta (`TabBar` em `components/pages/trading/mobile-chrome.tsx`).
- `--header-h` em `app/globals.css` agora é só `env(safe-area-inset-top)`.

**Logos das ações:**
- 50 SVGs em `public/logos/stocks/<TICKER>.svg`.
- Usados por `SymbolIcon` (`components/pages/trading/symbol-icon.tsx`) através
  de `STOCK_LOGOS` / `stockLogoSrc`.
- A aba Explorar tem "Ações EUA" (50 empresas) e "Brasil"
  (`lib/markets/explore.ts`).

**Outras coisas que já existem:**
- **Início** (`/`): tela com widgets, papel de parede (foto ou vídeo) e Dock
  (Magic UI, em `components/ui/dock.tsx`).
- **POS**: só com PIN por usuário.
- Escala de trabalho, Ferry, Telegram, ICT, Diário de trading, MetaTrader,
  WhatsApp, E-mail, IA, Notas, Finanças, Cardápio, Documentos e outras páginas.
  A lista completa está em `lib/nav.ts`.

## Próximas tarefas (nesta ordem)

1. **Barra de desenho do gráfico** (Gráficos → Gráfico, quando eu toco no
   lápis para desenhar no canvas dos candlesticks).
   - Hoje ela é **branca** e o contorno/destaque é **azul** (`#2962ff`). Eu
     não gosto de azul.
   - Ela deve seguir o **tema**. No tema **bege**, um bege mais forte e as
     cores da Anthropic: terracota `#d97757`, preto `#141413`, creme
     `#faf9f5`, cinzas `#b0aea5` e `#e8e6dc`.
   - Ícones com contorno **preto** no tema claro/bege e **branco** no escuro.
   - Comece procurando `#2962ff` e as barras de ferramenta em
     `components/pages/trading/` (`mobile-chrome.tsx`, `trading-page.tsx`, `trading-watchlist.tsx`,
     `trading-tools.tsx` e `mt5/tv/drawing-engine.ts`).
2. Depois, levar essas **mesmas cores e ícones para todas as páginas**,
   para o app ficar com um design único.
3. Continuar o **layout minimalista tela por tela**. Eu mando fotos com
   marcações do que mover, remover ou adicionar. Use os mesmos botões
   flutuantes; todas as páginas devem aproveitar o máximo da tela.

## Pendências (só se eu pedir)

- **Telegram/ICT continuam bloqueados mesmo com o código certo.** O
  `WHATSAPP_ACCESS_CODE` está certo, mas o Convex recusa a chave do painel.
  Para resolver:
  - No Convex (`first-elk-379`): definir `PANEL_AUTH_ISSUER` = endereço de
    produção, sem barra final, e `PANEL_AUTH_JWKS_URL` = endereço +
    `/api/convex/jwks/`.
  - No Vercel `dashboard-4p9r`: definir `PANEL_JWT_PRIVATE_KEY` (JWK EC P-256)
    e `PANEL_AUTH_ISSUER`, e fazer Redeploy.
  - O card `components/dashboard/panel-unlock.tsx` e a rota
    `/api/convex/check` mostram o motivo exato do bloqueio.
  - Se a chave privada não existir, faça uma página que gera a chave no meu
    próprio aparelho, sem passar pelo chat.
- **Ferry**: falta eu mandar a foto da tabela de horários de inverno.

Mais detalhes em `apps/dashboard/docs/layout-minimalista.md` e
`AGENTS.md` (raiz). Leia esses arquivos antes de
começar.
