// Standalone test harness (no MCP client needed).
//
//   npm run build
//   node dist/cli.js check     # load login page, report which selectors are found (NO credentials needed)
//   node dist/cli.js login     # full login (needs NOTE_EMAIL/NOTE_PASSWORD in .env)
//   node dist/cli.js post      # login + post a SAMPLE DRAFT (publish:false)
//   node dist/cli.js like <kw> # login + like up to 3 results for <kw>
//
// Tip: set HEADLESS=false in .env to watch the browser drive note.
import { launchSession } from "./browser/launch.js";
import { login, isLoggedIn } from "./auth/login.js";
import { postArticle } from "./scenarios/post.js";
import { likeByKeyword } from "./scenarios/like.js";
import { selectors, config } from "./config.js";
import { logger } from "./logger.js";
import { sleep } from "./browser/humanize.js";

async function check() {
  const s = await launchSession();
  try {
    logger.info({ url: selectors.urls.login }, "opening login page");
    await s.page.goto(selectors.urls.login, { waitUntil: "domcontentloaded" });
    await sleep(2500);

    const toCheck: Record<string, string> = {
      "login.emailInput": selectors.login.emailInput,
      "login.passwordInput": selectors.login.passwordInput,
      "login.submitButton": selectors.login.submitButton,
      "login.recaptchaWidget": selectors.login.recaptchaWidget,
      "login.codeChallengeMarker": selectors.login.codeChallengeMarker,
    };
    for (const [name, sel] of Object.entries(toCheck)) {
      const found = await s.page.locator(sel).count().catch(() => -1);
      logger.info({ check: name, found, selector: sel }, found > 0 ? "OK" : "NOT FOUND");
    }
  } finally {
    await s.close();
  }
}

async function doLogin() {
  const s = await launchSession();
  try {
    await login(s.page);
    logger.info({ loggedIn: await isLoggedIn(s.page) }, "login result");
    await sleep(2000);
  } finally {
    await s.close();
  }
}

async function doPost() {
  const s = await launchSession();
  try {
    await login(s.page);
    const result = await postArticle(s.page, {
      kind: "post",
      title: "【テスト】note-mcp 動作確認",
      body:
        "# 見出しテスト\n\nこれは **note-mcp** の動作確認です。\n\n- 箇条書き1\n- 箇条書き2\n\n> 引用のテスト\n\n普通の段落。",
      tags: [],
      publish: false, // SAFE: draft only. Change to true only when you're ready.
    });
    await s.page.screenshot({ path: "artifacts/post-test.png", fullPage: true }).catch(() => undefined);
    logger.info({ result }, "post result (screenshot: artifacts/post-test.png)");
  } finally {
    await s.close();
  }
}

async function doLike(keyword: string) {
  const s = await launchSession();
  try {
    await login(s.page);
    const result = await likeByKeyword(s.page, { kind: "like", keyword, count: 3, skipIfLiked: true });
    logger.info({ result }, "like result");
  } finally {
    await s.close();
  }
}

async function main() {
  const cmd = process.argv[2] ?? "check";
  logger.info({ cmd, headless: config.browser.headless }, "cli start");
  switch (cmd) {
    case "check":
      await check();
      break;
    case "login":
      await doLogin();
      break;
    case "post":
      await doPost();
      break;
    case "like":
      await doLike(process.argv[3] ?? "テスト");
      break;
    default:
      logger.error({ cmd }, "unknown command (use: check | login | post | like <kw>)");
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e instanceof Error ? e.stack : String(e) }, "cli failed");
    process.exit(1);
  });
