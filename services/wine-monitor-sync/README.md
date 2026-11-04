# wine-monitor-sync

Read-only mirror of **Wine Monitor Online** (By The Glass wine dispensers,
`www.remote-bytheglass.eu`) into the Casa Brasa POS → *Wine Monitor* tab.

The portal has no public API (the company's "API" permission is off and only
By The Glass / CESK can turn it on), so a headless Chromium opens the portal
with the business login every 15 minutes, reads the pages and posts one JSON
snapshot to `POST /winemonitor/sync` on the Convex deployment.

## Read-only guarantee

`sync.mjs` intercepts every request. GETs pass; any other request to the
portal is **aborted** unless it is the login form, the page's automatic
`InitialPageLoad`, or a grid's *Next Page* button. Save, edit, delete,
top-up, export and settings can never reach the portal. Requests to other
hosts (the live SignalR hub) are aborted as well. Blocked requests are
listed in the run summary.

## What is copied

| Portal page | App |
| --- | --- |
| Settings → Dispensers, Branches | machines, online status, node health |
| Reports → Dispensers (positions) | ml left in every bottle, prices, doses |
| Manage wines | 110 wines with doses and prices |
| Manage cards | prepaid and debit cards with balance / limit |
| Reports → Sales (last 24 h) | every pour, kept as history in the app |
| Reports → Credits | top-ups and tab settlements |
| Reports → Wine changes / adjustments | bottle changes |

## Install (VPS)

```sh
sudo mkdir -p /opt/wine-monitor-sync
sudo cp sync.mjs package.json /opt/wine-monitor-sync/
cd /opt/wine-monitor-sync && sudo npm install && sudo npx playwright install --with-deps chromium
# Portal login: line 1 user, line 2 password (chmod 600)
sudo install -m 600 /dev/null /root/.secrets/bytheglass
# Endpoint and shared secret (same value as Convex env WINEMONITOR_TOKEN)
sudo tee /etc/wine-monitor-sync.env >/dev/null <<'ENV'
WM_POST_URL=https://<convex-site>/winemonitor/sync
WM_TOKEN=<secret>
WM_COMPANY=vinomad
ENV
sudo chmod 600 /etc/wine-monitor-sync.env
sudo cp wine-monitor-sync.service wine-monitor-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now wine-monitor-sync.timer
```

Run once by hand: `sudo systemctl start wine-monitor-sync && journalctl -u wine-monitor-sync -n 5`.
