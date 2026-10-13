# note MCP — note.com 自動投稿・自動化 MCP サーバー (note mcp server)

> **note MCP** is a remote **Model Context Protocol (MCP) server for [note.com](https://note.com)**. It lets an AI (Claude, ChatGPT, or any MCP client) **publish articles to note automatically** — login, title, Markdown body, hashtags, and publish — by driving a real headless Chromium through note's actual UI. No private API, no reverse engineering: everything happens the way a human would click.

**日本語**: **note を自動投稿**するための **MCP サーバー**です。AI には「記事の内容」だけを生成させ、ログイン・本文入力（Markdown→note エディタ）・ハッシュタグ・公開といった操作はすべてサーバー側で固定化しています。完全ヘッドレス・リモート運用前提。

<p>
<img alt="MCP" src="https://img.shields.io/badge/protocol-MCP-black">
<img alt="note.com" src="https://img.shields.io/badge/platform-note.com-41c9b4">
<img alt="Playwright" src="https://img.shields.io/badge/engine-Playwright-2ead33">
<img alt="TypeScript" src="https://img.shields.io/badge/lang-TypeScript-3178c6">
<img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue">
</p>

**Keywords**: note mcp · note MCP server · note.com MCP · MCP note · note 自動投稿 · note 自動化 · note bot · Model Context Protocol note · Claude note 連携 · AI で note に投稿 · note API 代替 · Playwright note automation.

---

## なぜ note MCP なのか / Why note MCP

note には公開された投稿 API がありません。**note MCP** は、公式 UI をそのまま自動操作することでこの制約を回避し、AI から安全に記事を投稿できるようにします。

- 🤖 **AI は内容だけを考える** — ツールの入力は `title` / `body` (Markdown) / `tags` / `publish` のみ。クリック位置やタイミングは一切 AI に推論させない（全部サーバーで固定）。
- 📝 **Markdown をそのまま note の装飾に変換** — 見出し・太字・箇条書き・番号付きリスト・引用を、note エディタ（ProseMirror）の実キーボードショートカットで再現。
- 🔐 **完全ヘッドレスの自動ログイン** — Gmail IMAP による認証コード自動取得、2captcha 互換の CAPTCHA 解決に対応。
- 🕵️ **アンチ検知** — `playwright-extra` stealth・固定フィンガープリント・プロキシ・人間的な入力/待機。
- 🌐 **リモート MCP (Streamable HTTP)** — どの MCP クライアント（Claude Code / Claude Desktop など）からも接続可能。
- ✅ **実機検証済み** — ログイン・下書き保存・公開（ハッシュタグ＋投稿成功判定）まで実アカウントで動作確認。

## 機能 / MCP tools

| Tool | 役割 / What it does |
|---|---|
| `note_post_article` | note に記事を**投稿／下書き保存**。`title`, `body`(Markdown), `tags`, `publish`, 任意の `imageUrl`(見出し画像)。 |
| `note_like_by_keyword` | 検索キーワードで記事を**スキ**（日次上限・ランダム間隔つき）。 |
| `note_run_batch` | 複数ジョブを**1ログイン**でまとめて実行（ログイン回数を減らしアカウント保護）。 |
| `note_session_status` | ログイン可否の診断。 |

## アーキテクチャ / Architecture

```
MCP client (AI)
   │  Streamable HTTP
   ▼
note-mcp server ── thin tool layer ── serial queue ── fixed scenario layer
                                                         └─ Playwright (stealth, headless) ─▶ note.com
```

- `src/index.ts` — Express + MCP Streamable HTTP endpoint (`POST/GET/DELETE /mcp`)
- `src/tools/register.ts` — MCP tool 定義（入力は**内容のみ**）
- `src/scenarios/` — `post.ts` / `like.ts` / `markdownToEditor.ts` / `runSession.ts`
- `src/auth/` — `login.ts` / `emailCode.ts` (Gmail IMAP) / `captcha.ts`
- `src/browser/` — `launch.ts` (stealth/proxy/fingerprint) / `humanize.ts`
- `config/selectors.yaml` — note の全セレクタ。**UI 変更時はここだけ**直せばよい（コード不要）。

## セットアップ / Quick start

```bash
git clone https://github.com/sekiguchimend/note-mcp.git
cd note-mcp
npm install                 # runs `playwright install chromium`
cp .env.example .env        # fill in credentials
npm run build
npm start                   # Streamable HTTP MCP server on :8787
```

ヘッドレスサーバーでは依存を入れてください: `npx playwright install --with-deps chromium`

### `.env`（主要項目）

```ini
NOTE_EMAIL=...              # note のログインメール
NOTE_PASSWORD=...           # note のパスワード
HEADLESS=true
PROXY_URL=                  # 推奨: 住宅/モバイルプロキシ
GMAIL_IMAP_USER=            # 認証コード自動取得(アプリパスワード)
GMAIL_IMAP_PASSWORD=
CAPTCHA_API_KEY=            # reCAPTCHA が出る場合のみ (2captcha 互換)
MCP_AUTH_TOKEN=             # 任意: エンドポイント保護用 Bearer トークン
```

## 動作確認 / CLI test harness

MCP クライアント無しで単体テストできます:

```bash
npm run test:check     # ログインページのセレクタ確認（認証情報不要）
npm run test:login     # ログインのみ
npm run test:post      # ログイン＋下書き投稿（publish:false なので公開されない）
```

## MCP クライアント接続 / Connecting a client

`http://<host>:8787/mcp` に **Streamable HTTP** で接続。`MCP_AUTH_TOKEN` を設定した場合は `Authorization: Bearer <token>` を付与。

## note エディタの実挙動メモ / Verified note editor behavior

実機調査で判明した、note エディタ（ProseMirror）を正しく操作するための要点:

- note は Markdown を自動変換しない → ショートカットで装飾
- **Enter 1 回 = 改行 / Enter 2 回 = 新しい段落**（リスト内は Enter 2 回で脱出）
- 大見出し `Ctrl+Alt+2` / 小見出し `Ctrl+Alt+3` / 箇条書き `Ctrl+Shift+8` / 番号 `Ctrl+Shift+7` / 引用 `Ctrl+Shift+.` / 太字 `Ctrl+B`（斜体は非対応）

## 注意 / Disclaimer

本ツールは自分のアカウントの作業自動化を目的とした教育・研究用です。note の利用規約と、スパム/自動化に関する各種ポリシーを遵守してください。大量のスキ・短時間の連投はアカウント停止につながる可能性があります。

## License

MIT © [sekiguchimend](https://github.com/sekiguchimend)
