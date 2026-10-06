# Casa Brasa — WhatsApp bridge

Links your WhatsApp as a device (WhatsApp Web protocol through
[Baileys](https://github.com/WhiskeySockets/Baileys), no browser) and archives
everything in Supabase for the Casa Brasa dashboard (`/whatsapp`).

- **Full history**: the phone's history sync (`syncFullHistory`) lands in
  `wa_messages`, then every new message as it arrives.
- **Media**: photos, videos, voice notes, stickers and documents are downloaded
  into the private `wa-media` bucket (old media within `MEDIA_HISTORY_DAYS`,
  files up to `MEDIA_MAX_MB`; anything else on demand).
- **Profile photos** of chats and groups (`avatars/`).
- **Session** (Baileys auth state) in `wa_auth`, so restarts never unlink.

Why not whatsapp-web.js: it drives a full Chromium, which outgrows Render's
free 512 MB as soon as the history syncs (the instance was OOM-killed).

Runs as a Docker web service on Render's free plan (`render.yaml`), kept awake
by `.github/workflows/whatsapp-keepalive.yml`. Tables: `schema.sql`.

| Env | What |
| --- | --- |
| `BRIDGE_SECRET` | Shared with the dashboard (`WHATSAPP_BRIDGE_SECRET`); 24+ chars |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key (server only) |
| `MEDIA_HISTORY_DAYS` | Archive media of older messages up to N days back (180) |
| `MEDIA_MAX_MB` | Skip larger files in the background archive (16) |

Unofficial: WhatsApp may restrict accounts that automate messages. The
dashboard only sends what you type.
