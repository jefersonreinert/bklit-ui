# The Inner Circle Trader — ICT Monitor

Sidebar → **The Inner Circle Trader** (`/ict`). Monitors the X account
[@I_Am_The_ICT](https://x.com/i_am_the_ict), stores every post and analyses
it with Grok (xAI).

## How it works

| Part | Where |
| --- | --- |
| Scheduler | `convex/crons.ts` — every 5 min on the Convex servers (runs with the panel closed) |
| Collection + analysis | `convex/ict.ts` (`tick`, `analyze`) |
| X API client | `lib/ict/x-client.ts` — `GET /2/users/by/username/:u`, `GET /2/users/:id/tweets` |
| Grok client | `lib/ict/grok.ts` — `POST https://api.x.ai/v1/chat/completions` with a JSON schema |
| Tables | `ictPosts`, `ictAnalyses`, `ictAlerts`, `ictState` in `convex/schema.ts` |
| Page | `components/pages/ict/*` — subscribes to Convex, updates in real time |

- **Monitoring method:** periodic timeline reads with `since_id`
  (configurable interval, default 15 min, minimum 5). The Filtered Stream
  needs a permanently open connection, which neither Convex functions nor
  Cloudflare Workers keep; it is not used.
- **Recovery:** the cursor (`sinceId`) only moves after the whole gap was
  read; long gaps continue on the next run from the saved pagination token.
  A lock prevents two runs at once; posts are unique by `postId` (checked
  inside a transaction).
- **Errors:** 401/403 → "Erro de autenticação"; 429 → waits until
  `x-rate-limit-reset`; 5xx/network → retries with exponential backoff and
  then backs off 5, 10, 20… min (max 2 h). Logs are JSON lines (`scope: ict`)
  in the Convex dashboard → Logs.
- **Grok:** one request per new post (max 10 queued per run), up to 3
  attempts. Results are validated and kept; a failed analysis never removes
  the post, and a re-analysis keeps the previous result until the new one
  succeeds.

## Configuration (secrets stay on the server)

Convex dashboard → your deployment → **Settings → Environment Variables**:

| Variable | Required | |
| --- | --- | --- |
| `X_BEARER_TOKEN` | yes | X API v2 app-only Bearer token (developer.x.com → your app → Keys and tokens) |
| `XAI_API_KEY` | for AI | xAI API key (console.x.ai) |
| `XAI_MODEL` | no | e.g. `grok-4`; when empty the first Grok text model listed by `GET /v1/models` is used |

GitHub → Settings → Secrets → Actions: `CONVEX_DEPLOY_KEY` (Convex →
Settings → Deploy key, production). With it, the Cloudflare workflow runs
`npx convex deploy` before publishing the site.

## Costs

- X: every due run makes one timeline request (plus one per extra page and
  one, once, to resolve the user id). The first run reads up to 200 posts of
  history. Billing depends on your X API plan.
- xAI: one chat completion per analysed post or "Reanalisar". Nothing is
  sent to Grok when there are no new posts; turning "Análise por IA" off
  keeps collecting without spending xAI credits.

## Tests

`pnpm --filter dashboard test` — `lib/ict/__tests__` (node:test: X client,
Grok validation, alerts, no secrets in browser code) and `convex/ict.test.ts`
(convex-test: storage, duplicates, recovery, rate limits, auth errors,
failed analyses, search, alerts, endpoint protection). All APIs are mocked.
