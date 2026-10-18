# EA CasaBrasaOHLCExport: preços do MT5 nos gráficos

O EA `public/journal/CasaBrasaOHLCExport.mq5` envia para a plataforma as velas
dos 21 tempos gráficos do MT5 (histórico + tempo real) e os ticks. Com ele, a
aba **Gráficos** usa os preços da sua corretora no lugar de Yahoo/Binance e
aceita tempos gráficos personalizados (2s, 3s, 90s, 7m, 45m, 3h, 2D, 100T…).
Ele só lê preços e nunca envia ordens. Pode rodar junto com o TradingJournal
ou o FTMO Risk Guardian, mas num gráfico separado.

## Instalação

1. **Liberar a URL:** Ferramentas → Opções → Expert Advisors → marque
   "Permitir WebRequest para as URLs listadas" e adicione
   `https://<deployment>.convex.site` (a mesma do diário).
2. **Histórico sem limite:** Ferramentas → Opções → Gráficos → "Máx. barras
   no gráfico" = **Unlimited**. Reinicie o MT5. A profundidade do histórico de
   velas e de ticks depende da corretora.
3. **Anexar:** copie o `.mq5` para `MQL5/Experts`, compile no MetaEditor e
   arraste o EA para um gráfico. Desmarque "Permitir negociação algorítmica"
   na aba Comum, já que ele não negocia.
4. **URL com o token:** em `InpUrl`, cole a URL do webhook do diário trocando
   o final `/journal/mt5` por **`/ohlc/mt5`**, mantendo o `?token=…`. Outra
   opção é deixar a URL sem token e colar o token em `InpToken`, que vai no
   cabeçalho `X-Feed-Token`.
5. **Escolher o que enviar:**
   - `InpSymbols`: vazio = ativo do gráfico; `*` = toda a Observação do
     Mercado; ou uma lista `EURUSD,XAUUSD,US30`.
   - `InpTimeframes`: `ALL` (os 21) ou uma lista `M1,M5,H1,D1`.
   - `InpTicks` (e `InpTickSymbols`): ticks em tempo real, necessários para
     os tempos em segundos e por ticks.
   - `InpBackfill`: **Sob demanda** (padrão: o gráfico pede o que falta
     quando você rola para trás), **Completo** (envia tudo até o início do
     histórico, em segundo plano) ou **Nenhum**.

Deixe o terminal aberto. O progresso fica salvo em `MQL5/Files`: se o MT5 ou
a plataforma cair, o EA reenvia o que faltou (velas e ticks) quando voltar.

## No app

- O ativo do app é ligado ao do EA pelo nome curto (EURUSD → `EURUSD`,
  `EURUSD.m`, `EURUSDm`…).
- Embaixo do gráfico aparece **MT5 (EA) · online** (ponto verde) ou
  **offline** (nada recebido há mais de 30 s; o EA manda um heartbeat a cada
  15 s quando o preço não muda).
- **+** no seletor de tempo gráfico cria um tempo personalizado, que fica nos
  favoritos (× remove). O botão **Corretora/UTC** escolhe onde começam as velas
  intradiárias personalizadas: na meia-noite da corretora (como o MT5) ou de
  UTC. Dias, semanas (começando na segunda) e meses seguem sempre a corretora.
- Tempos iguais aos do MT5 usam as velas do MT5. Múltiplos de minuto usam a
  maior vela do MT5 que divide certo (7m de M1, 45m de M15, 3h de H3). Abaixo
  de 1 minuto, os não múltiplos (90s) e os por ticks são montados a partir
  dos ticks.
- Rolar para trás carrega o histórico. Quando o trecho ainda não está na
  plataforma, aparece "Carregando histórico…" enquanto o EA envia.

## Horários

Tudo em UTC (`InpTimeUtc`). As velas D1/W1/MN1 começam na meia-noite da
corretora convertida para UTC (ex.: 21:00 UTC numa corretora UTC+3). O EA
envia `offset_sec` (corretora − UTC) em cada envio.

## Armazenamento e custo (convex/ohlc.ts)

| Dado | Onde | Por quê |
|---|---|---|
| Vela em formação dos 21 tf | `ohlcLive`, 1 linha por ativo | É reescrita a cada envio (até 2/s), por isso é pequena |
| Velas fechadas recentes | `ohlcBars`, as 5000 mais novas por série (`OHLC_KEEP_BARS`) | Uma escrita por vela fechada |
| Ticks recentes | `ohlcTicks`, blocos de 10 s, por 2 h (`OHLC_TICK_WINDOW_MS`) | Um POST acrescenta a 1–2 linhas pequenas |
| Histórico profundo | Arquivos gzip no Convex File Storage (velas por mês, ticks por dia) + índice `ohlcArchive` | 1 ano de M1 ≈ 370 mil velas por ativo: não cabe barato em tabelas |
| Pedidos do gráfico | `ohlcRequests` | Vão ao EA na resposta do webhook |

Um cron, a cada 10 min, move as velas e os ticks antigos das tabelas para os
arquivos. Para reduzir o custo do tempo real (chamadas de função e banda),
aumente `InpIntervalMs` (ex.: 1000) ou envie menos ativos.

## Testes

- `mql5/tests/OhlcExportSelfTest.mq5`: autoteste das funções puras do EA.
  Grava `PASS n` em `MQL5/Files/ohlc_selftest.txt` e os fixtures JSON usados
  em `lib/metatrader/__tests__/fixtures/`.
- `mql5/tests/ohlc-receiver.ts`: receptor local para o teste de ponta a ponta
  (`node --import tsx mql5/tests/ohlc-receiver.ts 8787 <pasta>`).
