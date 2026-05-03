/**
 * @file src/hooks/handle-security.ts
 * @description
 * Unified security middleware consolidating firewall, rate limiting, and payload analysis.
 *
 * Features:
 * - AST-level GraphQL complexity analysis (depth × field-cost × list-multiplier)
 * - Rate limiting and bot detection
 * - Payload threat scanning (SQLi, XSS)
 * - CSRF protection passthrough
 */

import { dev } from "$app/environment";
import { metricsService } from "@src/services/metrics-service";
import { securityResponseService } from "@src/services/security-response-service";
import { error, type Handle } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { getClientIp, isStaticOrInternalRequest } from "@utils/hook-utils";

// ──────────────────────────────────────────────────────────────
// GraphQL Complexity Shield (2-Phase: Fast Pre-filter → AST Analysis)
// ──────────────────────────────────────────────────────────────

/** Max nesting depth allowed (prevents recursive fragment bombs) */
const MAX_DEPTH = 12;
/** Max complexity score before rejection */
const MAX_COMPLEXITY = 1000;
/** Argument names that indicate list pagination/multiplier */
const LIST_SIZE_ARGS = new Set(["first", "last", "limit", "pageSize", "take", "count"]);
/** Query length below which we skip expensive AST parsing */
const FAST_PATH_MAX_LENGTH = 256;

/**
 * Phase 1: Ultra-fast string pre-filter (< 0.01ms).
 * Counts depth and rejects obviously malicious queries before invoking the parser.
 * Returns `null` if query passes pre-filter and needs full AST analysis.
 * Returns a score ≥ 0 if the query can be definitively scored without parsing.
 */
function quickComplexityCheck(query: string): number | null {
  let depth = 0;
  let maxDepth = 0;
  let braces = 0;

  for (let i = 0; i < query.length; i++) {
    if (query[i] === "{") {
      depth++;
      braces++;
      if (depth > maxDepth) maxDepth = depth;
      // Early exit: depth alone exceeds limit
      if (depth > MAX_DEPTH) return MAX_COMPLEXITY + 1;
    } else if (query[i] === "}") {
      depth--;
    }
  }

  // Very short, shallow queries are safe — skip AST parse
  if (query.length <= FAST_PATH_MAX_LENGTH && maxDepth <= 3 && braces <= 6) {
    return braces * maxDepth;
  }

  return null; // needs full analysis
}

/**
 * Phase 2: Full AST-based complexity analysis.
 * Walks the parsed GraphQL document and calculates:
 *   cost = Σ (fieldCost × listMultiplier) at each depth level
 * where listMultiplier = value of first/last/limit/pageSize arg (or DEFAULT_LIST_SIZE).
 *
 * This correctly catches attacks like:
 *   query { users(first: 99999) { posts(first: 99999) { comments { body } } } }
 *   → 99999 × 99999 × 1 × 1 = ~10 billion (blocked)
 */
function calculateGraphqlComplexity(query: string): number {
  // Phase 1: fast pre-filter
  const quickScore = quickComplexityCheck(query);
  if (quickScore !== null) return quickScore;

  // Phase 2: AST analysis (lazy-loaded so the graphql parser doesn't affect non-GQL requests)
  try {
    const { parse, visit, Kind } = require("graphql");
    const ast = parse(query);

    let complexity = 0;
    const multiplierStack: number[] = [1]; // stack of cumulative multipliers per depth

    visit(ast, {
      Field: {
        enter(node: any) {
          // Calculate list multiplier from arguments like first, limit, etc.
          let fieldMultiplier = 1;
          if (node.arguments && node.arguments.length > 0) {
            for (const arg of node.arguments) {
              if (LIST_SIZE_ARGS.has(arg.name.value) && arg.value.kind === Kind.INT) {
                fieldMultiplier = Math.max(fieldMultiplier, parseInt(arg.value.value, 10));
              }
            }
          }

          // If the field has a selection set (sub-fields), it's a resolver
          // that multiplies downstream cost by the list size.
          const parentMultiplier = multiplierStack[multiplierStack.length - 1] || 1;
          const cumulativeMultiplier = parentMultiplier * fieldMultiplier;

          // Each field costs 1 × cumulative multiplier from all ancestor list sizes
          complexity += cumulativeMultiplier;

          // Push multiplier for children (only if field has sub-selections)
          if (node.selectionSet) {
            multiplierStack.push(cumulativeMultiplier);
          }

          // Early exit if already over limit
          if (complexity > MAX_COMPLEXITY) return false;
        },
        leave(node: any) {
          if (node.selectionSet) {
            multiplierStack.pop();
          }
        },
      },
    });

    return complexity;
  } catch {
    // If parsing fails, treat as potentially malicious
    return MAX_COMPLEXITY + 1;
  }
}

/**
 * Consolidated security hook that performs:
 * 1. Rate Limiting
 * 2. Payload Analysis (SQLi, XSS, etc.)
 * 3. Bot Detection
 * 4. CSRF Protection
 * 5. GraphQL Complexity Shield
 */
export const handleSecurity: Handle = async ({ event, resolve }) => {
  // 🚀 FAST BYPASS: Skip security checks if already verified by Turbo Pipeline
  if ((event.locals as any).__testBypass) {
    return await resolve(event);
  }

  const { request, url } = event;
  const clientIp = getClientIp(event);

  const isTestMode =
    process.env.TEST_MODE === "true" ||
    process.env.VITE_TEST_MODE === "true" ||
    process.env.PLAYWRIGHT_TEST === "true" ||
    (globalThis as any).process?.env?.TEST_MODE === "true";
  const isLocal =
    isLocalhost(clientIp) || url.hostname === "localhost" || url.hostname === "127.0.0.1";

  // Allow bypass when a valid x-test-secret is present (Playwright sends this via extraHTTPHeaders).
  // This works regardless of how the server was started (dev, preview, or build).
  const incomingSecret = request.headers.get("x-test-secret");

  // 🚀 ROBUST SECRET RESOLUTION: Check process.env first, then falling back to getPrivateSettingSync
  // We use the helper getTestSecret() from setup-check if possible for consistency.
  let masterSecret = process.env.TEST_API_SECRET || process.env.VITE_TEST_API_SECRET;
  if (!masterSecret) {
    try {
      masterSecret = getPrivateSettingSync("TEST_API_SECRET");
    } catch {
      // ignore
    }
  }

  const hasValidTestSecret = !!(incomingSecret && masterSecret && incomingSecret === masterSecret);

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log(
      `[Security] IP: ${clientIp}, Path: ${url.pathname}, isLocal: ${isLocal}, isTestMode: ${isTestMode}, hasValidSecret: ${hasValidTestSecret}`,
    );
    if (incomingSecret && !hasValidTestSecret) {
      console.log(
        `[Security] SECRET MISMATCH: incoming=${incomingSecret.substring(0, 4)}..., master=${masterSecret?.substring(0, 4)}...`,
      );
    }
  }

  // 🛡️ SECURITY BYPASS: If local and (dev or test or valid secret), allow with no further checks.
  // Note: x-test-security header can be used to FORCE checks even in local test mode.
  if (
    isStaticOrInternalRequest(url.pathname) ||
    (isLocal &&
      (dev || isTestMode || hasValidTestSecret) &&
      request.headers.get("x-test-security") !== "true")
  ) {
    return await resolve(event);
  }

  // ✨ ENTERPRISE: Load Shedding (Self-Healing)
  // If memory usage is critically high, reject mutation requests to prevent OOM.
  // In dev/debug, we try to force a GC first to ensure accuracy.
  if (dev && (globalThis as any).gc) {
    const memBefore = process.memoryUsage().heapUsed;
    if (memBefore / process.memoryUsage().heapTotal > 0.8) {
      (globalThis as any).gc();
    }
  }

  const mem = process.memoryUsage();
  const heapUsedRatio = mem.heapUsed / mem.heapTotal;
  if (
    heapUsedRatio > 0.98 &&
    request.method !== "GET" &&
    !url.pathname.startsWith("/api/system") &&
    !url.pathname.startsWith("/setup") &&
    !url.pathname.startsWith("/api/setup")
  ) {
    logger.error(
      `[LoadShedding] Memory pressure critical (${(heapUsedRatio * 100).toFixed(1)}%). Rejecting mutation to ${url.pathname}`,
    );

    const body = JSON.stringify({
      error: "Server under heavy load",
      message: "Resource limit reached. Mutations are temporarily disabled.",
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Retry-After": "30",
    };

    // ✨ ENTERPRISE: Compress 503 response to save bandwidth during resource exhaustion
    const acceptEncoding = request.headers.get("accept-encoding") || "";
    if (
      typeof CompressionStream !== "undefined" &&
      (acceptEncoding.includes("gzip") || acceptEncoding.includes("deflate"))
    ) {
      const encoding = acceptEncoding.includes("gzip") ? "gzip" : "deflate";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }).pipeThrough(new (globalThis as any).CompressionStream(encoding));

      headers["Content-Encoding"] = encoding;
      return new Response(stream, { status: 503, headers });
    }

    return new Response(body, { status: 503, headers });
  }

  let tenantId: string | undefined = undefined;
  try {
    if (getPrivateSettingSync("MULTI_TENANT") && !getPrivateSettingSync("DEMO")) {
      tenantId = getTenantIdFromHostname(url.hostname, true) || undefined;
    }
  } catch {
    // Ignore tenant miss
  }

  try {
    // ✨ AST-Level GraphQL Security Shield
    if (url.pathname.startsWith("/api/graphql") && request.method === "POST") {
      const clonedReq = request.clone();
      const body = await clonedReq.json().catch(() => ({}));
      if (body.query) {
        const complexity = calculateGraphqlComplexity(body.query);
        // Reject queries with an excessively high complexity score (e.g. > 1000)
        if (complexity > 1000) {
          metricsService.incrementSecurityViolations(tenantId);
          logger.warn(`GraphQL Complexity Limit Exceeded: Score ${complexity}`, { ip: clientIp });
          return handleApiError(new AppError("GraphQL Query too complex", 400), event);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // AI Crawler / Reconnaissance Honeypot (Tarpit)
    // ──────────────────────────────────────────────────────────────
    const HONEYPOT_ROUTES = [
      "/wp-admin",
      "/api/legacy-v1-debug",
      "/.env",
      "/.git/config",
      "/wp-login.php",
    ];
    if (HONEYPOT_ROUTES.some((route) => url.pathname.startsWith(route))) {
      logger.warn(`[Security] AI Crawler Honeypot triggered on ${url.pathname} by IP: ${clientIp}`);

      // Auto-ban IP by triggering a manual block in the response service logic
      // By forcing a violation, the rate limiter or blocklist will trap the IP
      metricsService.incrementSecurityViolations(tenantId);
      await securityResponseService.analyzeRequest(
        new Request("http://localhost/api/honeypot", {
          method: "POST",
          body: "SQL INJECTION STRING ' OR 1=1 --",
        }),
        clientIp,
        tenantId,
      );

      // Return a misleading 200 OK or hanging response to waste crawler time (Tarpitting)
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain", "X-Robots-Tag": "none" },
      });
    }

    // 1. Analyze request for threats (Firewall + Payload Scan + Rate Limiting)
    const securityStatus = await securityResponseService.analyzeRequest(
      request,
      clientIp,
      tenantId,
    );

    if (securityStatus.action !== "allow") {
      metricsService.incrementSecurityViolations(tenantId);

      const statusCode = securityStatus.action === "block" ? 403 : 429;

      logger.warn(
        `Security action triggered: ${securityStatus.action} - ${securityStatus.reason}`,
        {
          ip: clientIp,
          url: url.pathname,
          level: securityStatus.level,
        },
      );

      if (url.pathname.startsWith("/api/")) {
        return handleApiError(
          new AppError(securityStatus.reason || "Security violation", statusCode),
          event,
        );
      }

      throw error(statusCode, securityStatus.reason || "Forbidden");
    }

    // 2. Request passed security checks
    return await resolve(event);
  } catch (err) {
    if (url.pathname.startsWith("/api/")) {
      return handleApiError(err, event);
    }
    if (err instanceof AppError) {
      throw error(err.status, err.message);
    }
    throw err;
  }
};

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
