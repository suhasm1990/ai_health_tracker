# AI Health Tracker

A Next.js dashboard for wearable health data from the **Google Health API** (Fitbit, Pixel Watch, Apple Health via Health Connect), with a readiness score, sleep analysis, habit streaks, and an AI health coach that answers questions from your real metrics.

Runs fully offline in **Demo mode** with sample data. Connect a Google account for live data.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run lint`.

## Configuration (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For live data | OAuth 2.0 client from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | For live data | `http://localhost:3000/api/auth/callback` locally; on Vercel it is derived automatically |
| `SESSION_SECRET` | Production | Encrypts the session cookie (`openssl rand -hex 32`) |
| `GOOGLE_HEALTH_API_VERSION` | No | Defaults to `v4` |
| `NVIDIA_API_KEY` **or** `GEMINI_API_KEY` **or** `OPENAI_API_KEY` | No | Enables the AI coach. Without a key an offline advisor answers from the same data |

Custom OpenAI-compatible endpoints: set `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`.

### Google Cloud setup (live data)

1. Create a project and enable the **Google Health API**.
2. OAuth consent screen: type **External**, add your account as a test user.
3. Create an **OAuth Client ID** (Web application) with redirect URI `http://localhost:3000/api/auth/callback` (and your production URL).
4. Copy the client ID and secret into `.env.local`.

## Features

- **Readiness score (0–100)** from HRV, sleep, resting heart rate, and daily strain, with a written recommendation.
- **Daily briefing and AI coach** with tool calling over live metrics (Gemini, NVIDIA NIM, OpenAI, or offline).
- **Charts**: hourly steps and heart rate, 7-day trends, sleep stages with a clinical sleep quality index.
- **Habit streaks**, device list with battery and sync status, shareable snapshot card, installable PWA, light/dark theme.
- **API Explorer** for sending requests to Google Health endpoints and inspecting raw JSON.

## How it works

```text
src/
├── app/           page.tsx (server-rendered) + api/ routes: auth, health/{metrics,devices,raw}, chat
├── components/    UI; ui/ holds shared primitives (Panel, StatTile, ViewToggle, …)
├── hooks/         useDashboardData (client data loading), useChartTheme
└── lib/
    ├── auth.ts, session.ts     OAuth, token refresh, AES-256-GCM encrypted HTTP-only cookie
    ├── health/                 Google Health client, metrics assembly, sleep scoring, device discovery
    ├── llm/                    provider-agnostic tool-calling loop + offline advisor
    ├── readiness.ts            readiness algorithm (pure)
    └── cache.ts, mockData.ts, utils.ts, constants.ts, types.ts
```

- The server owns auth and data shaping; API responses are `private, no-store`. The client never sends provider keys or endpoints.
- Metrics are joined by calendar day, so a missing day in one Google rollup cannot shift another.
- **No invented numbers.** Missing readings show as "—" and reach the AI coach as `null`.
- **Data freshness.** Before the day's first sync, activity totals read zero and the dashboard shows a "No sync yet today" notice. Readings such as resting heart rate and sleep may show the most recent recorded day, labeled with that date.

## Deploy to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new), add the environment variables above (leave `GOOGLE_REDIRECT_URI` blank), deploy, then add `https://<your-app>.vercel.app/api/auth/callback` to the OAuth client's authorized redirect URIs.

## Security

- Tokens live only in an encrypted, HTTP-only session cookie; nothing is written to disk or shared memory.
- The OAuth callback verifies a random `state` cookie (CSRF). The API Explorer proxy only forwards relative paths to the Google Health host.

## Disclaimer

For general wellness tracking only; not a medical device. Google, Google Health, and Fitbit are trademarks of Google LLC; Apple Health is a trademark of Apple Inc. This project is independent and not endorsed by either.
