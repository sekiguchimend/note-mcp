import type { Page } from "playwright";
import { config, selectors } from "../config.js";
import { logger } from "../logger.js";
import { humanType, humanPause, sleep } from "../browser/humanize.js";
import { fetchNoteVerificationCode } from "./emailCode.js";
import { solveRecaptchaV2 } from "./captcha.js";

const S = selectors.login;

export class LoginError extends Error {}

// Full, fixed login scenario. The AI never participates here.
// Order and selectors are hardcoded (via config); only credentials vary.
export async function login(page: Page): Promise<void> {
  if (!config.note.email || !config.note.password) {
    throw new LoginError("NOTE_EMAIL / NOTE_PASSWORD are not set");
  }

  logger.info("navigating to login page");
  await page.goto(selectors.urls.login, { waitUntil: "domcontentloaded" });
  await humanPause(800, 2000);

  // If a session somehow already exists, bail early.
  if (await isLoggedIn(page)) {
    logger.info("already logged in");
    return;
  }

  // 1) Credentials.
  await humanType(page.locator(S.emailInput).first(), config.note.email);
  await humanPause();
  await humanType(page.locator(S.passwordInput).first(), config.note.password);
  await humanPause();

  // 2) Possible reCAPTCHA before submit.
  await maybeSolveCaptcha(page);

  // 3) Submit. Prefer clicking the login button; fall back to pressing Enter
  //    in the password field (note submits the form on Enter) if the button
  //    can't be clicked.
  const submit = page.locator(S.submitButton).first();
  try {
    await submit.click({ timeout: 5000 });
  } catch {
    logger.warn("login button click failed - submitting via Enter key");
    await page.locator(S.passwordInput).first().press("Enter");
  }
  await humanPause(1500, 3000);

  // 4) Possible email-code challenge.
  await maybeHandleEmailCode(page);

  // 5) Confirm.
  await page.waitForSelector(S.loggedInMarker, { timeout: 30_000 }).catch(() => undefined);
  if (!(await isLoggedIn(page))) {
    const diag = await diagnose(page);
    logger.error({ diag }, "login failed");
    throw new LoginError(`login did not reach a logged-in state | ${diag}`);
  }
  logger.info("login succeeded");

  // IMPORTANT: note needs a few seconds to finish establishing the session
  // after login. Navigating away too soon throws the whole login away, so we
  // settle here (fixed wait) before ANY navigation happens.
  await sleep(3500);
}

// Describe where the login flow stopped so the MCP error is actionable.
async function diagnose(page: Page): Promise<string> {
  const url = page.url();
  const count = (sel: string) => page.locator(sel).count().catch(() => -1);
  const [pwField, recaptchaFrames, codeField] = await Promise.all([
    count(S.passwordInput),
    count('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]'),
    count(S.codeChallengeMarker),
  ]);
  // Any visible error/alert text near the form (e.g. wrong password).
  const alertText = await page
    .evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('[role="alert"], [aria-live], .o-error, [class*="error" i], [class*="Error"]'),
      );
      return nodes
        .map((n) => (n as HTMLElement).innerText?.trim())
        .filter((t) => t && t.length < 200)
        .slice(0, 3)
        .join(" / ");
    })
    .catch(() => "");
  await page.screenshot({ path: "artifacts/login-failed.png", fullPage: true }).catch(() => undefined);

  let stage: string;
  if (/\/login/.test(url) && pwField > 0) {
    stage = alertText
      ? "STILL_ON_LOGIN_WITH_ERROR (credentials rejected or blocked)"
      : recaptchaFrames > 0
        ? "STILL_ON_LOGIN_RECAPTCHA (bot check after submit)"
        : "STILL_ON_LOGIN_NO_MESSAGE (submit ignored or silently blocked)";
  } else if (codeField > 0) {
    stage = "CODE_CHALLENGE (verification code requested)";
  } else {
    stage = "LEFT_LOGIN_BUT_NO_MARKER (likely logged in; loggedInMarker selector outdated)";
  }
  return `stage=${stage} url=${url} alert="${alertText}" recaptchaFrames=${recaptchaFrames}`;
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  return (await page.locator(S.loggedInMarker).count()) > 0;
}

async function maybeSolveCaptcha(page: Page): Promise<void> {
  const widget = page.locator(S.recaptchaWidget).first();
  if ((await widget.count()) === 0) return;

  const sitekey = await widget.getAttribute(S.recaptchaSitekeyAttr).catch(() => null);
  if (!sitekey) {
    logger.warn("recaptcha widget present but no sitekey found");
    return;
  }
  logger.info("solving reCAPTCHA");
  const token = await solveRecaptchaV2(sitekey, page.url());
  if (!token) throw new LoginError("reCAPTCHA present and could not be solved");

  // Inject the token into the standard response field and fire callbacks.
  await page.evaluate((t) => {
    const set = (sel: string) => {
      const el = document.querySelector<HTMLTextAreaElement>(sel);
      if (el) el.value = t;
    };
    set('textarea#g-recaptcha-response');
    set('textarea[name="g-recaptcha-response"]');
    // Best-effort: trigger grecaptcha callback if the page exposes one.
    const w = window as unknown as { ___grecaptcha_cfg?: { clients?: Record<string, unknown> } };
    void w;
  }, token);
  await humanPause();
}

async function maybeHandleEmailCode(page: Page): Promise<void> {
  const challenge = page.locator(S.codeChallengeMarker).first();
  const appeared = await challenge
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;

  logger.info("email verification code challenge detected");
  const since = new Date(Date.now() - 60_000); // allow for slight clock skew
  const code = await fetchNoteVerificationCode(since);
  if (!code) throw new LoginError("verification code required but could not be read from email");

  await humanType(page.locator(S.codeInput).first(), code);
  await humanPause();
  await page.locator(S.codeSubmitButton).first().click();
  await humanPause(1500, 3000);
}
