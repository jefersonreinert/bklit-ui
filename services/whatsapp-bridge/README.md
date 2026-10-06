---
title: Casa Brasa WhatsApp
emoji: 💬
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Casa Brasa — WhatsApp bridge

[whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js) running in a
Hugging Face Docker Space, used by the Casa Brasa dashboard (`/whatsapp`).

Space secrets:

| Name | What |
| --- | --- |
| `BRIDGE_SECRET` | Shared with the dashboard (`WHATSAPP_BRIDGE_SECRET`); 24+ chars |
| `HF_TOKEN` | Hugging Face token with write access to the session dataset |
| `HF_SESSION_REPO` | Private dataset that stores the WhatsApp session, e.g. `user/casa-brasa-wa-session` |

Unofficial: WhatsApp may restrict accounts that automate messages. The
dashboard only sends what you type and confirm.
