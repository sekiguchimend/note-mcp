import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Register the stealth plugin once. It patches the well-known automation
// tells (navigator.webdriver, chrome runtime, permissions, plugins, etc.).
chromium.use(StealthPlugin());

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

function parseProxy(url: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return {
      server: `${u.protocol}//${u.host}`,
      username: decodeURIComponent(u.username) || undefined,
      password: decodeURIComponent(u.password) || undefined,
    };
  } catch {
    logger.warn({ url }, "PROXY_URL is not a valid URL - ignoring");
    return undefined;
  }
}

// A fresh browser is launched per session. Because the project runs with
// "login every time", no userDataDir is persisted - but the fingerprint
// (UA, viewport, locale, timezone) is kept STABLE across runs on purpose:
// a device whose fingerprint changes every visit is itself a strong signal.
export async function launchSession(): Promise<Session> {
  const proxy = parseProxy(config.browser.proxyUrl);

  const browser = await chromium.launch({
    headless: config.browser.headless,
    proxy,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      `--lang=${config.browser.locale}`,
    ],
  });

  const context = await browser.newContext({
    userAgent: config.browser.userAgent,
    locale: config.browser.locale,
    timezoneId: config.browser.timezone,
    viewport: config.browser.viewport,
    deviceScaleFactor: 1,
    extraHTTPHeaders: { "Accept-Language": `${config.browser.locale},ja;q=0.9` },
  });

  const page = await context.newPage();

  const close = async () => {
    try {
      await context.close();
    } catch (e) {
      logger.warn({ err: String(e) }, "context close failed");
    }
    try {
      await browser.close();
    } catch (e) {
      logger.warn({ err: String(e) }, "browser close failed");
    }
  };

  return { browser, context, page, close };
}
