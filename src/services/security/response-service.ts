/**
 * @file src/services/security/response-service.ts
 * @description Enterprise-grade automated security response system with dynamic threat detection
 */

import { logger } from "@utils/logger";
import { building, dev } from "$app/env";
import { metricsService } from "../observability/metrics-service";
import { AuthGuardService } from "./auth-guard";
import { securityStore } from "./state-store";
import { memoryStore, redisStore } from "@utils/rate-limit";
import type { TokenBucketConfig, TokenBucketState } from "@utils/rate-limit/token-bucket";
import fs from "node:fs";
import path from "node:path";

/** Dump/restore scope: only the WAF's own buckets, never the shared API engine's. */
const WAF_KEY_PREFIX = "svelty:sec:rl:v13:";
import { getPressureCostMultiplier } from "@utils/rate-limit/system-pressure";
import type {
  SecurityIncident,
  SecurityPolicy,
  SecurityStatus,
  ThreatIndicator,
  ThreatLevel,
  AnomalyResult,
} from "./types";
import { safeFetch } from "../../utils/egress-guard";
import { isCleanRequestSurface, splitRequestUrl } from "./threat-scan";

// ============================================================================
// CONSTANTS & POLICIES
// ============================================================================

const DEFAULT_POLICIES: SecurityPolicy[] = [
  {
    name: "Moderate Threat Response",
    threatLevel: "medium",
    triggers: {
      indicatorThreshold: 3,
      timeWindow: 5 * 60 * 1000,
      severityThreshold: 5,
    },
    responses: ["warn", "throttle"],
    cooldownPeriod: 15 * 60 * 1000,
  },
  {
    name: "High Threat Response",
    threatLevel: "high",
    triggers: {
      indicatorThreshold: 5,
      timeWindow: 10 * 60 * 1000,
      severityThreshold: 7,
    },
    responses: ["warn", "block"],
    cooldownPeriod: 30 * 60 * 1000,
  },
  {
    name: "Critical Threat Response",
    threatLevel: "critical",
    triggers: {
      indicatorThreshold: 3,
      timeWindow: 5 * 60 * 1000,
      severityThreshold: 9,
    },
    responses: ["warn", "block"],
    cooldownPeriod: 60 * 60 * 1000,
  },
];

const ENDPOINT_RATE_LIMITS: Record<string, number> = {
  "/api/auth/login": 5,
  "/api/auth/2fa/verify": 5,
  "/api/auth/saml/acs": 10,
  "/api/auth/register": 3,
  "/api/auth/forgot-password": 3,
  "/api/graphql": 150,
  "/api/scim/v2": 30,
  "/api/media/upload": 20,
  "/api/token/create-token": 5,
  "/api/website-tokens": 30,
  "/api/permission/update": 30,
  "/api/collections": 100,
  "/api/commerce": 60,
  "/api/setup": 10,
  "/api/setup/test-db": 5,
  "/api/setup/seed-db": 3,
  "/api/setup/complete": 3,
  "/api/testing": 100,
};

function resolveRateLimitScope(cleanEndpoint: string): string {
  if (ENDPOINT_RATE_LIMITS[cleanEndpoint]) return cleanEndpoint;
  if (cleanEndpoint.includes("/api/graphql")) return "/api/graphql";
  if (cleanEndpoint.startsWith("/api/commerce")) return "/api/commerce";
  return "global";
}

const GLOBAL_RATE_LIMIT = 500;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const SCAN_BODY_MAX_SIZE = 32768; // 32KB
const ALLOW_STATUS: SecurityStatus = Object.freeze({ level: "none", action: "allow" });
const NO_ANOMALY: AnomalyResult = Object.freeze({
  detected: false,
  indicators: Object.freeze([]) as unknown as ThreatIndicator[],
});
const RAW_SECURITY_RATE_LIMIT_SCALE = Number(process.env.SECURITY_RATE_LIMIT_SCALE);
const SECURITY_RATE_LIMIT_SCALE =
  RAW_SECURITY_RATE_LIMIT_SCALE > 0 ? RAW_SECURITY_RATE_LIMIT_SCALE : 1;

interface PayloadSnapshot {
  json?: unknown;
  text?: string;
}

/**
 * Fast-path verdicts computed once in analyzeRequest() and reused by
 * analyzePayload() so the surface/UA scans run at most once per request.
 */
interface SurfaceScan {
  pathnameClean: boolean;
  searchClean: boolean;
  /** UA verdict; absent when the surface was dirty and the UA scan is deferred. */
  uaVerdict?: ThreatLevel;
}

// ============================================================================
// SECURITY RESPONSE SERVICE
// ============================================================================

export class SecurityResponseService {
  private readonly policies: SecurityPolicy[] = [];
  private readonly limiters = new Map<string, TokenBucketConfig>();
  private readonly lastAlertTime = new Map<string, number>();
  private readonly ALERT_COOLDOWN = 5 * 60 * 1000;
  private readonly DUMP_PATH = path.resolve(process.cwd(), "config/database/security_rl_dump.json");

  constructor() {
    this.policies = [...DEFAULT_POLICIES];
    this.restoreStateSync();
  }

  private getOrCreateLimiter(endpoint: string, tenantId?: string): TokenBucketConfig {
    // Normalize away query strings so /api/graphql?foo=1 and /api/graphql share
    // one limiter config instead of creating a fresh bucket per query string.
    const cleanEndpoint = endpoint.split("?")[0] || endpoint;
    const scope = resolveRateLimitScope(cleanEndpoint);
    const cacheKey = tenantId ? `${scope}_${tenantId}` : scope;
    const cached = this.limiters.get(cacheKey);
    if (cached) return cached;

    // SECURITY_RATE_LIMIT_SCALE raises the whole WAF ceiling uniformly for
    // load-testing/benchmark deployments (machinery stays fully active).
    const limit = (ENDPOINT_RATE_LIMITS[scope] || GLOBAL_RATE_LIMIT) * SECURITY_RATE_LIMIT_SCALE;

    // 1-minute fixed window: capacity = limit, full reset at window end — the
    // exact shape rate-limiter-flexible received (points/duration, no execEvenly).
    const bucket: TokenBucketConfig = {
      capacity: limit,
      refillPerSecond: limit / 60,
      windowMs: 60_000,
    };

    this.limiters.set(cacheKey, bucket);
    return bucket;
  }

  public reset(): void {
    this.limiters.clear();
    this.lastAlertTime.clear();
    logger.info("[Security] Rate limiters and alert trackers reset");
  }

  /** Analyzes a request for potential security threats. */
  public async analyzeRequest(
    request: Request,
    clientIp: string,
    tenantId?: string,
    payloadSnapshot?: PayloadSnapshot,
  ): Promise<SecurityStatus> {
    const { pathname, search } = splitRequestUrl(request.url);
    const method = request.method;
    const isReadOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";

    if (clientIp) {
      if (securityStore.isBlockedSync(clientIp)) {
        return { level: "critical", action: "block", reason: "IP is blocked" };
      }
      if (securityStore.needsDistributedLookup() && (await securityStore.isBlocked(clientIp))) {
        return { level: "critical", action: "block", reason: "IP is blocked" };
      }
    }

    const forceSecurity = request.headers.get("x-test-security") === "true";

    // GET allow-path: skip IP-keyed work when the caller passed no IP, and skip
    // rate-limit/throttle machinery when the process is test/dev or the path is
    // a non-API read. Clean collection URLs return here without concat or regex.
    // Cheap predicates are hoisted above the scans: a production /api/ read can
    // never take the fast allow (its rate limiter is live), so scanning there
    // would only duplicate what analyzePayload() re-checks. The throttle gate
    // keys on clientIp alone and stays ahead of the rate limiter for every read;
    // the later sync+distributed pass would reject the same IP anyway.
    let surfaceScan: SurfaceScan | undefined;
    if (isReadOnly && !forceSecurity) {
      if (clientIp) {
        const throttle = securityStore.getThrottleSync(clientIp);
        if (throttle && throttle.until > Date.now()) {
          return { level: "medium", action: "throttle", reason: "IP is throttled" };
        }
      }
      const isApiPath = pathname.startsWith("/api/");
      if (!isApiPath || this.shouldSkipRateLimit(false)) {
        const ua = request.headers.get("user-agent") || "";
        if (ua) {
          const pathnameClean = isCleanRequestSurface(pathname);
          if (pathnameClean) {
            const searchClean = isCleanRequestSurface(search);
            surfaceScan = { pathnameClean, searchClean };
            if (searchClean) {
              const uaVerdict = AuthGuardService.scanUserAgent(ua);
              surfaceScan.uaVerdict = uaVerdict;
              if (uaVerdict === "none") return ALLOW_STATUS;
            }
          } else {
            surfaceScan = { pathnameClean: false, searchClean: false };
          }
        }
      }
    }

    // 🔐 Bot-UA short-circuit (non-GET): a known bot/scanner User-Agent is
    // blocked outright — it must never consume WAF rate-limit capacity first,
    // and the verdict stays deterministic even when the shared per-IP bucket
    // is exhausted. scanUserAgent() reports these tokens as "high" (it never
    // emits "critical"), so gate on both. Same verdict the payload stage
    // would return anyway — only moved ahead of the rate limiter, and like
    // that path it does NOT persist an IP block (parity: repeated probes keep
    // hitting 403 per-request without poisoning shared per-IP state). The
    // verdict is also handed down via surfaceScan so analyzePayload never
    // re-scans the UA (one UA pass per request, mutations included).
    if (!isReadOnly) {
      const ua = request.headers.get("user-agent") || "";
      if (ua) {
        const uaVerdict = AuthGuardService.scanUserAgent(ua);
        if (uaVerdict === "high" || uaVerdict === "critical") {
          return { level: "critical", action: "block", reason: "User-Agent is blocked" };
        }
        surfaceScan ??= { pathnameClean: false, searchClean: false, uaVerdict };
      }
    }

    if (!isReadOnly || pathname.startsWith("/api/") || forceSecurity) {
      if (!this.shouldSkipRateLimit(forceSecurity)) {
        const rateLimit = await this.checkRateLimit(clientIp, pathname, tenantId, forceSecurity);
        if (rateLimit.action !== "allow") return rateLimit;
      }
    }

    if (clientIp) {
      const throttle =
        securityStore.getThrottleSync(clientIp) ??
        (securityStore.needsDistributedLookup() ? await securityStore.getThrottle(clientIp) : null);
      if (throttle && throttle.until > Date.now()) {
        return { level: "medium", action: "throttle", reason: "IP is throttled" };
      }
    }

    const anomaly = this.detectAnomalies(request);
    if (anomaly.detected) {
      for (const ind of anomaly.indicators) {
        await this.processIndicator(clientIp, ind);
      }
      if (anomaly.indicators.some((i) => i.severity >= 8)) {
        return {
          level: "high",
          action: "challenge",
          reason: "Request anomaly detected",
        };
      }
    }

    const threatOrPromise = this.analyzePayload(
      request,
      payloadSnapshot,
      pathname,
      search,
      surfaceScan,
    );
    const threatLevel =
      threatOrPromise !== null && typeof threatOrPromise === "object" && "then" in threatOrPromise
        ? await threatOrPromise
        : threatOrPromise;
    if (threatLevel === "critical") {
      await this.blockIp(clientIp, "Critical threat detected in payload");
      return {
        level: "critical",
        action: "block",
        reason: "Malicious payload detected",
      };
    }
    if (threatLevel === "high") {
      return {
        level: "high",
        action: "block",
        reason: "Suspicious payload detected",
      };
    }

    return ALLOW_STATUS;
  }

  private analyzePayload(
    request: Request,
    payloadSnapshot?: PayloadSnapshot,
    pathname?: string,
    search?: string,
    surfaceScan?: SurfaceScan,
  ): ThreatLevel | Promise<ThreatLevel> {
    const parsed =
      pathname !== undefined ? { pathname, search: search ?? "" } : splitRequestUrl(request.url);
    const method = request.method;
    const isMutation =
      (method === "POST" ||
        method === "PUT" ||
        method === "PATCH" ||
        method === "DELETE" ||
        method === "post" ||
        method === "put" ||
        method === "patch" ||
        method === "delete") &&
      Boolean(request.body);
    const userAgent = request.headers.get("user-agent") || "";

    // 99.9% GET allow-path: one alphabet pass, no concat, no second URL scan.
    // analyzeRequest() already computed these verdicts for read-only requests;
    // only mutations, forced security, and production /api/ reads (whose live
    // rate limiter makes its fast allow unreachable) reach here without them.
    let uaVerdict = surfaceScan?.uaVerdict;
    if (!isMutation) {
      const pathnameClean = surfaceScan
        ? surfaceScan.pathnameClean
        : isCleanRequestSurface(parsed.pathname);
      const searchClean =
        pathnameClean &&
        (surfaceScan ? surfaceScan.searchClean : isCleanRequestSurface(parsed.search));
      if (pathnameClean && searchClean) {
        uaVerdict ??= AuthGuardService.scanUserAgent(userAgent);
        if (uaVerdict === "none") return "none";
      }
    }

    let maxThreat: ThreatLevel = "none";
    const urlThreat = this.checkValue(
      parsed.search ? `${parsed.pathname} ${parsed.search}` : parsed.pathname,
      parsed.pathname.includes("/scim/"),
    );
    if (urlThreat === "critical") return "critical";
    maxThreat = this.upgradeThreat(maxThreat, urlThreat);
    maxThreat = this.upgradeThreat(
      maxThreat,
      uaVerdict ?? AuthGuardService.scanUserAgent(userAgent),
    );

    if (isMutation) {
      return this.scanMutationBody(request, payloadSnapshot, parsed, maxThreat);
    }

    return this.upgradeThreat(maxThreat, AuthGuardService.scanUrl(parsed.pathname + parsed.search));
  }

  private async scanMutationBody(
    request: Request,
    payloadSnapshot: PayloadSnapshot | undefined,
    parsed: { pathname: string; search: string },
    maxThreat: ThreatLevel,
  ): Promise<ThreatLevel> {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) return "high";

    if (contentLength > 0) {
      try {
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("application/json") && contentLength < SCAN_BODY_MAX_SIZE * 2) {
          const json =
            payloadSnapshot && "json" in payloadSnapshot
              ? payloadSnapshot.json
              : await request
                  .clone()
                  .json()
                  .catch(() => ({}));
          maxThreat = this.upgradeThreat(maxThreat, this.scanRecursive(json));
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const text =
            payloadSnapshot && "text" in payloadSnapshot
              ? payloadSnapshot.text || ""
              : await request
                  .clone()
                  .text()
                  .catch(() => "");
          maxThreat = this.upgradeThreat(maxThreat, this.checkValue(text));
        } else if (
          !contentType.includes("multipart/form-data") &&
          contentLength < SCAN_BODY_MAX_SIZE
        ) {
          const text =
            payloadSnapshot && "text" in payloadSnapshot
              ? payloadSnapshot.text || ""
              : await request
                  .clone()
                  .text()
                  .catch(() => "");
          maxThreat = this.upgradeThreat(maxThreat, this.checkValue(text));
        }
      } catch (err) {
        logger.debug("Safe payload scan failed (non-blocking)", {
          error: err,
        });
      }
    }

    const fullUrl = parsed.pathname + parsed.search;
    return this.upgradeThreat(maxThreat, AuthGuardService.scanUrl(fullUrl));
  }

  private scanRecursive(obj: any, depth = 0): ThreatLevel {
    if (depth > 10 || !obj) return "none";
    let maxThreat: ThreatLevel = "none";

    if (typeof obj === "string") return this.checkValue(obj);
    if (Array.isArray(obj)) {
      for (const item of obj) {
        maxThreat = this.upgradeThreat(maxThreat, this.scanRecursive(item, depth + 1));
        if (maxThreat === "critical") break;
      }
    } else if (typeof obj === "object") {
      for (const k in obj) {
        if (Object.hasOwn(obj, k)) {
          maxThreat = this.upgradeThreat(maxThreat, this.scanRecursive(obj[k], depth + 1));
          if (maxThreat === "critical") break;
        }
      }
    }
    return maxThreat;
  }

  private checkValue(value: string, checkLdap = false): ThreatLevel {
    return AuthGuardService.scanPayload(value, checkLdap);
  }

  private upgradeThreat(current: ThreatLevel, next: ThreatLevel): ThreatLevel {
    const lvls: Record<ThreatLevel, number> = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return lvls[next] > lvls[current] ? next : current;
  }

  private detectAnomalies(request: Request): AnomalyResult {
    const ua = request.headers.get("user-agent");
    if (!ua || ua.trim() === "") {
      return {
        detected: true,
        indicators: [
          {
            type: "header_anomaly",
            severity: 4,
            evidence: "Missing UA",
            timestamp: Date.now(),
          },
        ],
      };
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const size = parseInt(contentLengthHeader, 10);
      if (size > MAX_BODY_SIZE) {
        return {
          detected: true,
          indicators: [
            {
              type: "payload_anomaly",
              severity: 8,
              evidence: `Oversized: ${size}`,
              timestamp: Date.now(),
            },
          ],
        };
      }
    }

    return NO_ANOMALY;
  }

  // ========================================================================
  // STATE & RATE LIMITING
  // ========================================================================

  public async blockIp(ip: string, reason: string, tenantId?: string): Promise<void> {
    await securityStore.blockIp(ip, reason, 24 * 60 * 60);
    logger.warn(`IP Blocked: ${ip} | Reason: ${reason}`);
    metricsService.incrementSecurityViolations(tenantId);
    await this.dispatchAlert(ip, "critical", reason, tenantId);
  }

  private _skipRateLimitMemo: boolean | undefined;

  private shouldSkipRateLimit(forceSecurity: boolean): boolean {
    if (forceSecurity) return false;
    if (this._skipRateLimitMemo !== undefined) return this._skipRateLimitMemo;
    this._skipRateLimitMemo =
      building ||
      process.env.TEST_MODE === "true" ||
      process.env.VITE_TEST_MODE === "true" ||
      dev ||
      (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.TEST_MODE ===
        "true";
    return this._skipRateLimitMemo;
  }

  /**
   * Performs an adaptive rate limit check.
   * @param points - The number of points to consume (higher for suspicious requests)
   */
  public async checkRateLimit(
    ip: string,
    endpoint: string,
    tenantId?: string,
    forceSecurity = false,
    points = 1,
  ): Promise<SecurityStatus> {
    if (this.shouldSkipRateLimit(forceSecurity)) {
      return { level: "none", action: "allow" };
    }

    // Skip rate limiting for setup, bootstrap, login, health-check, WebSocket,
    // static assets, and locale-prefixed routes
    if (
      endpoint.startsWith("/setup") ||
      endpoint.startsWith("/api/system/health") ||
      endpoint.startsWith("/login") ||
      endpoint.startsWith("/en/") ||
      endpoint.startsWith("/ws") ||
      endpoint.startsWith("/_app/") ||
      endpoint === "/favicon.ico"
    ) {
      return { level: "none", action: "allow" };
    }

    const scope = resolveRateLimitScope(endpoint.split("?")[0] || endpoint);
    const bucket = this.getOrCreateLimiter(endpoint, tenantId);

    // ⚡ ADAPTIVE LOGIC: Scale points (cost) based on system pressure
    const multiplier = getPressureCostMultiplier();
    const adaptivePoints = Math.max(1, Math.ceil(points * multiplier));

    // Per-IP bucket key. v13: the native engine's storage shape differs from
    // rate-limiter-flexible's, so a fresh prefix avoids stale-key interaction.
    const key = `svelty:sec:rl:v13:${tenantId ?? "global"}:${scope.replace(/\//g, "_").replace(/^_/, "")}:${ip}`;

    // Redis primary (cluster-wide) via the shared rate-limit engine; local
    // memory fallback on any failure — fail-open, exactly like the old
    // rate-limiter-flexible driver errors behaved. Overdraft mode preserves
    // the WAF's lockout-extension semantics for oversized costs.
    let result: { allowed: boolean; retryAfterSeconds: number };
    if (redisStore.isAvailable()) {
      try {
        result = await redisStore.checkAndConsume(key, bucket, adaptivePoints, true);
      } catch (err) {
        logger.warn(
          "[Security] WAF Redis limiter unavailable — memory fallback",
          err instanceof Error ? err.message : String(err),
        );
        result = memoryStore.checkAndConsume(key, bucket, adaptivePoints, true);
      }
    } else {
      result = memoryStore.checkAndConsume(key, bucket, adaptivePoints, true);
    }

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil(result.retryAfterSeconds || 1));
      logger.warn(
        `[Security] Rate limit exceeded [IP: ${ip}, Points: ${points}, Retry: ${retryAfter}s]`,
      );
      return {
        level: "low",
        action: "throttle",
        reason: `Rate limit exceeded (Retry after ${retryAfter}s)`,
      };
    }
    return { level: "none", action: "allow" };
  }

  /** Maps threat levels to quantitative point penalties for rate limiting. */
  public getPointsForThreat(level: ThreatLevel): number {
    switch (level) {
      case "low":
        return 5;
      case "medium":
        return 20;
      case "high":
        return 50;
      case "critical":
        return 100;
      default:
        return 1;
    }
  }

  public async reportSecurityEvent(
    ip: string,
    type: ThreatIndicator["type"],
    severity: number,
    evidence: string,
    metadata?: any,
    tenantId?: string,
  ): Promise<void> {
    await this.processIndicator(
      ip,
      { type, severity, evidence, timestamp: Date.now(), metadata },
      tenantId,
    );
  }

  private async processIndicator(
    ip: string,
    indicator: ThreatIndicator,
    tenantId?: string,
  ): Promise<void> {
    const incidents = await securityStore.getIncidents(tenantId);
    let incident = incidents.find((inc) => inc.clientIp === ip && !inc.resolved);

    if (!incident) {
      incident = {
        id: `inc_${Date.now()}`,
        clientIp: ip,
        threatLevel: "none",
        indicators: [],
        responseActions: [],
        timestamp: Date.now(),
        resolved: false,
        tenantId,
      };
    }

    incident.indicators.push(indicator);
    await this.evaluateIncident(incident);
    await securityStore.addIncident(incident);
  }

  private async evaluateIncident(incident: SecurityIncident): Promise<void> {
    const now = Date.now();
    for (const policy of this.policies) {
      const active = incident.indicators.filter(
        (i) =>
          now - i.timestamp <= policy.triggers.timeWindow &&
          i.severity >= policy.triggers.severityThreshold,
      );
      if (active.length >= policy.triggers.indicatorThreshold) {
        incident.threatLevel = policy.threatLevel;
        incident.responseActions = [...policy.responses];
        await this.executeResponse(incident.clientIp, incident);
        break;
      }
    }
  }

  private async executeResponse(ip: string, incident: SecurityIncident): Promise<void> {
    for (const action of incident.responseActions) {
      if (action === "block") await this.blockIp(ip, "Automated policy block", incident.tenantId);
      if (action === "throttle") await securityStore.setThrottle(ip, 5, Date.now() + 5 * 60 * 1000);
      if (action === "warn") logger.warn(`Incident Escalation: ${ip} -> ${incident.threatLevel}`);
    }
    if (incident.threatLevel === "high" || incident.threatLevel === "critical") {
      await this.dispatchAlert(
        ip,
        incident.threatLevel,
        `Escalated to ${incident.threatLevel}`,
        incident.tenantId,
      );
    }
  }

  public async dispatchAlert(
    ip: string,
    level: ThreatLevel,
    reason: string,
    tenantId?: string,
  ): Promise<void> {
    const last = this.lastAlertTime.get(ip);
    if (last && Date.now() - last < this.ALERT_COOLDOWN) return;
    this.lastAlertTime.set(ip, Date.now());

    const webhook = process.env.SECURITY_WEBHOOK_URL;
    if (!webhook) return;

    try {
      const incidents = await securityStore.getIncidents(tenantId);
      const incident = incidents.find((inc) => inc.clientIp === ip && !inc.resolved);

      const payload = {
        type: "security_alert",
        level,
        ip,
        reason,
        tenantId,
        incidentId: incident?.id,
        indicatorsCount: incident?.indicators.length || 0,
        timestamp: new Date().toISOString(),
      };

      await safeFetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 5000,
      });
    } catch (e) {
      logger.warn("Alert failed", e);
    }
  }

  /** Periodically called by the admin UI to fetch global security telemetry. */
  public async getSecurityStats(tenantId?: string): Promise<any> {
    const incidents = await securityStore.getIncidents(tenantId);
    const last24h = Date.now() - 24 * 60 * 60 * 1000;

    return {
      activeIncidents: incidents.filter((i) => !i.resolved).length,
      totalIncidentsLast24h: incidents.filter((i) => i.timestamp >= last24h).length,
      threatDistribution: {
        low: incidents.filter((i) => i.threatLevel === "low").length,
        medium: incidents.filter((i) => i.threatLevel === "medium").length,
        high: incidents.filter((i) => i.threatLevel === "high").length,
        critical: incidents.filter((i: SecurityIncident) => i.threatLevel === "critical").length,
      },
    };
  }

  /** Returns unresolved security incidents. */
  public async getActiveIncidents(tenantId?: string): Promise<SecurityIncident[]> {
    const incidents = await securityStore.getIncidents(tenantId);
    return incidents.filter((i) => !i.resolved);
  }

  /**
   * Gracefully dumps rate limiter state synchronously during process shutdown.
   * Async writes in SIGTERM/SIGINT handlers are not guaranteed to flush before
   * the process exits — sync I/O is the only safe option here.
   */
  public destroySync(): void {
    if (building) return;
    // Only the WAF's own buckets — the shared API-engine buckets reset on restart.
    const data = memoryStore.dumpWithPrefix(WAF_KEY_PREFIX);
    const count = Object.keys(data).length;
    if (count === 0) return;

    try {
      fs.mkdirSync(path.dirname(this.DUMP_PATH), { recursive: true });
      fs.writeFileSync(this.DUMP_PATH, JSON.stringify(data), "utf8");
      logger.info(`[Security] Rate limiter state dumped synchronously (${count} buckets)`);
    } catch (err) {
      logger.error("[Security] Failed to dump rate limiter state", err);
    }
  }

  /**
   * Restores rate limiter state synchronously on service boot — the constructor
   * cannot await, and a floating async restore races getOrCreateLimiter()
   * (limiters would initialize empty and the dump file would already be gone).
   */
  private restoreStateSync(): void {
    if (building) return;
    try {
      if (!fs.existsSync(this.DUMP_PATH)) return;

      const raw = fs.readFileSync(this.DUMP_PATH, "utf8");
      const data = JSON.parse(raw) as Record<string, TokenBucketState>;
      const count = Object.keys(data).length;
      if (count > 0) {
        memoryStore.restore(data);
        logger.info(`[Security] Rate limiter state loaded (${count} pending restores)`);
      }
      fs.unlinkSync(this.DUMP_PATH);
    } catch (err) {
      logger.error("[Security] Failed to restore rate limiter state", err);
    }
  }
}

// ============================================================================
// EXPORT & LIFECYCLE
// ============================================================================

const g = globalThis as any;
if (g.__SVELTY_SECURITY_INSTANCE__) {
  try {
    // If destroySync exists, call it to prevent leaks on HMR
    if (typeof g.__SVELTY_SECURITY_INSTANCE__.destroySync === "function") {
      g.__SVELTY_SECURITY_INSTANCE__.destroySync();
    }
  } catch {}
}

/**
 * Singleton instance of the SecurityResponseService.
 * Recreates the instance if it lacks critical methods (HMR safety).
 */
export const securityResponseService = (() => {
  if (
    !g.__SVELTY_SECURITY_INSTANCE__ ||
    typeof g.__SVELTY_SECURITY_INSTANCE__.destroySync !== "function"
  )
    g.__SVELTY_SECURITY_INSTANCE__ = new SecurityResponseService();
  return g.__SVELTY_SECURITY_INSTANCE__;
})();

// Process hooks for persistent state
if (!(building || g.__SVELTY_SECURITY_READY__)) {
  process.on("SIGTERM", () => securityResponseService.destroySync());
  process.on("SIGINT", () => securityResponseService.destroySync());
  g.__SVELTY_SECURITY_READY__ = true;
}
