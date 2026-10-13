import { launchSession } from "../browser/launch.js";
import { login } from "../auth/login.js";
import { postArticle } from "./post.js";
import { likeByKeyword } from "./like.js";
import { queue } from "../queue.js";
import { logger } from "../logger.js";
import type { Job, JobResult } from "../types.js";

// Run a batch of jobs under a SINGLE browser launch + SINGLE login.
// Because "login every time" is the chosen policy, minimizing logins by
// batching is the main lever we have to reduce ban risk: post + like in one
// authenticated session, then tear down.
//
// Everything is funneled through the serial queue so only one browser is
// ever live at a time.
export function runJobs(jobs: Job[]): Promise<JobResult[]> {
  return queue.run(async () => {
    const session = await launchSession();
    const results: JobResult[] = [];
    try {
      await login(session.page);

      for (const job of jobs) {
        try {
          if (job.kind === "post") {
            results.push(await postArticle(session.page, job));
          } else {
            results.push(await likeByKeyword(session.page, job));
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          logger.error({ job: job.kind, err: message }, "job failed");
          results.push(
            job.kind === "post"
              ? { kind: "post", ok: false, published: false, message }
              : { kind: "like", ok: false, liked: 0, skipped: 0, keyword: job.keyword, message },
          );
        }
      }
    } finally {
      await session.close();
    }
    return results;
  });
}

export function runJob(job: Job): Promise<JobResult> {
  return runJobs([job]).then((r) => r[0]);
}
