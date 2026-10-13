import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJob, runJobs } from "../scenarios/runSession.js";
import { launchSession } from "../browser/launch.js";
import { login, isLoggedIn } from "../auth/login.js";
import { queue } from "../queue.js";
import { config } from "../config.js";
import type { Job } from "../types.js";

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// Register all note tools on the given MCP server.
// The AI only ever supplies CONTENT (title/body/tags/keyword/count).
// No operation/selector/timing decisions are exposed to it.
export function registerTools(server: McpServer): void {
  server.registerTool(
    "note_post_article",
    {
      title: "Post an article to note",
      description:
        "Publish (or save as draft) a note.com article. Provide the content only; " +
        "the server handles login and all browser operations. Body is Markdown and " +
        "its formatting (headings, bold, lists, quotes, code) is reproduced in note's editor.",
      inputSchema: {
        title: z.string().min(1).describe("Article title"),
        body: z.string().min(1).describe("Article body in Markdown"),
        tags: z.array(z.string()).default([]).describe("Hashtags (without the leading #)"),
        publish: z.boolean().default(false).describe("true = publish now, false = save as draft"),
        imageUrl: z.string().url().optional().describe("Optional eyecatch/header image URL (recommended 1280x670)"),
      },
    },
    async ({ title, body, tags, publish, imageUrl }) => {
      const result = await runJob({ kind: "post", title, body, tags, publish, imageUrl });
      return textResult(result);
    },
  );

  server.registerTool(
    "note_like_by_keyword",
    {
      title: "Like note articles by search keyword",
      description:
        "Search note.com for a keyword and like (スキ) up to `count` of the newest results. " +
        "Built-in daily limit and randomized human-like pacing protect the account.",
      inputSchema: {
        keyword: z.string().min(1).describe("Search keyword"),
        count: z.number().int().min(1).max(100).default(10).describe("How many posts to like"),
        skipIfLiked: z.boolean().default(true).describe("Skip posts already liked"),
      },
    },
    async ({ keyword, count, skipIfLiked }) => {
      const result = await runJob({ kind: "like", keyword, count, skipIfLiked });
      return textResult(result);
    },
  );

  server.registerTool(
    "note_run_batch",
    {
      title: "Run multiple note jobs in one login session",
      description:
        "Execute several post/like jobs under a SINGLE login. Preferred for efficiency and " +
        "to minimize the number of logins (lower ban risk).",
      inputSchema: {
        jobs: z
          .array(
            z.discriminatedUnion("kind", [
              z.object({
                kind: z.literal("post"),
                title: z.string().min(1),
                body: z.string().min(1),
                tags: z.array(z.string()).default([]),
                publish: z.boolean().default(false),
                imageUrl: z.string().url().optional(),
              }),
              z.object({
                kind: z.literal("like"),
                keyword: z.string().min(1),
                count: z.number().int().min(1).max(100).default(10),
                skipIfLiked: z.boolean().default(true),
              }),
            ]),
          )
          .min(1)
          .describe("Ordered list of jobs to run in one session"),
      },
    },
    async ({ jobs }) => {
      const results = await runJobs(jobs as Job[]);
      return textResult(results);
    },
  );

  server.registerTool(
    "note_session_status",
    {
      title: "Check note login status",
      description:
        "Launch a browser, attempt login, and report whether the configured account can " +
        "authenticate right now. Useful for diagnostics.",
      inputSchema: {},
    },
    async () => {
      const result = await queue.run(async () => {
        const session = await launchSession();
        try {
          await login(session.page);
          return { ok: await isLoggedIn(session.page), account: config.note.email };
        } catch (e) {
          return { ok: false, account: config.note.email, error: e instanceof Error ? e.message : String(e) };
        } finally {
          await session.close();
        }
      });
      return textResult(result);
    },
  );
}
