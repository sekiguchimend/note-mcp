import { config } from "../config.js";
import { logger } from "../logger.js";
import { sleep } from "../browser/humanize.js";

// 2captcha-compatible reCAPTCHA v2 solver.
// Returns the g-recaptcha-response token, or null if solving is disabled/fails.
export async function solveRecaptchaV2(sitekey: string, pageUrl: string): Promise<string | null> {
  if (!config.captcha.enabled || !config.captcha.apiKey) {
    logger.warn("CAPTCHA encountered but solver is disabled (CAPTCHA_ENABLED/CAPTCHA_API_KEY)");
    return null;
  }
  const key = config.captcha.apiKey;

  // 1) Submit the task.
  const inUrl = new URL("https://2captcha.com/in.php");
  inUrl.searchParams.set("key", key);
  inUrl.searchParams.set("method", "userrecaptcha");
  inUrl.searchParams.set("googlekey", sitekey);
  inUrl.searchParams.set("pageurl", pageUrl);
  inUrl.searchParams.set("json", "1");

  const submit = await fetch(inUrl, { method: "POST" }).then((r) => r.json() as Promise<{ status: number; request: string }>);
  if (submit.status !== 1) {
    logger.error({ submit }, "captcha submit failed");
    return null;
  }
  const id = submit.request;
  logger.info({ id }, "captcha task submitted, polling for solution");

  // 2) Poll for the solution (2captcha needs ~15-40s typically).
  const resUrl = new URL("https://2captcha.com/res.php");
  resUrl.searchParams.set("key", key);
  resUrl.searchParams.set("action", "get");
  resUrl.searchParams.set("id", id);
  resUrl.searchParams.set("json", "1");

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const res = await fetch(resUrl).then((r) => r.json() as Promise<{ status: number; request: string }>);
    if (res.status === 1) {
      logger.info("captcha solved");
      return res.request;
    }
    if (res.request !== "CAPCHA_NOT_READY") {
      logger.error({ res }, "captcha solving error");
      return null;
    }
  }
  logger.error("captcha solving timed out");
  return null;
}
