import type { Locator, Page } from "playwright";
import { config, selectors } from "../config.js";
import { logger } from "../logger.js";
import { humanPause, randInt, sleep } from "../browser/humanize.js";
import { consumeLikeBudget } from "./likeBudget.js";
import type { LikeJob, LikeResult } from "../types.js";

const SE = selectors.search;

// Fixed "like by keyword" scenario with built-in anti-spam pacing.
export async function likeByKeyword(page: Page, job: LikeJob): Promise<LikeResult> {
  const keyword = job.keyword.trim();
  logger.info({ keyword, count: job.count }, "starting like scenario");

  // Respect the daily budget BEFORE doing anything.
  const budget = consumeLikeBudget(0);
  if (budget.remaining <= 0) {
    return {
      kind: "like",
      ok: false,
      liked: 0,
      skipped: 0,
      keyword,
      message: `daily like limit (${config.like.dailyLimit}) already reached`,
    };
  }

  const target = Math.min(job.count, budget.remaining);
  const url = selectors.urls.search.replace("{q}", encodeURIComponent(keyword));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(1500, 3000);

  let liked = 0;
  let skipped = 0;
  const seen = new Set<string>();
  let dryScrolls = 0;

  while (liked < target && dryScrolls < 4) {
    const cards = page.locator(SE.resultCard);
    const n = await cards.count();
    let progressedThisPass = false;

    for (let i = 0; i < n && liked < target; i++) {
      const card = cards.nth(i);
      const sig = await cardSignature(card, i);
      if (seen.has(sig)) continue;
      seen.add(sig);
      progressedThisPass = true;

      const likeBtn = card.locator(SE.likeButton).first();
      if ((await likeBtn.count()) === 0) continue;

      if (job.skipIfLiked && (await isLiked(likeBtn))) {
        skipped++;
        continue;
      }

      // Enforce the daily budget atomically per click.
      if (consumeLikeBudget(1).granted === 0) {
        logger.info("daily like budget exhausted mid-run");
        return done(keyword, liked, skipped, "daily budget exhausted");
      }

      await likeBtn.scrollIntoViewIfNeeded().catch(() => undefined);
      await humanPause(500, 1500);
      await likeBtn.click().catch((e) => logger.warn({ err: String(e) }, "like click failed"));
      liked++;
      logger.info({ liked, target }, "liked a post");

      // Human-like gap between likes.
      await sleep(randInt(config.like.minDelayMs, config.like.maxDelayMs));
    }

    if (!progressedThisPass) {
      dryScrolls++;
    } else {
      dryScrolls = 0;
    }

    // Load more results.
    await page.mouse.wheel(0, SE.scrollStepPx);
    await humanPause(1200, 2600);
  }

  return done(keyword, liked, skipped, "completed");
}

function done(keyword: string, liked: number, skipped: number, message: string): LikeResult {
  logger.info({ keyword, liked, skipped, message }, "like scenario finished");
  return { kind: "like", ok: true, liked, skipped, keyword, message };
}

async function isLiked(likeBtn: Locator): Promise<boolean> {
  const pressed = await likeBtn.getAttribute("aria-pressed").catch(() => null);
  if (pressed === selectors.search.likedState.ariaPressed) return true;
  const cls = (await likeBtn.getAttribute("class").catch(() => null)) ?? "";
  return cls.includes(selectors.search.likedState.likedClassContains);
}

async function cardSignature(card: Locator, index: number): Promise<string> {
  const href = await card.locator('a[href*="/n/"]').first().getAttribute("href").catch(() => null);
  return href ?? `idx:${index}`;
}
