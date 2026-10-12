# Diário de trading e conector TradingView → MetaTrader

O diário fica em **Gráficos → Diário**: no telemóvel é uma aba da barra de baixo; no computador abre pelos ícones de diário e de conector na barra do gráfico.

## Backend 24 h (sem servidor próprio)

Os webhooks são HTTP actions do Convex (`convex/http.ts`), sempre ativos em `https://<deployment>.convex.site`:

| Rota | Quem chama | O quê |
|------|-----------|-------|
| `POST /journal/mt5?token=…` | EAs `TradingJournal_Complete.mq5` e `CasaBrasaJournal.mq5` | negócios do MT5: um, `{deals:[…]}` (lotes) ou uma lista |
| `POST /journal/mt5/stats?token=…` | EA `TradingJournal_Complete.mq5` | estatísticas da conta (saldo, equity, metas…) |
| `POST /journal/tradingview?token=…` | alertas do TradingView (webhook) | mensagem JSON do modelo ou texto livre |
| `GET /journal/ping?token=…` | testes e monitores | saúde |

- O token é gerado no painel (Conector → Gerar novo token) e comparado em tempo constante. O EA também pode enviá-lo no cabeçalho `X-Journal-Token`.
- Os negócios são gravados uma vez por `(conta, ticket)` (tabela `jrnDeals`). Por isso o EA pode reenviar o histórico sempre que reinicia.
- Os alertas do TradingView ficam guardados (os 2000 mais recentes) em `jrnSignals`. Cada operação mostra os alertas do mesmo ativo recebidos até 10 minutos antes ou depois da entrada.

## MT5: TradingJournal Complete (Golden Bullet v4.01, recomendado)

Código-fonte em [`jefersonreinert/golden-bullet-mt5-convex`](https://github.com/jefersonreinert/golden-bullet-mt5-convex). O painel serve a pasta `MQL5` em `public/journal/GoldenBullet-TradingJournal-MT5.zip` (Conector → Baixar). Para atualizar o .zip, rode `zip -rX9` na pasta `MQL5` do repositório do EA.

Instalação:
1. Copie a pasta `MQL5` do .zip para a pasta de dados do terminal (Arquivo → Abrir pasta de dados) e compile `Experts/Golden Bullet/TradingJournal_Complete.mq5` (F7).
2. Em Ferramentas → Opções → Expert Advisors, permita o WebRequest para `https://<deployment>.convex.site`.
3. Arraste o EA para um gráfico e cole o URL do webhook MT5 (Conector) em `InpUrl`. Ele troca só o caminho para `/journal/mt5/stats`.

### `POST /journal/mt5`: campos extra do negócio de saída

Todos opcionais (`lib/journal/ingest.ts`, `normalizeDeal`). Ficam em `jrnDeals` com os nomes da direita:

| EA | Painel | Significado |
|----|--------|-------------|
| `rr` | `rr` | R:R planejado, \|TP − entrada\| / \|entrada − SL\| |
| `risk_pct` | `riskPct` | risco em fração do saldo (0.01 = 1 %) |
| `risk_usd` | `riskUsd` | risco em dinheiro até ao SL |
| `profit_points` | `profitPoints` | resultado em pontos |
| `duration_sec` | `durationSec` | duração entrada → saída |
| `outcome` | `outcome` | `win` / `loss` / `breakeven` |
| `equity`, `balance` | `equityAt`, `balanceAt` | snapshot **no momento do envio** (no histórico não é o da hora do trade) |
| `account_type` | `accountType` | Personal, Back-Testing, Prop-Valuation, Prop-Funding |
| `market` | `market` | Forex, Commodities, Equities, Cryptocurrencies |

Reenviar um negócio que já existe atualiza-o e preenche os extras que faltavam. Um extra ausente na nova cópia não apaga o que está guardado. Em fechos parciais, a operação soma o risco e os pontos das saídas e usa o último `outcome`. Sem `market`, o painel deduz o mercado do símbolo com a mesma regra do EA.

### `POST /journal/mt5/stats`: estatísticas da conta

Corpo: `{ account, server, name, holder, currency, account_type, time, stats }`, com `stats` igual ao `SAccountStats` do EA (`STAT_KEYS` em `lib/journal/account.ts`). Respostas: `200 {ok:true}`, `400 bad_json` ou `missing_account`, `401 unauthorized`, `413 too_large`.

- `jrnAccountStats`: o último snapshot de cada conta (upsert por `account`).
- `jrnStatsHistory`: um snapshot por conta e por dia do servidor (o último do dia substitui o anterior), com saldo, equity, lucro líquido, resultado do dia, acerto, PF, depósito inicial e levantamentos. Alimenta o gráfico saldo × equity e os marcadores de depósito e levantamento.
- Queries: `accountStats({account?})`, `statsHistory({account, from?})` e `accountCheck({account})`, que compara as saídas e o lucro líquido do EA com os negócios guardados.

As métricas derivadas dos trades (acerto, PF, Sharpe, drawdown…) continuam calculadas no painel a partir dos negócios, que são a fonte de verdade. As do EA servem para o que só o terminal sabe.

### Interface

- **Resumo → Conta MT5**:
  - saldo, equity, margem livre, depósito inicial, levantamentos e crescimento;
  - hoje, semana e mês na hora do servidor (o `dailyDrawdown` é mostrado como resultado do dia sobre o saldo inicial do dia);
  - metas semanal e mensal;
  - "EA offline" após 15 min sem dados com o mercado aberto;
  - verificação EA × painel ("Sincronizado com o MT5" quando as operações fechadas e o lucro líquido batem);
  - saldo real da conta: curva reconstruída desde o primeiro depósito com os depósitos, levantamentos e operações (EA v4.01), comparada com o saldo do MT5; com EAs anteriores, o gráfico saldo × equity dos snapshots diários.
- **Só dados reais**: o diário abre na conta com atividade mais recente do EA e no período "Tudo" (os mesmos totais do histórico do MT5). Várias contas nunca se somam por defeito ("Todas as contas (somadas)" é uma opção explícita). O painel já não cria dados fictícios; se ainda houver os de versões anteriores (conta `DEMO`), aparece um aviso para os remover.
- **Operações**:
  - colunas que se podem ocultar: R:R planejado, R realizado, risco %, risco $, pontos, duração, mercado e outcome;
  - campos das notas como no Notion: Bias, Trade type, Entry timeframe, Entry macro, News impact e Psychology (opções editáveis no Conector).
- **Ativos e modelos**: breakdowns por mercado, tipo de conta e por cada campo das notas, com risco médio, R:R planejado e pontos.
- **Entry macro**: automática pela hora de entrada em Nova York (`macroOf` em `analytics.ts`), salvo se a nota a definir.
- **News impact**: o editor sugere High ou Medium a partir dos eventos do calendário económico da moeda do ativo até 15 min antes ou depois da entrada.

### Fuso horário

`time_msc` vem na hora do servidor da corretora (IC Markets: UTC+3 no horário de verão dos EUA, UTC+2 no resto do ano), não em UTC. Os negócios ficam guardados nesse relógio e a query `journal.deals` devolve-os **já em UTC** (`lib/journal/time.ts`), por isso todos os gráficos, o calendário, a hora e o dia da semana batem com o MT5 (mostrados no fuso escolhido: local, Nova York ou UTC).

- O desvio vem do EA: `server_offset_sec` (servidor − UTC) em cada envio de negócios e de estatísticas (EA v4.01 e `CasaBrasaJournal.mq5`). Sem ele, o painel estima-o pelo snapshot de estatísticas (hora do servidor menos hora de receção).
- Corretoras em "New York close" (+2 h / +3 h) mudam com o horário de verão dos EUA: um negócio antigo usa o desvio da sua data, não o de hoje.

### Depósitos e levantamentos

O EA v4.01 envia também os movimentos de saldo que não são trades (`type: "balance"`, com `kind` deposit, withdrawal, credit, bonus, correction, interest ou charge, e `amount`) no mesmo `POST /journal/mt5`. Ficam na tabela `jrnCash` (um por `(conta, ticket)`) e servem para a curva de saldo real.

### Contagem igual no EA e no painel

Desde a v4.01, o EA conta **uma operação por posição** (fechos parciais somam-se), com o resultado líquido = lucro + comissões de entrada e saída + swap + taxa, ganho > 0, perda < 0 e zero = breakeven. É a mesma regra do painel, por isso a verificação EA × painel deve bater a 100 %.

## MT5 (versão simples): `public/journal/CasaBrasaJournal.mq5`

- No arranque envia o histórico (`InpHistoryDays`, 90 por defeito), em lotes de 100.
- Depois envia cada negócio em `OnTradeTransaction` (`TRADE_TRANSACTION_DEAL_ADD`), com conta, ticket, posição, símbolo, tipo, entrada, volume, preço, SL, TP, lucro, comissão, swap, taxa, magic, comentário e `time_msc`.
- Se o envio falhar, o negócio fica numa fila em memória e é reenviado a cada `InpRetrySeconds` (mínimo 5 s).
- Instalação:
  1. Copie o ficheiro para `MQL5/Experts` e compile-o no MetaEditor (F7).
  2. Em Ferramentas → Opções → Expert Advisors, permita o WebRequest para o URL `https://<deployment>.convex.site`.
  3. Cole o URL do webhook MT5 em `InpUrl` e arraste o EA para um gráfico.
- O EA regista tudo o que acontece na conta: ordens manuais, de outros EAs e as que o [tradingview-to-metatrader5](https://github.com/abhidp/tradingview-to-metatrader5) copia do TradingView (esse projeto corre localmente no Windows, com proxy, Redis e MT5).

## Métricas (`lib/journal/metrics.ts`)

Os negócios são agrupados em operações por posição. O preço de entrada e o de saída são médias ponderadas pelo volume. O resultado líquido é lucro + comissão + swap + taxa. O R mede o movimento do preço face à distância ao primeiro SL.

Estatísticas calculadas:
- resultado líquido, taxa de acerto, profit factor, expectativa;
- ganho e perda médios, payoff;
- drawdown máximo do acumulado;
- R médio, duração média, melhor e pior operação, custos;
- sequências de ganhos e de perdas.

Gráficos e tabelas:
- curva de capital;
- calendário de resultado por dia;
- resultado por ativo, compra × venda, dia da semana e hora de entrada.

Cada operação aceita notas: setup, tags, avaliação da execução e texto livre (tabela `jrnNotes`).
