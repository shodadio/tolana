# Tolana

[![CI](https://github.com/shodadio/tolana/actions/workflows/ci.yml/badge.svg)](https://github.com/shodadio/tolana/actions/workflows/ci.yml)

Tolana is a Gmail client that treats your inbox like a messenger. Every thread is
a conversation rather than a message in a list: replies stack as chat bubbles,
your own messages sit on the right, and opening a thread is instant because the
mailbox is cached in IndexedDB on the device and synchronised with Gmail in the
background. It installs as a PWA and runs standalone on a phone, sized for the
keyboard and the safe areas of an iOS home screen.

## Why

Most mail clients are built for triage — scan a list, open a message, go back,
repeat. A lot of what people actually do in an inbox is hold a conversation, and
a chat layout suits that better: the last few messages stay visible together,
your own replies read differently from theirs, and the composer is always one
thumb-tap away at the bottom of the screen.

## What it does

- **Conversations, not message lists.** A thread renders as a stack of bubbles
  with the sender, time and body, and a composer pinned to the bottom.
- **Instant opening, even offline.** Threads and messages are stored locally with
  Dexie, so the list paints from disk before any network call and survives a
  reload. The list is ordered by the latest message in each thread.
- **Incremental sync.** The first pass after sign-in bootstraps the inbox and
  stores Gmail's `historyId`. Later passes ask only for changes since that id; if
  Gmail reports the history window has expired, the local cache is dropped and
  rebuilt instead of drifting out of date.
- **Read state that keeps up.** Opening a thread clears its unread badge locally
  straight away and removes the `UNREAD` label in Gmail in the background. If the
  Google grant has expired the local change is kept and a reconnect banner is
  shown, because the mailbox is already as read as the screen says it is.
- **Sending without waiting.** Replies and brand-new messages (To, Subject, body)
  are written to the local database first and appear immediately, then reconcile
  with the ids Gmail returns so later syncs fold them into the same conversation.
  A send that fails keeps its body and offers a Retry control.
- **Recoverable sign-in.** An expired or revoked Google grant surfaces as a
  banner with a Reconnect action rather than a broken mailbox; local data is
  untouched, and signing in again resumes syncing.

## How it works

| Area | Responsibility |
| --- | --- |
| `app/api/gmail/*` | Server route handlers that call Gmail: `bootstrap`, `delta`, `send`, `read` |
| `auth.ts` | Auth.js with Google, the `gmail.modify` scope, JWT sessions and refresh-token rotation |
| `lib/db.ts` | Dexie schema for `threads`, `messages` and `syncState`, plus the rename migration |
| `lib/sync.ts` | One sync pass — delta when a history id exists, otherwise a bootstrap — shared between concurrent callers |
| `lib/messaging.ts` | Optimistic sends, placeholder ids and reconciliation with Gmail's real ids |
| `components/` | Thread list, conversation pane, composer, new-message sheet, reconnect banner |

Gmail calls happen on the server, which holds the OAuth grant; the browser only
receives the thread and message data it caches locally. The UI is a single client
shell that switches between the thread list and the open conversation, with the
two shown side by side once the viewport is wide enough.

## Known limits

- Inbox only: no archive, labels, search or attachments yet.
- Retrying a failed send is manual, through the Retry control, rather than an
  automatic outbox that flushes when connectivity returns.
- A Google OAuth client you own is required; there is no hosted sign-in.

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
