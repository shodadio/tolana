# Tolana

[![CI](https://github.com/shodadio/tolana/actions/workflows/ci.yml/badge.svg)](https://github.com/shodadio/tolana/actions/workflows/ci.yml)

A local-first Gmail messenger. Conversations open instantly from IndexedDB and
read like a chat thread, while sending, read-state and retries are handled
optimistically and reconciled with Gmail in the background.

## Requirements

- Node 20.9+ (CI checks Node 22)
- A Google Cloud OAuth client (Web) with the Gmail API enabled

## Setup

1. Install dependencies: `npm ci`
2. `cp .env.example .env`, then fill in `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` (`openssl rand -hex 32`)
3. Add `http://localhost:3000/api/auth/callback/google` as an authorised
   redirect URI on that OAuth client
4. `npm run dev` and open http://localhost:3000

`AUTH_TRUST_HOST=true` is required when running outside Vercel, and
`NEXTAUTH_URL` must match the origin the app is opened on.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm run test:e2e` | Playwright specs (starts its own server on port 3100) |

Builds, lint and typechecks also run in CI on every push and pull request via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).
