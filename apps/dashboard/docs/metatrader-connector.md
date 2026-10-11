# Conector do MetaTrader 5

Leva para o painel tudo o que o [metatrader-mcp-server](https://github.com/jefersonreinert/metatrader-mcp-server) faz:
- as ferramentas MCP do `server.py`, com os mesmos nomes, parâmetros e respostas;
- os dois extras da API HTTP (velas por datas, detalhes do símbolo);
- o WebSocket de cotações;
- a skill *Trading Terminal Assistant* (fluxos, formatação e regras), dentro do Assistente IA.

O pacote `MetaTrader5` só funciona no Windows, ao lado do terminal MT5. Por isso o servidor continua a correr no PC/VPS da pessoa. O painel liga-se a ele como cliente MCP.

## Onde aparece

| Lugar | O quê |
|-------|-------|
| **Conectores → MetaTrader 5** | endereço do servidor e transporte, cabeçalhos de autenticação do proxy, API HTTP e cotações (opcionais), testar a ligação, interruptores de negociação |
| **/metatrader** | Conta, Negociar, Mercado, Histórico, Cotações, Ferramentas e Registo (ver abaixo) |
| **Assistente IA** | `metatrader_executar` + `metatrader_parametros` (todas as ferramentas) e as instruções da skill do repositório. Só consulta até ligar "Assistente IA pode negociar". |

As abas de **/metatrader**:

| Aba | O quê |
|-----|-------|
| **Conta** | conta, posições e ordens pendentes, com fechar, cancelar e modificar SL/TP; ações em massa |
| **Negociar** | ordem a mercado (com SL/TP em dois passos) e ordem pendente |
| **Mercado** | preço ao vivo, velas, símbolos e detalhes |
| **Histórico** | deals e ordens, com totais |
| **Cotações** | WebSocket |
| **Ferramentas** | todas as ferramentas, com formulário |
| **Registo** | chamadas feitas |

## Como funciona

- `lib/metatrader/mcp.ts` é um cliente MCP sem SDK e fala os dois transportes de rede do servidor:
  - `streamable-http` (`…/mcp`, recomendado);
  - `sse` (`…/sse`, o padrão do servidor).

  Abre uma sessão por chamada (`initialize` → `tools/call` → fecho). Foi testado contra o `server.py` real (FastMCP) com um MT5 simulado, nos dois transportes.
- `convex/metatrader.ts` (tabelas `mtState` e `mtCalls`) trata do resto:
  - Guarda o endereço e os cabeçalhos. Os valores dos cabeçalhos nunca voltam ao navegador.
  - Recusa ferramentas desconhecidas.
  - Aplica os interruptores no servidor: "Permitir ordens pelo painel" e "Assistente IA pode negociar".
  - Regista cada chamada (argumentos resumidos, sem segredos).
- As respostas do servidor chegam como `DataFrame.to_csv()`, `dict` ou `list`. `lib/metatrader/data.ts` converte-as em tabelas: tira a coluna de índice do pandas e calcula os totais de lucro.
- `get_candles_by_date` e `get_symbol_info` não estão registadas no servidor MCP. Por isso o painel chama-as na API HTTP (`/api/v1/market/candles/date` e `/api/v1/market/symbol/info/{símbolo}`), se o endereço dela estiver configurado.
- As cotações ligam o navegador direto ao `metatrader-quote-server` (`wss://`). Mostram as mensagens `connected`, `tick` e `error`.

## Configuração (no PC/VPS com o MT5)

1. No MT5: **Ferramentas → Opções → Expert Advisors → Permitir negociação algorítmica**.
2. Instale o servidor: `pip install metatrader-mcp-server "mcp<2"`. A versão 0.5.1 do servidor importa `mcp.server.fastmcp`, que deixou de existir no `mcp` 2.x.
3. Arranque-o:
   ```bash
   metatrader-mcp-server --login … --password … --server … \
     --transport streamable-http --host 127.0.0.1 --port 8080
   ```
4. O protocolo MCP não tem autenticação, por isso exponha o servidor por HTTPS atrás de um proxy que a tenha. Por exemplo: Cloudflare Tunnel (`cloudflared tunnel --url http://127.0.0.1:8080`) com Cloudflare Access e um token de serviço.
5. Em **Conectores → MetaTrader 5**, preencha:
   - o URL (`https://…/mcp`);
   - os cabeçalhos do proxy, um por linha, por exemplo `CF-Access-Client-Id: …` e `CF-Access-Client-Secret: …`.

   Depois carregue em **Testar conexão**. O teste compara as ferramentas do servidor com o catálogo do painel.
6. Opcional:
   - `metatrader-http-server`, para as velas por datas e os detalhes do símbolo;
   - `metatrader-quote-server --symbols "EURUSD,XAUUSD,…"`, para as cotações (exposto como `wss://`).

O login e a senha do MT5 ficam só no PC/VPS. O painel guarda apenas o endereço e os cabeçalhos do proxy.
