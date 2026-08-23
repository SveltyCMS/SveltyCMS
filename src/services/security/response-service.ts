/**
 * @file src/services/security/response-service.ts
 * @description Enterprise-grade automated security response system with dynamic threat detection
 */

import { logger } from "@utils/logger";
import { building, dev } from "$app/env";
import { metricsService } from "../observability/metrics-service";
import { AuthGuardService } from "./auth-guard";
import { securityStore } from "./state-store";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { cacheService } from "@src/databases/cache/cache-service";
import fs from "node:fs";
import path from "node:path";
import { systemMonitor } from "@utils/system-monitor";
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

// ============================================================================
// SECURITY RESPONSE SERVICE
// ============================================================================

export class SecurityResponseService {
  private readonly policies: SecurityPolicy[] = [];
  private readonly limiters = new Map<string, RateLimiterMemory | RateLimiterRedis>();
  private readonly lastAlertTime = new Map<string, number>();
  private readonly ALERT_COOLDOWN = 5 * 60 * 1000;
  private restoredData: Record<string, any> = {};
  private readonly DUMP_PATH = path.resolve(process.cwd(), "config/database/security_rl_dump.json");

  constructor() {
    this.policies = [...DEFAULT_POLICIES];
    this.restoreStateSync();
  }

  private async getOrCreateLimiter(
    endpoint: string,
    tenantId?: string,
  ): Promise<RateLimiterMemory | RateLimiterRedis> {
    // Normalize away query strings so /api/graphql?foo=1 and /api/graphql share
    // one limiter key instead of creating a fresh bucket per query string.
    const cleanEndpoint = endpoint.split("?")[0] || endpoint;
    const scope = resolveRateLimitScope(cleanEndpoint);
    const cacheKey = tenantId ? `${scope}_${tenantId}` : scope;
    const cached = this.limiters.get(cacheKey);
    if (cached) return cached;

    // SECURITY_RATE_LIMIT_SCALE raises the whole WAF ceiling uniformly for
    // load-testing/benchmark deployments (machinery stays fully active).
    const limit = (ENDPOINT_RATE_LIMITS[scope] || GLOBAL_RATE_LIMIT) * SECURITY_RATE_LIMIT_SCALE;

    const keyPrefix = tenantId
      ? `svelty:sec:rl:v12:${tenantId}:${scope.replace(/\//g, "_").replace(/^_/, "")}`
      : `svelty:sec:rl:v12:${scope.replace(/\//g, "_").replace(/^_/, "")}`;

    const options = {
      points: limit,
      duration: 60, // 1 minute window
      keyPrefix,
    };

    // 🚀 Robust redis client acquisition with fallback
    const redisClient = (cacheService as any).getRedisClient ? cacheService.getRedisClient() : null;
    let limiter: RateLimiterMemory | RateLimiterRedis;

    if (redisClient && redisClient.status === "ready") {
      limiter = new RateLimiterRedis({ storeClient: redisClient, ...options });
    } else {
      limiter = new RateLimiterMemory(options);
      // 🚀 Restore state if available
      if (this.restoredData[cacheKey]) {
        try {
          limiter.restore(this.restoredData[cacheKey]);
          delete this.restoredData[cacheKey]; // Clear after restore
        } catch (err) {
          logger.debug(`[Security] Failed to restore state for ${cacheKey}`, err);
        }
      }
    }

    this.limiters.set(cacheKey, limiter);
    return limiter;
  }

  public reset(): void {
    this.limiters.clear();
    this.lastAlertTime.clear();
    this.restoredData = {};
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
    if (isReadOnly && !forceSecurity) {
      const ua = request.headers.get("user-agent") || "";
      if (
        ua &&
        isCleanRequestSurface(pathname) &&
        isCleanRequestSurface(search) &&
        AuthGuardService.scanUserAgent(ua) === "none"
      ) {
        if (clientIp) {
          const throttle = securityStore.getThrottleSync(clientIp);
          if (throttle && throttle.until > Date.now()) {
            return { level: "medium", action: "throttle", reason: "IP is throttled" };
          }
        }
        const isApiPath = pathname.startsWith("/api/");
        if (!isApiPath || this.shouldSkipRateLimit(false)) {
          return ALLOW_STATUS;
        }
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

    const threatOrPromise = this.analyzePayload(request, payloadSnapshot, pathname, search);
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

    // 99.9% GET allow-path: one alphabet pass, no concat, no second URL scan
    if (
      !isMutation &&
      isCleanRequestSurface(parsed.pathname) &&
      isCleanRequestSurface(parsed.search) &&
      AuthGuardService.scanUserAgent(userAgent) === "none"
    ) {
      return "none";
    }

    let maxThreat: ThreatLevel = "none";
    const urlThreat = this.checkValue(
      parsed.search ? `${parsed.pathname} ${parsed.search}` : parsed.pathname,
      parsed.pathname.includes("/scim/"),
    );
    if (urlThreat === "critical") return "critical";
    maxThreat = this.upgradeThreat(maxThreat, urlThreat);
    maxThreat = this.upgradeThreat(maxThreat, AuthGuardService.scanUserAgent(userAgent));

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
      for (const value of Object.values(obj)) {
        maxThreat = this.upgradeThreat(maxThreat, this.scanRecursive(value, depth + 1));
        if (maxThreat === "critical") break;
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

    try {
      const limiter = await this.getOrCreateLimiter(endpoint, tenantId);

      // ⚡ ADAPTIVE LOGIC: Scale points (cost) based on system pressure
      const multiplier = systemMonitor.getAdaptiveCostMultiplier();
      const adaptivePoints = Math.max(1, Math.ceil(points * multiplier));

      await limiter.consume(ip, adaptivePoints);
      return { level: "none", action: "allow" };
    } catch (rej: any) {
      // 🛡️ FAIL-OPEN on driver/storage errors: only a real rate-limit rejection
      // (RateLimiterRes with msBeforeNext) should throttle. A transient Redis
      // outage must NOT lock out every user on the platform.
      if (rej && typeof rej.msBeforeNext === "number") {
        const retryAfter = Math.ceil((rej.msBeforeNext || 1000) / 1000);
        logger.warn(
          `[Security] Rate limit exceeded [IP: ${ip}, Points: ${points}, Retry: ${retryAfter}s]`,
        );
        return {
          level: "low",
          action: "throttle",
          reason: `Rate limit exceeded (Retry after ${retryAfter}s)`,
        };
      }
      logger.error("[Security] Rate limiter storage error - failing open", rej);
      return { level: "none", action: "allow" };
    }
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
    const data: Record<string, any> = {};
    let count = 0;
    for (const [key, limiter] of this.limiters.entries()) {
      if (limiter instanceof RateLimiterMemory) {
        data[key] = limiter.dump();
        count++;
      }
    }
    if (count === 0) return;

    try {
      fs.mkdirSync(path.dirname(this.DUMP_PATH), { recursive: true });
      fs.writeFileSync(this.DUMP_PATH, JSON.stringify(data), "utf8");
      logger.info(`[Security] Rate limiter state dumped synchronously (${count} limiters)`);
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
      this.restoredData = JSON.parse(raw);
      const count = Object.keys(this.restoredData).length;
      if (count > 0) {
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
