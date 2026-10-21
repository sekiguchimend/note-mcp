import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import dotenv from "dotenv";
import type { Selectors } from "./types.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

export const config = {
  server: {
    port: num("PORT", 8787),
    host: str("HOST", "0.0.0.0"),
    authToken: str("MCP_AUTH_TOKEN"),
  },
  note: {
    email: str("NOTE_EMAIL"),
    password: str("NOTE_PASSWORD"),
  },
  browser: {
    headless: bool("HEADLESS", true),
    userAgent: str(
      "FP_USER_AGENT",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ),
    locale: str("FP_LOCALE", "ja-JP"),
    timezone: str("FP_TIMEZONE", "Asia/Tokyo"),
    viewport: {
      width: num("FP_VIEWPORT_WIDTH", 1366),
      height: num("FP_VIEWPORT_HEIGHT", 768),
    },
    proxyUrl: str("PROXY_URL"),
  },
  gmail: {
    enabled: bool("GMAIL_IMAP_ENABLED", false),
    host: str("GMAIL_IMAP_HOST", "imap.gmail.com"),
    port: num("GMAIL_IMAP_PORT", 993),
    user: str("GMAIL_IMAP_USER", str("NOTE_EMAIL")),
    password: str("GMAIL_IMAP_PASSWORD"),
    codeTimeoutSec: num("EMAIL_CODE_TIMEOUT_SEC", 120),
  },
  captcha: {
    enabled: bool("CAPTCHA_ENABLED", false),
    provider: str("CAPTCHA_PROVIDER", "2captcha"),
    apiKey: str("CAPTCHA_API_KEY"),
  },
  like: {
    dailyLimit: num("LIKE_DAILY_LIMIT", 50),
    minDelayMs: num("LIKE_MIN_DELAY_MS", 4000),
    maxDelayMs: num("LIKE_MAX_DELAY_MS", 14000),
  },
  typing: {
    minDelayMs: num("TYPE_MIN_DELAY_MS", 35),
    maxDelayMs: num("TYPE_MAX_DELAY_MS", 120),
  },
  log: {
    level: str("LOG_LEVEL", "info"),
    pretty: bool("LOG_PRETTY", true),
  },
};

export function loadSelectors(): Selectors {
  const path = resolve(projectRoot, "config", "selectors.yaml");
  const raw = readFileSync(path, "utf8");
  return parseYaml(raw) as Selectors;
}

export const selectors = loadSelectors();
