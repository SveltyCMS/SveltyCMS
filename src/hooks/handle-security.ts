/**
 * @file src/hooks/handle-security.ts
 * @description ESM-safe unified security middleware with v8 heap-aware load shedding and real payload analysis.
 */

import v8 from "node:v8";
import { metricsService } from "@src/services/observability/metrics-service";
import { securityResponseService } from "@src/services/security/response-service";
import { error, type Handle } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { getClientIp } from "@utils/hook-utils";

const IS_TEST_MODE =
  process.env.TEST_MODE === "true" ||
  process.env.VITE_TEST_MODE === "true" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  process.env.BENCHMARK === "true";

const TEST_API_SECRET = process.env.TEST_API_SECRET || process.env.VITE_TEST_API_SECRET;
let cachedMasterSecret: string | null = null;

function getMasterSecret(): string | undefined {
  if (TEST_API_SECRET) return TEST_API_SECRET;
  if (cachedMasterSecret !== null) return cachedMasterSecret || undefined;
  try {
    cachedMasterSecret = getPrivateSettingSync("TEST_API_SECRET") || "";
  } catch {
    cachedMasterSecret = "";
  }
  return cachedMasterSecret || undefined;
}

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

const MULTI_TENANT = getPrivateSettingSync("MULTI_TENANT");
const IS_DEMO = getPrivateSettingSync("DEMO");

const MAX_DEPTH = 12;
const MAX_COMPLEXITY = 1000;
const LIST_SIZE_ARGS = new Set(["first", "last", "limit", "pageSize", "take", "count"]);
const FAST_PATH_MAX_LENGTH = 256;

function quickComplexityCheck(query: string): number | null {
  let depth = 0,
    maxDepth = 0,
    braces = 0;
  for (let i = 0; i < query.length; i++) {
    if (query[i] === "{") {
      depth++;
      braces++;
      if (depth > maxDepth) maxDepth = depth;
      if (depth > MAX_DEPTH) return MAX_COMPLEXITY + 1;
    } else if (query[i] === "}") {
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

export const handleSecurity: Handle = async ({ event, resolve }) => {
  if ((event.locals as any).__testBypass) return resolve(event);
  const { request, url } = event;
  const forceSecurity = request.headers.get("x-test-security") === "true";
  const flags = (event.locals as any).__flags;
  if ((flags?.isPublic || flags?.isBootstrap || flags?.isStatic) && !forceSecurity)
    return resolve(event);

  const clientIp = getClientIp(event);
  const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || url.hostname === "localhost";
  const incomingSecret = request.headers.get("x-test-secret");
  const masterSecret = getMasterSecret();
  const hasValidTestSecret = !!(incomingSecret && masterSecret && incomingSecret === masterSecret);
  if (isLocal && (IS_TEST_MODE || hasValidTestSecret) && !forceSecurity) return resolve(event);

  // Load shedding: use v8 heap_size_limit for reliable ceiling
  const heapStats = v8.getHeapStatistics();
  const physicalLimitRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
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

  try {
    if (url.pathname.startsWith("/api/graphql") && request.method === "POST") {
      const clonedReq = request.clone();
      const body = await clonedReq.json().catch(() => ({}));
      if (body.query) {
        const complexity = await calculateGraphqlComplexity(body.query);
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
      // Pass real request.clone() instead of mock payload for accurate forensics
      await securityResponseService.analyzeRequest(request.clone(), clientIp, tenantId);
      await new Promise((r) =>
        setTimeout(r, Math.min(5000 + Math.floor(Math.random() * 10000), 15000)),
      );
      return new Response(
        JSON.stringify({
          status: "ok",
          data: {
            users: [],
            config: { debug: false, environment: "production" },
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const securityStatus = await securityResponseService.analyzeRequest(
      request,
      clientIp,
      tenantId,
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
