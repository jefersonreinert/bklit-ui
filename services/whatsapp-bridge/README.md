# Casa Brasa — WhatsApp bridge

[whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js) behind a small
authenticated HTTP API, used by the Casa Brasa dashboard (`/whatsapp`).

Runs as a Docker web service on Render's free plan (`render.yaml`). The free
plan sleeps after 15 minutes without traffic, so
`.github/workflows/whatsapp-keepalive.yml` pings `/health` every 10 minutes.
The WhatsApp session is backed up to a private Hugging Face dataset
(RemoteAuth), so restarts don't unlink the device.

Environment:

| Name | What |
| --- | --- |
| `BRIDGE_SECRET` | Shared with the dashboard (`WHATSAPP_BRIDGE_SECRET`); 24+ chars |
| `HF_TOKEN` | Hugging Face token with write access to the session dataset |
| `HF_SESSION_REPO` | Private dataset that stores the session, e.g. `user/casa-brasa-wa-session` |

Unofficial: WhatsApp may restrict accounts that automate messages. The
dashboard only sends what you type.
