# Layout minimalista (tela cheia no celular) — passagem de trabalho

Estado em 15/10/2026. Branch `claude/tela-cheia`, PR #36 (ainda **não** foi
mergeado; só fazer merge quando o dono pedir).

Prévia: https://dashboard-4p9r-git-claude-tela-cheia-iamthereinerts-projects.vercel.app/graficos

## O que o dono pediu

Redesenhar o layout de **todas as páginas** do app no celular, de forma
minimalista, para usar o máximo da tela (principalmente ver gráficos).
Ele manda fotos de cada tela com marcações e descreve o que mudar:
componentes que mudam de lugar, funções novas e coisas a remover. O layout
de baixo deve ir para cima ou virar algo compacto.

Pedidos da primeira foto (tela Gráficos / Watchlist):

1. Mover os **3 temas** (escuro, bege, claro), que ficavam no canto superior
   direito, para **dentro da sidebar**.
2. Mover o **sino de notificações** para dentro da sidebar.
3. **Remover o texto do título** da página no topo ("Gráficos", "Telegram",
   "YouTube"…) em todas as páginas.
4. O **ícone que abre a sidebar** (logo) deve virar um círculo que ele
   **arrasta para qualquer lugar da tela** e que fica onde ele soltar.
5. A **barra de baixo** (Watchlist, Gráfico, Explorar, Operar, Diário) deve
   virar **um único ícone expansível**: toca para ver as opções e também dá
   para arrastar pela tela.

A barra de status do iPhone (hora, 5G, bateria) é do sistema; um site não
consegue escondê-la. No app instalado na Tela de Início o conteúdo já vai
por baixo dela.

## O que já foi feito (PR #36)

- `components/dashboard/app-header.tsx` foi **removido**: sem barra do topo,
  sem título e sem data. O título fica só num `h1` `sr-only` em
  `app-shell.tsx`.
- `SidebarTools` em `components/dashboard/app-sidebar.tsx`: temas, sino e
  avatar (configurações), na sidebar do desktop e no menu do celular.
- `components/dashboard/floating-button.tsx`:
  - `FloatingButton` + `useFloatingPosition`: botão redondo que se arrasta.
  - A posição é salva em `localStorage` como fração da tela.
  - Respeita as áreas de safe-area do iPhone.
  - Um toque (menos de 6 px de movimento) chama `onTap`.
  - Cópias do mesmo botão se sincronizam pelo evento `cb:floating-moved`.
- `components/dashboard/floating-menu.tsx`: o logo flutuante (até `lg`) abre
  a sidebar num `Sheet`. Chave salva: `cb:fab:menu`.
- `components/pages/trading/mobile-chrome.tsx`: `TabBar` virou um botão
  flutuante com o ícone da aba atual; um toque abre as 5 abas. Chave salva:
  `cb:fab:trading-tabs`.
- `app/globals.css`: `--header-h` agora é só `env(safe-area-inset-top)`. As
  páginas de altura total continuam usando `calc(100dvh - var(--header-h))`.

## Próximos passos

- Esperar as próximas fotos e instruções do dono, tela por tela.
- Antes de codar cada tela, resumir o que foi entendido e pedir confirmação.
- Depois, colocar tudo no mesmo PR (#36) ou num novo, se o #36 já tiver sido
  mergeado.
- Testar no Playwright com o iPhone 13 (`devices["iPhone 13"]`) em
  `pnpm dev` (porta 3004).

## Pendência separada: páginas Telegram/ICT bloqueadas mesmo com o código certo

O código de acesso (`WHATSAPP_ACCESS_CODE`) está certo, mas o Convex recusa
a chave do painel. O dono vai configurar depois. Resumo:

| Variável | Valor | Onde |
|---|---|---|
| `PANEL_AUTH_ISSUER` | endereço de produção, sem barra final (ex.: `https://dashboard-4p9r.vercel.app`) | Vercel (projeto `dashboard-4p9r`) **e** Convex (deployment `first-elk-379`) |
| `PANEL_AUTH_JWKS_URL` | o mesmo endereço + `/api/convex/jwks/` | Só no Convex |
| `PANEL_JWT_PRIVATE_KEY` | chave EC P-256 em JWK (secreta, gerada uma vez) | Só no Vercel |

- Se `PANEL_JWT_PRIVATE_KEY` não existir no Vercel, é preciso gerar uma nova.
  O plano é fazer uma página que gera a chave no próprio aparelho, para ela
  nunca passar pelo chat.
- Depois de mudar as variáveis: Redeploy no Vercel.
- O card de desbloqueio (`components/dashboard/panel-unlock.tsx`, PR #35)
  mostra o motivo exato. A rota `/api/convex/check` responde se as variáveis
  estão configuradas.

## Regras combinadas com o dono

- Merge só com aprovação explícita dele.
- Nunca pedir para colar tokens ou chaves no chat.
- Responder em português.
- O deploy `Vercel – bklit-ui` falha em todo PR e não é deste app; os que
  importam são `dashboard` e `dashboard-4p9r`.
- Ainda falta a foto da tabela de inverno do Ferry.
