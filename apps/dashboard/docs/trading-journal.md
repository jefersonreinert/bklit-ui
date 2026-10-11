# Diário de trading e conector TradingView → MetaTrader

O diário fica em **Gráficos → Diário**: no telemóvel é uma aba da barra de baixo; no computador abre pelos ícones de diário e de conector na barra do gráfico.

## Backend 24 h (sem servidor próprio)

Os webhooks são HTTP actions do Convex (`convex/http.ts`), sempre ativos em `https://<deployment>.convex.site`:

| Rota | Quem chama | O quê |
|------|-----------|-------|
| `POST /journal/mt5?token=…` | Expert Advisor `CasaBrasaJournal.mq5` | negócios do MT5: um, `{deals:[…]}` (lotes) ou uma lista |
| `POST /journal/tradingview?token=…` | alertas do TradingView (webhook) | mensagem JSON do modelo ou texto livre |
| `GET /journal/ping?token=…` | testes e monitores | saúde |

- O token é gerado no painel (Conector → Gerar novo token) e comparado em tempo constante. O EA também pode enviá-lo no cabeçalho `X-Journal-Token`.
- Os negócios são gravados uma vez por `(conta, ticket)` (tabela `jrnDeals`). Por isso o EA pode reenviar o histórico sempre que reinicia.
- Os alertas do TradingView ficam guardados (os 2000 mais recentes) em `jrnSignals`. Cada operação mostra os alertas do mesmo ativo recebidos até 10 minutos antes ou depois da entrada.

## MT5: `public/journal/CasaBrasaJournal.mq5`

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
