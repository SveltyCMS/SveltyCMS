/**
 * @file src/utils/vite-plugin-agent/index.ts
 * @description Dev-only Vite plugin exposing the local agent dev loop over HTTP.
 *
 * The plugin is registered by `vite.config.ts` only when `SVELTY_AGENT === "1"` and
 * declares `apply: "serve"`, so it can never run during a build. It serves a health
 * route and a token-protected tool endpoint; the tool implementations live in
 * `tools-server.ts` and are fenced by `path-policy.ts`.
 *
 * Not the same thing as the CMS content protocol in `src/plugins/editable-website`
 * (that one maps a click to a *field*); this loop maps a click to *source code* and
 * stays a development tool.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { AGENT_CAPS, AGENT_TOKEN_ENV, AGENT_TOKEN_HEADER, isAgentEnabled } from "./caps.ts";
import { AGENT_TOOLS, runAgentTool } from "./tools-server.ts";

export const AGENT_ROUTE_PREFIX = "/agent";

/**
 * Create the dev-only agent plugin.
 *
 * The plugin resolves the repository root from the Vite config (not from
 * `process.cwd()`), so tool paths are fenced against the real project root even when
 * Vite is started from a parent directory.
 */
export function vitePluginAgent(): Plugin {
  let root = process.cwd();
  let token = process.env[AGENT_TOKEN_ENV] ?? "";

  return {
    name: "svelty-agent-dev-loop",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      if (!isAgentEnabled()) {
        return;
      }
      if (token.length === 0) {
        token = randomUUID();
      }
      const sessionToken = token;
      const sessionRoot = root;
      server.config.logger.info(
        `[agent] dev loop ready — GET ${AGENT_ROUTE_PREFIX}/health, POST ${AGENT_ROUTE_PREFIX}/tools/<name>`,
      );
      server.config.logger.info(
        `[agent] session token: ${sessionToken} (header ${AGENT_TOKEN_HEADER}; override with ${AGENT_TOKEN_ENV})`,
      );
      server.middlewares.use((req, res, next) => {
        void handleAgentRequest(req, res, next, sessionRoot, sessionToken);
      });
    },
  };
}

async function handleAgentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  root: string,
  token: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(AGENT_ROUTE_PREFIX)) {
    next();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === `${AGENT_ROUTE_PREFIX}/health`) {
      sendJson(res, 200, {
        ok: true,
        route: AGENT_ROUTE_PREFIX,
        tools: AGENT_TOOLS,
        caps: AGENT_CAPS,
      });
      return;
    }

    const toolMatch = /^\/agent\/tools\/([a-z_]+)$/.exec(url.pathname);
    if (req.method === "POST" && toolMatch) {
      if (req.headers[AGENT_TOKEN_HEADER] !== token) {
        sendJson(res, 403, { ok: false, error: "invalid agent token" });
        return;
      }
      const body = await readBody(req);
      if (body === undefined) {
        sendJson(res, 413, { ok: false, error: "request body missing or too large" });
        return;
      }

      let args: Record<string, unknown> = {};
      if (body.trim().length > 0) {
        const parsed: unknown = JSON.parse(body);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          sendJson(res, 400, { ok: false, error: "body must be a JSON object" });
          return;
        }
        args = parsed as Record<string, unknown>;
      }

      const result = await runAgentTool(toolMatch[1], root, args);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    sendJson(res, 404, { ok: false, error: "unknown agent route" });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "agent route failed",
    });
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (value: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > AGENT_CAPS.requestBodyBytes) {
        req.destroy();
        finish(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => finish(undefined));
  });
}
