# Meu telefone — Android 24h no VPS controlado pela IA

Página `/ia/telefone` do app. Peças no VPS:

| Peça | Onde | O quê |
|---|---|---|
| Android 13 (Redroid) | `/opt/redroid` (`redroid-compose.yml`) | ADB só em `127.0.0.1:5555`, 2 CPU / 3 GB |
| Módulo `binder_linux` | `linux-modules-extra`, `/etc/modules-load.d/redroid.conf` | exigido pelo Redroid |
| Mobilerun 0.7.4 + Portal | `/opt/phone-agent/.venv` (`uv pip install "mobilerun[anthropic]"`) | agente que toca/digita no celular |
| Servidor | `/opt/phone-agent/server.py`, systemd `phone-agent` (`127.0.0.1:8740`) | tela, toques, tarefas, ajustes |
| HTTPS | Caddy: `phone.reinert1996.duckdns.org` → 8740 | |

Segurança: todo pedido precisa do token do painel (ES256, conferido pelo
JWKS `/api/convex/jwks/` do app), ou seja, do código de acesso. A chave da IA
é enviada pela página Ajustes e fica só em `/root/.secrets/phone-agent.json`
(0600); nunca volta para o navegador e é mascarada nos logs.

Atualizar o servidor: copie `server.py` para `/opt/phone-agent/` e
`systemctl restart phone-agent`.
