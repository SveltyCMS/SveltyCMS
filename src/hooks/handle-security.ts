/**
 * @file src/hooks/handle-security.ts
 * @description
 * ESM-safe unified security middleware with v8 heap-aware load shedding and real payload analysis.
 *
 * ### Features:
 * - V8 heap load-shedding (503 under critical pressure)
 * - Honeypot routes for scanner bait
 * - GraphQL depth/complexity analysis (dynamic graphql import, cold path only)
 * - AI/scanner bot UA scoring via securityResponseService
 * - Client IP via `getClientIp()` only (no X-Forwarded-For spoofing)
 */

import v8 from "node:v8";
import { metricsService } from "@src/services/observability/metrics-service";
import { securityResponseService } from "@src/services/security/response-service";
import { error, type Handle } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getTenantIdFromHostname, isMultiTenantEnabled } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { getClientIp, IS_TEST_MODE } from "@utils/hook-utils";
import { wafGuard } from "./wasm-waf-guard";
import { PROFILE_WRITE_ENABLED } from "@utils/write-profiler";

const AI_BOT_RE =
  /gptbot|chatgpt-user|anthropic-ai|claude-web|claudebot|cohere-ai|perplexitybot|google-extended|omgili|omgilibot|ccbot|commoncrawl|bytespider|petalbot|facebookbot|zgrab|masscan|nmap|sqlmap|nikto|acunetix|burpsuite|gobuster|dirbuster|wfuzz|feroxbuster|rustscan|nessus|scrapy|python-requests\/2|curl\/|wget\/|axios\/|node-fetch|l9explore|l9tcpid|libwww-perl|go-http-client/i;

const HONEYPOT_ROUTES: readonly string[] = [
  "/wp-admin",
  "/wp-login.php",
  "/wp-content",
  "/wp-includes",
  "/wp-json",
  "/xmlrpc.php",
  "/.env",
  "/.git/config",
  "/.git/HEAD",
  "/adminer.php",
  "/phpinfo.php",
  "/actuator/health",
];

// ESM-safe dynamic import for graphql
let graphqlModuleCache: any = null;
async function getGraphQL() {
  if (!graphqlModuleCache) {
    try {
      graphqlModuleCache = await import("graphql");
    } catch {
      graphqlModuleCache = false;
    }
  }
  return graphqlModuleCache;
}

const MULTI_TENANT = isMultiTenantEnabled();
const IS_DEMO = getPrivateSettingSync("DEMO");

const MAX_DEPTH = 12;
const MAX_COMPLEXITY = 1000;
/** Strict cap: a multi-MB query would synchronously block the event loop in
 * JSON.parse + the GraphQL AST parser BEFORE any validation runs (CPU DoS). */
const MAX_GRAPHQL_QUERY_LENGTH = 100 * 1024; // 100KB
const LIST_SIZE_ARGS = new Set(["first", "last", "limit", "pageSize", "take", "count"]);
const FAST_PATH_MAX_LENGTH = 256;

/**
 * O(n) brace-depth pre-filter. String literals and `#` comments are SKIPPED —
 * a JSON-stringified argument or a doc comment containing braces must not
 * trip the depth/braces counters (false 429s on valid queries).
 */
function quickComplexityCheck(query: string): number | null {
  if (query.length > MAX_GRAPHQL_QUERY_LENGTH) return MAX_COMPLEXITY + 1;

  let depth = 0,
    maxDepth = 0,
    braces = 0,
    inString = false,
    escaped = false,
    inComment = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (inComment) {
      if (char === "\n") inComment = false;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "#") {
      inComment = true;
      continue;
    }
    if (char === "{") {
      depth++;
      braces++;
      if (depth > maxDepth) maxDepth = depth;
      if (depth > MAX_DEPTH) return MAX_COMPLEXITY + 1;
    } else if (char === "}") {
      depth--;
    }
  }

  if (query.length <= FAST_PATH_MAX_LENGTH && maxDepth <= 3 && braces <= 6)
    return braces * maxDepth;
  return null;
}

async function calculateGraphqlComplexity(query: string): Promise<number> {
  const quickScore = quickComplexityCheck(query);
  if (quickScore !== null) return quickScore;

  const gql = await getGraphQL();
  if (!gql) return MAX_COMPLEXITY + 1;

  try {
    const { parse, visit, Kind } = gql;
    const ast = parse(query);
    let complexity = 0;
    const multiplierStack: number[] = [1];

    visit(ast, {
      Field: {
        enter(node: any) {
          let fieldMultiplier = 1;
          if (node.arguments?.length) {
            for (const arg of node.arguments) {
              if (LIST_SIZE_ARGS.has(arg.name.value) && arg.value.kind === Kind.INT) {
                fieldMultiplier = Math.max(fieldMultiplier, parseInt(arg.value.value, 10));
              }
            }
          }
          const parentMultiplier = multiplierStack[multiplierStack.length - 1] || 1;
          complexity += parentMultiplier * fieldMultiplier;
          if (node.selectionSet) multiplierStack.push(parentMultiplier * fieldMultiplier);
          if (complexity > MAX_COMPLEXITY) return false;
        },
        leave(node: any) {
          if (node.selectionSet) multiplierStack.pop();
        },
      },
    });
    return complexity;
  } catch {
    return MAX_COMPLEXITY + 1;
  }
}

let _lastHeapRatio = 0;
let _lastHeapCheck = 0;

function getCachedHeapRatio(): number {
  const now = Date.now();
  if (now - _lastHeapCheck > 100) {
    const heapStats = v8.getHeapStatistics();
    _lastHeapRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
    _lastHeapCheck = now;
  }
  return _lastHeapRatio;
}

export const handleSecurity: Handle = async ({ event, resolve }) => {
  if ((event.locals as any).__testBypass) return resolve(event);
  const { request, url } = event;
  const forceSecurity = request.headers.get("x-test-security") === "true";
  const flags = (event.locals as any).__flags;
  // Only bootstrap/system routes skip security checks.
  // Public and static routes (files, login, share) still go through
  // firewall, bot blocking, honeypot detection, and heap protection.
  if (flags?.isBootstrap && !forceSecurity) return resolve(event);

  const clientIp = getClientIp(event);
  const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || url.hostname === "localhost";
  // Security/WAF layer bypasses ONLY in explicit test environments (E2E/integration).
  // A validated x-test-secret alone is NOT sufficient — benchmark runs exercise
  // the full WAF/firewall path like real production traffic.
  if (isLocal && IS_TEST_MODE && !forceSecurity) return resolve(event);

  // Load shedding: use cached v8 heap_size_limit ratio (100ms sample window)
  const physicalLimitRatio = getCachedHeapRatio();
  if (
    !IS_TEST_MODE &&
    physicalLimitRatio > 0.95 &&
    request.method !== "GET" &&
    !url.pathname.startsWith("/api/system") &&
    !url.pathname.startsWith("/setup")
  ) {
    logger.error(
      `[LoadShedding] Physical memory limit reached (${(physicalLimitRatio * 100).toFixed(1)}%). Rejecting mutation.`,
    );
    return new Response(
      JSON.stringify({
        error: "Server under heavy load",
        message: "Mutations temporarily disabled.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      },
    );
  }

  let tenantId: string | undefined;
  if (MULTI_TENANT && !IS_DEMO) {
    try {
      tenantId = getTenantIdFromHostname(url.hostname, true) || undefined;
    } catch {}
  }

  // Layer 0 WASM/JS WAF Inspection
  const wafCheck = wafGuard.inspectRequest(url.pathname, url.search, request.headers);
  if (wafCheck.blocked) {
    metricsService.incrementSecurityViolations(tenantId);
    logger.warn(`[WAF Blocked] ${wafCheck.reason} (${wafCheck.threatType}) from ${clientIp}`);
    return handleApiError(new AppError(wafCheck.reason ?? "Security Policy Violation", 400), event);
  }

  let payloadSnapshot:
    | {
        json?: unknown;
        text?: string;
      }
    | undefined;

  try {
    if (url.pathname.startsWith("/api/graphql") && request.method === "POST") {
      const bodyText = await request
        .clone()
        .text()
        .catch(() => "");

      // 🛡️ Length cap BEFORE JSON.parse / AST parse — unbounded bodies let an
      // attacker block the event loop synchronously (CPU starvation DoS).
      if (bodyText.length > MAX_GRAPHQL_QUERY_LENGTH) {
        metricsService.incrementSecurityViolations(tenantId);
        return handleApiError(
          new AppError("GraphQL Query exceeds maximum allowed length", 400),
          event,
        );
      }

      let body: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(bodyText);
        body =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
      } catch {
        body = {};
      }
      payloadSnapshot = { json: body, text: bodyText };
      (event.locals as any).__graphqlBodyText = bodyText;
      (event.locals as any).__graphqlParsedBody = body;

      if (typeof body.query === "string") {
        const t0 = PROFILE_WRITE_ENABLED ? performance.now() : 0;
        const complexity = await calculateGraphqlComplexity(body.query);
        if (PROFILE_WRITE_ENABLED) {
          process.stderr.write(
            `[WRITE-PROFILE] sec:gql-complexity: ${(performance.now() - t0).toFixed(3)}ms\n`,
          );
        }
        if (complexity > MAX_COMPLEXITY) {
          metricsService.incrementSecurityViolations(tenantId);
          logger.warn(`GraphQL Complexity Limit Exceeded: ${complexity}`, {
            ip: clientIp,
          });
          return handleApiError(new AppError("GraphQL Query too complex", 400), event);
        }
      }
    }

    const userAgent = request.headers.get("user-agent") || "";
    const isKnownBot = AI_BOT_RE.test(userAgent);
    const pathLower = url.pathname.toLowerCase();
    let hitHoneypot = false;
    for (let i = 0; i < HONEYPOT_ROUTES.length; i++) {
      if (pathLower.startsWith(HONEYPOT_ROUTES[i])) {
        hitHoneypot = true;
        break;
      }
    }

    if (hitHoneypot || (isKnownBot && !isLocal)) {
      metricsService.incrementSecurityViolations(tenantId);
      // Forensics: record the probe in the incident engine (fast — no socket hold).
      await securityResponseService.analyzeRequest(request.clone(), clientIp, tenantId);

      // 🚨 NO TARPIT (removed Slowloris/DDoS vector): the previous 5-15s
      // setTimeout held the socket open, letting an attacker exhaust file
      // descriptors with cheap probes against /.{env,git}, /wp-admin, etc.
      // Honeypot hits are unambiguously hostile → flag the IP so the NEXT
      // request is rejected at the firewall layer, and close THIS socket
      // immediately with a decoy 200. Fire-and-forget: never delay the response.
      if (hitHoneypot) {
        securityResponseService
          .blockIp(clientIp, `Honeypot route hit: ${pathLower}`, tenantId)
          .catch(() => {});
      }

      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": "0",
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
          "Cache-Control": "no-store",
        },
      });
    }

    const securityStatus = await securityResponseService.analyzeRequest(
      request,
      clientIp,
      tenantId,
      payloadSnapshot,
    );
    if (securityStatus.action !== "allow") {
      metricsService.incrementSecurityViolations(tenantId);
      const statusCode = securityStatus.action === "block" ? 403 : 429;
      if (url.pathname.startsWith("/api/"))
        return handleApiError(
          new AppError(securityStatus.reason || "Security violation", statusCode),
          event,
        );
      throw error(statusCode, securityStatus.reason || "Forbidden");
    }

    return await resolve(event);
  } catch (err) {
    if (url.pathname.startsWith("/api/")) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};
