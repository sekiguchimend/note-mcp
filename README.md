# note-mcp

A **remote MCP server** that automates [note.com](https://note.com) **entirely through a headless Chromium** — login, article posting, and keyword-based liking (スキ). No private API is called: every action is performed by driving the real note UI, exactly as a human would.

Design principle: **the AI only produces content** (title / body / tags / keyword / count). All "where to click / when / in what order" is fixed in the server (selectors live in `config/selectors.yaml`). The AI never reasons about operations.

## What it does

| MCP tool | Purpose |
|---|---|
| `note_post_article` | Post (or save as draft) an article. Body is Markdown; formatting is reproduced in note's editor. |
| `note_like_by_keyword` | Search a keyword and like the newest N results, with a daily limit + randomized pacing. |
| `note_run_batch` | Run several post/like jobs under **one login** (recommended — fewer logins = lower ban risk). |
| `note_session_status` | Diagnostic: can the configured account log in right now? |

## Chosen operating profile

Per the project decisions, this build runs the **most aggressive** profile:

- **Login every run** (no persisted session). To offset ban risk, batch jobs under one login via `note_run_batch`.
- **Fully headless auto-login**, including:
  - **Email verification codes** auto-read from Gmail over IMAP (`src/auth/emailCode.ts`).
  - **reCAPTCHA** solved via a 2captcha-compatible service (`src/auth/captcha.ts`).
- **Anti-detection**: `playwright-extra` + stealth plugin, a **stable** fingerprint, residential/mobile **proxy**, and human-like typing/click pacing.

> ⚠️ Headless + login-every-run is the highest-ban-risk combination. The safeguards above reduce — but do not eliminate — the risk. Use a proxy and keep like volumes modest.

## Architecture

```
MCP (Streamable HTTP) → Tool layer (thin) → serial queue → scenario layer (fixed steps)
                                                              → Playwright (stealth, headless)
```

- `src/index.ts` — Express + MCP Streamable HTTP endpoint (`POST/GET/DELETE /mcp`).
- `src/tools/register.ts` — MCP tool definitions (content-only inputs).
- `src/queue.ts` — serial queue so only one browser runs at a time.
- `src/scenarios/` — `post.ts`, `like.ts`, `markdownToEditor.ts`, `runSession.ts`, `likeBudget.ts`.
- `src/auth/` — `login.ts`, `emailCode.ts`, `captcha.ts`.
- `src/browser/` — `launch.ts` (stealth/proxy/fingerprint), `humanize.ts`.
- `config/selectors.yaml` — **all** note selectors/URLs. The only file to touch when note changes its UI.

## Setup

```bash
npm install            # also runs `playwright install chromium`
cp .env.example .env   # fill in credentials & services
npm run build
npm start
```

For headless servers, run Chromium with the OS deps installed (`npx playwright install-deps chromium`).

### Required `.env` values

- `NOTE_EMAIL`, `NOTE_PASSWORD`
- `GMAIL_IMAP_USER`, `GMAIL_IMAP_PASSWORD` (Gmail **app password**, IMAP enabled) — for verification codes
- `PROXY_URL` — strongly recommended (residential/mobile)
- `CAPTCHA_API_KEY` + `CAPTCHA_ENABLED=true` — only if note challenges with reCAPTCHA
- `MCP_AUTH_TOKEN` — optional bearer token to protect the remote endpoint

## ⚠️ Selectors must be verified

`config/selectors.yaml` ships with **best-effort placeholder selectors**. note.com's real DOM (class names, data-testids, the ProseMirror editor, the publish flow, the search/like markup) must be confirmed against the live site and the YAML updated before production use. Nothing in the code needs to change — only the YAML.

The Markdown→editor translator (`markdownToEditor.ts`) relies on note's live input autoformatting (`# `, `- `, `> `, fenced code) plus `Ctrl+B`/`Ctrl+I` for inline styles. If note's editor behaves differently, adjust that file.

## Connecting a client

Point an MCP client at `http://<host>:<PORT>/mcp` using the **Streamable HTTP** transport. If `MCP_AUTH_TOKEN` is set, send `Authorization: Bearer <token>`.
