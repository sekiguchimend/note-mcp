import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./tools/register.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

function buildServer(): McpServer {
  const server = new McpServer({ name: "note-mcp", version: "0.1.0" });
  registerTools(server);
  return server;
}

// Optional bearer-token gate for the remote endpoint.
function authorized(req: Request): boolean {
  if (!config.server.authToken) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${config.server.authToken}`;
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // Session-scoped transports (Streamable HTTP).
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.get("/health", (_req, res) => res.json({ ok: true, service: "note-mcp" }));

  app.post("/mcp", async (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session; send an initialize request first." },
          id: null,
        });
        return;
      }
      // New session.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
          logger.info({ sid }, "mcp session initialized");
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) {
          delete transports[transport!.sessionId];
          logger.info({ sid: transport!.sessionId }, "mcp session closed");
        }
      };
      await buildServer().connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  // GET (server-sent events stream) and DELETE (session teardown).
  const sessionRoute = async (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.status(401).end();
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      res.status(400).send("Unknown session");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", sessionRoute);
  app.delete("/mcp", sessionRoute);

  app.listen(config.server.port, config.server.host, () => {
    logger.info(
      { host: config.server.host, port: config.server.port, headless: config.browser.headless },
      "note-mcp listening (Streamable HTTP at POST /mcp)",
    );
  });
}

main().catch((e) => {
  logger.error({ err: e instanceof Error ? e.stack : String(e) }, "fatal");
  process.exit(1);
});
