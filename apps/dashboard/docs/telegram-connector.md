# Conector do Telegram

Espelha o [mcp-telegram](https://github.com/mcp-telegram/mcp-telegram) no painel: a conta pessoal do Telegram (userbot via MTProto/GramJS, não um bot) com **todas as ferramentas do pacote** `@overpod/mcp-telegram` — mensagens, conversas, grupos, mídia, contatos, reações, enquetes, agendadas, rascunhos, tópicos, figurinhas, stories, pastas, privacidade, Business, boosts, estatísticas, e os grupos opcionais (Stars, chamadas em grupo, respostas rápidas).

## Onde aparece

| Lugar | O quê |
|-------|-------|
| **Conectores → Telegram** | credenciais, login (QR ou número + código, 2FA), testar, desconectar, permissões do assistente, grupos opcionais, atividade recente |
| **/telegram** | Conversas (lista, histórico, responder, anexar, marcar como lida), Buscar (todas as conversas) e Ferramentas (todas, com formulário gerado do schema) |
| **Assistente IA** | `telegram_executar` + `telegram_parametros` (todas as ferramentas). Só leitura até ligar "Assistente pode enviar e alterar". |

## Como funciona

- `convex/mtproto.ts` (Node action) roda as ferramentas do pacote por um cliente MCP em memória (`registerTools` + `InMemoryTransport`), então validação de argumentos e textos de saída são exatamente os do mcp-telegram.
- A sessão (GramJS `StringSession`) fica na tabela `tgState` do Convex; cada chamada conecta, executa e desconecta. Um lock (`acquire`/`release`) impede duas conexões simultâneas com a mesma chave (evita `AUTH_KEY_DUPLICATED`).
- O login é feito em passos que sobrevivem entre chamadas serverless: a sessão temporária fica em `tgState.pending` (QR: `auth.exportLoginToken` repetido até `LoginTokenSuccess`; número: `auth.sendCode` → `auth.signIn`; 2FA: SRP `auth.checkPassword`). A senha 2FA nunca é guardada.
- Arquivos: parâmetros de caminho (`filePath`, `photoPath`, itens de álbum) só aceitam arquivos enviados pelo navegador (gravados numa pasta temporária); caminhos do servidor são recusados. Downloads (`downloadPath`, `savePath`) voltam ao navegador como arquivo.
- `telegram-login` / `telegram-logout` do pacote são substituídos pelo fluxo do painel.

## Configuração

1. Em **my.telegram.org → API development tools**, crie uma app e copie `api_id` e `api_hash`.
2. Em **Conectores → Telegram**, cole os dois (ficam só no Convex) — ou defina `TELEGRAM_API_ID` e `TELEGRAM_API_HASH` nas variáveis do Convex (têm prioridade).
3. Entre com **QR code** (Telegram → Configurações → Dispositivos → Conectar dispositivo) ou com o **número** (+ código; + senha se houver verificação em duas etapas).

## Atualizar o pacote

```bash
pnpm --filter dashboard add @overpod/mcp-telegram@<versão> telegram@<versão que ele usa>
node apps/dashboard/scripts/gen-telegram-catalog.mjs   # regenera lib/telegram/tool-catalog.json
```

`convex.json` marca `telegram` e `big-integer` como pacotes externos do Node (instalados pelo Convex no deploy).

## Testes

`pnpm --filter dashboard test` — `lib/telegram/__tests__` (catálogo, passos de login com as classes reais do GramJS, arquivos, a action `callTool` sem rede) e `convex/telegram.test.ts` (estado nunca expõe hash/sessão, lock, configurações).
