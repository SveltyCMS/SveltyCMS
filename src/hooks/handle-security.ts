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
import { metricsService } from "@src/services/observability/metrics-service";
import { securityResponseService } from "@src/services/security/response-service";
import { error, type Handle } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { getClientIp } from "@utils/hook-utils";

// ── Module-level cached env flags ────────────────────────────────────────

const IS_TEST_MODE =
  process.env.TEST_MODE === "true" ||
  process.env.VITE_TEST_MODE === "true" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  process.env.BENCHMARK === "true" ||
  (globalThis as any).process?.env?.TEST_MODE === "true";

const TEST_API_SECRET = process.env.TEST_API_SECRET || process.env.VITE_TEST_API_SECRET;
// 🚀 Module-level cached masterSecret fallback — avoids getPrivateSettingSync on every non-public request
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
const IS_BENCHMARK_DEBUG = process.env.BENCHMARK_DEBUG === "true";

// ── Pre-compiled AI bot regex (replaces 43-string array + .some() per request) ─

const AI_BOT_RE =
  /gptbot|chatgpt-user|anthropic-ai|claude-web|claudebot|cohere-ai|perplexitybot|google-extended|omgili|omgilibot|ccbot|commoncrawl|bytespider|petalbot|facebookbot|zgrab|masscan|nmap|sqlmap|nikto|acunetix|burpsuite|gobuster|dirbuster|wfuzz|feroxbuster|rustscan|nessus|scrapy|python-requests\/2|curl\/|wget\/|axios\/|node-fetch|l9explore|l9tcpid|libwww-perl|go-http-client/i;

// ── Pre-allocated honeypot routes (no per-request array allocation) ──

const HONEYPOT_ROUTES: readonly string[] = [
  "/wp-admin",
  "/wp-login.php",
  "/wp-content",
  "/wp-includes",
  "/wp-json",
  "/xmlrpc.php",
  "/wp-cron.php",
  "/.env",
  "/.git/config",
  "/.git/HEAD",
  "/.svn/entries",
  "/.DS_Store",
  "/robots.txt",
  "/sitemap.xml",
  "/api/legacy-v1-debug",
  "/api/debug",
  "/api/v1/debug",
  "/actuator/health",
  "/actuator/env",
  "/actuator/gateway",
  "/.well-known/security.txt",
  "/.well-known/acme-challenge/",
  "/vendor/phpunit",
  "/console/",
  "/adminer.php",
  "/phpinfo.php",
  "/drupal",
  "/joomla",
  "/typo3",
  "/magento",
  "/craft",
  "/latest/meta-data",
  "/latest/user-data",
  "/.env.local",
  "/.env.production",
  "/.env.backup",
  "/config.yml",
  "/config.yaml",
  "/docker-compose.yml",
  "/docker-compose.yaml",
  "/backup",
  "/backups",
  "/dump.sql",
  "/database.sql",
  "/db.sql",
  "/admin.sql",
  "/backup.zip",
  "/site.zip",
  "/wwwroot.zip",
];

// ── Cached GraphQL module (lazy-loaded once, not per-request) ──
let graphqlModule: { parse: any; visit: any; Kind: any } | null = null;
function getGraphQL() {
  if (!graphqlModule) graphqlModule = require("graphql");
  return graphqlModule;
}

// ── Cached settings (loaded once at startup) ──
const MULTI_TENANT = getPrivateSettingSync("MULTI_TENANT");
const IS_DEMO = getPrivateSettingSync("DEMO");

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
    const gql = getGraphQL()!;
    const { parse, visit, Kind } = gql;
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
  if ((event.locals as any).__testBypass) return resolve(event);

  const { request, url } = event;
  const forceSecurity = request.headers.get("x-test-security") === "true";

  // 🚀 Short-circuit BEFORE getClientIp: public/bootstrap/static routes skip all security
  const flags = (event.locals as any).__flags;
  if ((flags?.isPublic || flags?.isBootstrap || flags?.isStatic) && !forceSecurity)
    return resolve(event);

  const clientIp = getClientIp(event);

  const isLocal =
    isLocalhost(clientIp) || url.hostname === "localhost" || url.hostname === "127.0.0.1";

  const incomingSecret = request.headers.get("x-test-secret");

  const masterSecret = getMasterSecret();

  const hasValidTestSecret = !!(incomingSecret && masterSecret && incomingSecret === masterSecret);

  if (IS_BENCHMARK_DEBUG) {
    console.log(
      `[Security] IP: ${clientIp}, Path: ${url.pathname}, isLocal: ${isLocal}, isTestMode: ${IS_TEST_MODE}, hasValidSecret: ${hasValidTestSecret}`,
    );
    if (incomingSecret && !hasValidTestSecret) {
      console.log(
        `[Security] SECRET MISMATCH: incoming=${incomingSecret.substring(0, 4)}..., master=${masterSecret?.substring(0, 4)}...`,
      );
    }
  }

  // 🛡️ SECURITY BYPASS: skip for local test/dev environments
  if (
    isLocal &&
    (IS_TEST_MODE || hasValidTestSecret) &&
    !forceSecurity
  )
    return resolve(event);

  // ✨ ENTERPRISE: Load Shedding (Self-Healing)
  // Force GC if available and memory is high
  if (dev && (globalThis as any).gc) {
    const mem = process.memoryUsage();
    if (mem.heapUsed / mem.heapTotal > 0.8) (globalThis as any).gc();
  }

  const mem = process.memoryUsage();
  const heapUsedRatio = mem.heapUsed / mem.heapTotal;
  if (
    !IS_TEST_MODE &&
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
  if (MULTI_TENANT && !IS_DEMO) {
    try {
      tenantId = getTenantIdFromHostname(url.hostname, true) || undefined;
    } catch {
      /* ignore */
    }
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
    // 🛡️ AI Bot / Reconnaissance Defense (Multi-Layer)
    // ──────────────────────────────────────────────────────────────

    // Layer 1: Pre-compiled regex — replaces 43-string array + .some() per request
    const userAgent = request.headers.get("user-agent") || "";
    const isKnownBot = AI_BOT_RE.test(userAgent);

    // Layer 2: Pre-allocated honeypot route detection
    const pathLower = url.pathname.toLowerCase();
    let hitHoneypot = false;
    for (let i = 0; i < HONEYPOT_ROUTES.length; i++) {
      if (pathLower.startsWith(HONEYPOT_ROUTES[i])) {
        hitHoneypot = true;
        break;
      }
    }

    if (hitHoneypot || (isKnownBot && !isLocal)) {
      const triggerType = hitHoneypot ? `route:${url.pathname}` : `UA:${userAgent}`;
      logger.warn(`[Security] AI/Bot Defense triggered [${triggerType}] by IP: ${clientIp}`);

      // Auto-ban IP via the security response service
      metricsService.incrementSecurityViolations(tenantId);
      await securityResponseService.analyzeRequest(
        new Request("http://localhost/api/honeypot", {
          method: "POST",
          body: "SQL INJECTION STRING ' OR 1=1 --",
          headers: { "user-agent": userAgent || "unknown-scanner" },
        }),
        clientIp,
        tenantId,
      );

      // Progressive Tarpit: random delay to waste bot resources
      const tarpitDelay = Math.min(5000 + Math.floor(Math.random() * 10000), 15000);
      await new Promise((resolve) => setTimeout(resolve, tarpitDelay));

      // Response poisoning: return fake data to poison scrapers
      return new Response(
        JSON.stringify({
          status: "ok",
          data: {
            users: [],
            config: { debug: false, environment: "production" },
            version: "1.0.0",
          },
          timestamp: new Date().toISOString(),
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
