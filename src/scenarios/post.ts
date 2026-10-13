import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { selectors } from "../config.js";
import { logger } from "../logger.js";
import { humanType, humanPause, sleep } from "../browser/humanize.js";
import { typeMarkdown } from "./markdownToEditor.js";
import type { PostJob, PostResult } from "../types.js";

const E = selectors.editor;

// Fixed posting scenario. AI supplies title/body/tags/publish only.
export async function postArticle(page: Page, job: PostJob): Promise<PostResult> {
  logger.info({ title: job.title, publish: job.publish }, "starting post scenario");

  await page.goto(selectors.urls.newPost, { waitUntil: "domcontentloaded" });
  await humanPause(1200, 2600);

  // 0) Optional eyecatch image. Best-effort: never let it abort the post.
  if (job.imageUrl) {
    await uploadEyecatch(page, job.imageUrl).catch((e) =>
      logger.warn({ err: String(e) }, "eyecatch upload failed - continuing without image"),
    );
  }

  // 1) Title.
  await page.waitForSelector(E.titleInput, { timeout: 30_000 });
  await humanType(page.locator(E.titleInput).first(), job.title);
  await humanPause();

  // 2) Body (Markdown -> live editor operations).
  const body = page.locator(E.bodyEditor).first();
  await body.click();
  await humanPause(300, 800);
  await typeMarkdown(page, job.body);
  await humanPause(600, 1500);

  // 3) Draft vs publish. BOTH buttons live on the editor page.
  //    - Draft: click 下書き保存 and we're done (no publish settings page).
  //    - Publish: click 公開に進む -> separate settings page -> tags -> 投稿する.
  const editorUrl = page.url();

  if (!job.publish) {
    await page.locator(E.saveDraftButton).first().click();
    await humanPause(1500, 3000);
    logger.info({ url: editorUrl }, "draft saved");
    return { kind: "post", ok: true, url: editorUrl, published: false, message: "saved as draft" };
  }

  // 4) "公開に進む" navigates to a SEPARATE publish settings page.
  await page.locator(E.proceedToPublishButton).first().click();
  await sleep(2000);
  await humanPause(400, 1000);

  // 5) Hashtags (on the settings page).
  if (job.tags.length > 0) {
    const tagInput = page.locator(E.hashtagInput).first();
    if ((await tagInput.count()) > 0) {
      for (const tag of job.tags) {
        await humanType(tagInput, tag.replace(/^#/, ""));
        await page.keyboard.press("Enter");
        await humanPause(300, 900);
      }
    } else {
      logger.warn("hashtag input not found - skipping tags");
    }
  }

  // 6) Publish, then confirm via the success share modal.
  await page.locator(E.publishButton).first().click();
  const confirmed = await page
    .waitForSelector(E.publishedMarker, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await humanPause(1500, 3000);

  // Build the public article URL from the note id in the editor URL.
  const noteId = page.url().match(/notes\/(n[0-9a-f]+)/)?.[1];
  const url = noteId ? `https://note.com/notes/${noteId}` : page.url();
  logger.info({ url, confirmed }, confirmed ? "article published" : "clicked publish; success modal not detected");
  return {
    kind: "post",
    ok: true,
    url,
    published: true,
    message: confirmed ? "published" : "published (success modal not detected - please verify)",
  };
}

// Download an image and feed it to note's eyecatch upload (native file chooser).
async function uploadEyecatch(page: Page, imageUrl: string): Promise<void> {
  logger.info({ imageUrl }, "uploading eyecatch image");
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`image fetch failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  const ext = (imageUrl.split("?")[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? "png").toLowerCase();
  const tmp = join(tmpdir(), `note-eyecatch-${Date.now()}.${ext}`);
  writeFileSync(tmp, buf);

  try {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }),
      page.locator(E.imageUploadButton).first().click(),
    ]);
    await chooser.setFiles(tmp);
    await humanPause(1500, 3000);

    // note shows a crop/position dialog; confirm it best-effort.
    const confirm = page.locator(E.imageCropConfirmButton).first();
    if ((await confirm.count()) > 0) {
      await confirm.click().catch(() => undefined);
      await humanPause(800, 1800);
    }
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
