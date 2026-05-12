# PURSUE.ARCHIVE chatbot

A floating, Gemini-powered research assistant that answers natural-language questions about the 120 declassified UAP records in the archive. It cites event IDs as `[event:ID]` tokens which render as deep-links into the existing detail panel.

## How it works

- Frontend: `<ChatLauncher>` mounted in `src/app/layout.tsx`, lazy-loads `<ChatPanel>` (next/dynamic, no SSR) so the chat bundle stays out of the initial page payload.
- Backend: `POST /api/chat` on Node.js runtime. Reads `public/data/summaries.json` + `public/data/tags.json` (cached at module scope), stuffs them into a single Gemini 2.5 Flash system prompt, and streams the response as Server-Sent Events.
- Rate limiting: Upstash Redis (optional, recommended for prod). 20 messages per IP per hour, 50 per day.
- Conversation persists in `sessionStorage` (key: `pursue.chat.history`), wiped when the tab closes.

## Get a free Gemini API key

1. Visit https://aistudio.google.com/apikey
2. Sign in with any Google account. No credit card required.
3. Click "Create API key", copy the value.

Free tier: ~1500 requests/day, 1M token context window.

## Local development

```bash
cp .env.example .env.local
# Paste your key into .env.local:
#   GEMINI_API_KEY=AIza...
npm run dev
```

Verify `.env.local` is not tracked by git:

```bash
git status   # .env.local must NOT appear
```

`.gitignore` already covers `.env*` (only `.env.example` is whitelisted).

## Production setup on Vercel

1. Go to your Vercel dashboard → `pursue` project → **Settings** → **Environment Variables**
2. Add `GEMINI_API_KEY` with the key value
3. Tick all three environments: **Production**, **Preview**, **Development**
4. Trigger a redeploy (push any commit, or click "Redeploy" on the latest deployment)

Without this variable the chat endpoint returns HTTP 503 and the UI shows "Chatbot is not configured yet." The rest of the site keeps working.

## Upstash Redis (rate limiting)

Strongly recommended for any public deployment — without it, a single abuser can burn the entire 1500 req/day Gemini quota in minutes.

1. Sign up free at https://upstash.com
2. Create a Redis database (free tier: 10k commands/day)
3. From the database page, copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Add both to Vercel env vars (same procedure as above)

If either variable is missing the server logs a warning and skips rate limiting. The chatbot still works.

## Degraded modes

| Missing | Effect |
| --- | --- |
| `GEMINI_API_KEY` | API returns 503, UI shows config error, site otherwise unaffected |
| Upstash vars | Rate limiting disabled, warning in server logs |
| Both | UI shows config error |

## Key rotation

If a key leaks:

1. Revoke immediately at https://aistudio.google.com/apikey
2. Generate a new key
3. Update Vercel env var, redeploy
4. For Upstash, rotate the token from the database settings page

Never commit a key. Pre-commit check: `git diff --staged` should never show a real `AIza...` value or an `https://*.upstash.io` URL.

## Cost expectations

- Gemini 2.5 Flash free tier: 1500 requests/day, more than enough for normal traffic
- One conversation = several requests; with the 20/hour and 50/day rate limits, a single IP can produce at most 50 chat requests/day
- If you exceed the free tier, Gemini bills are ~$0.10–$0.30 per million input tokens
- Upstash free tier: 10k commands/day. Each chat request issues 2 commands (hourly + daily limit checks). Capacity ≈ 5000 chat requests/day before the paid tier kicks in.

## Privacy

- No conversation logging on the server. We log only error messages, never message content or IPs.
- `sessionStorage` is client-only and cleared when the tab closes.
- IP addresses are used only as rate-limit keys (never stored).
