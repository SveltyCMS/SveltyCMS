/**
 * @file src/services/security/response-service.ts
 * @description Enterprise-grade automated security response system with dynamic threat detection
 */

import { logger } from "@utils/logger";
import { building } from "$app/environment";
import { metricsService } from "../observability/metrics-service";
import { AuthGuardService } from "./auth-guard";
import { securityStore } from "./state-store";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { cacheService } from "@src/databases/cache/cache-service";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  SecurityIncident,
  SecurityPolicy,
  SecurityStatus,
  ThreatIndicator,
  ThreatLevel,
  AnomalyResult,
} from "./types";

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
  "/api/scim/v2": 30,
  "/api/media/upload": 20,
  "/api/token/create-token": 5,
  "/api/website-tokens": 30,
  "/api/permission/update": 30,
  "/api/collections": 100,
};

const GLOBAL_RATE_LIMIT = 100;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const SCAN_BODY_MAX_SIZE = 32768; // 32KB

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
    this.restoreState();
  }

  private async getOrCreateLimiter(
    endpoint: string,
    tenantId?: string,
  ): Promise<RateLimiterMemory | RateLimiterRedis> {
    const isGraphql = endpoint.includes("/api/graphql");
    const scope = ENDPOINT_RATE_LIMITS[endpoint] ? endpoint : isGraphql ? "graphql" : "global";
    const limit = ENDPOINT_RATE_LIMITS[scope] || GLOBAL_RATE_LIMIT;

    const cacheKey = tenantId ? `${scope}_${tenantId}` : scope;
    const cached = this.limiters.get(cacheKey);
    if (cached) return cached;

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

    if (redisClient) {
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

  /** Analyzes a request for potential security threats. */
  public async analyzeRequest(
    request: Request,
    clientIp: string,
    tenantId?: string,
  ): Promise<SecurityStatus> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. IP Block check
    if (await securityStore.isBlocked(clientIp)) {
      return { level: "critical", action: "block", reason: "IP is blocked" };
    }

    const forceSecurity = request.headers.get("x-test-security") === "true";

    // 2. Rate Limit check (Basic protection)
    const rateLimit = await this.checkRateLimit(clientIp, pathname, tenantId, forceSecurity);
    if (rateLimit.action !== "allow") return rateLimit;

    // 3. Throttling check
    const throttle = await securityStore.getThrottle(clientIp);
    if (throttle && throttle.until > Date.now()) {
      return { level: "medium", action: "throttle", reason: "IP is throttled" };
    }

    // 4. Anomaly detection
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

    // 5. Payload pattern analysis
    const threatLevel = await this.analyzePayload(request);
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

    return { level: "none", action: "allow" };
  }

  private async analyzePayload(request: Request): Promise<ThreatLevel> {
    const url = new URL(request.url);
    let maxThreat: ThreatLevel = "none";

    // 1. Scan URL
    const urlThreat = this.checkValue(
      `${url.pathname} ${url.search}`,
      url.pathname.includes("/scim/"),
    );
    if (urlThreat === "critical") return "critical";
    maxThreat = this.upgradeThreat(maxThreat, urlThreat);

    // 2. Scan User Agent
    const userAgent = request.headers.get("user-agent") || "";
    maxThreat = this.upgradeThreat(maxThreat, AuthGuardService.scanUserAgent(userAgent));

    // 3. Scan Body (Only for state-changing methods)
    const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
    if (mutationMethods.includes(request.method) && request.body) {
      const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_BODY_SIZE) return "high"; // Early reject oversized payloads

      if (contentLength > 0) {
        try {
          const contentType = request.headers.get("content-type") || "";
          const clone = request.clone();

          if (contentType.includes("application/json") && contentLength < SCAN_BODY_MAX_SIZE * 2) {
            const json = await clone.json().catch(() => ({}));
            maxThreat = this.upgradeThreat(maxThreat, this.scanRecursive(json));
          } else if (
            contentType.includes("application/x-www-form-urlencoded") ||
            contentType.includes("multipart/form-data")
          ) {
            const formData = await clone.formData().catch(() => new FormData());
            for (const value of formData.values()) {
              if (typeof value === "string") {
                maxThreat = this.upgradeThreat(maxThreat, this.checkValue(value));
                if (maxThreat === "critical") break;
              }
            }
          } else if (contentLength < SCAN_BODY_MAX_SIZE) {
            // Fallback text scan for unknown types, with strict length cap
            const text = await clone.text().catch(() => "");
            maxThreat = this.upgradeThreat(maxThreat, this.checkValue(text));
          }
        } catch (err) {
          logger.debug("Safe payload scan failed (non-blocking)", { error: err });
        }
      }
    }

    // App-specific threats
    const fullUrl = url.pathname + url.search;
    maxThreat = this.upgradeThreat(maxThreat, AuthGuardService.scanUrl(fullUrl));

    return maxThreat;
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
    const indicators: ThreatIndicator[] = [];
    const now = Date.now();

    const ua = request.headers.get("user-agent");
    if (!ua || ua.trim() === "") {
      indicators.push({
        type: "header_anomaly",
        severity: 4,
        evidence: "Missing UA",
        timestamp: now,
      });
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const size = parseInt(contentLengthHeader, 10);
      if (size > MAX_BODY_SIZE) {
        indicators.push({
          type: "payload_anomaly",
          severity: 8,
          evidence: `Oversized: ${size}`,
          timestamp: now,
        });
      }
    }

    return { detected: indicators.length > 0, indicators };
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
    // 🚀 HARDENING: Robust test mode detection to prevent rate-limit flicker in CI
    const isTest =
      process.env.TEST_MODE === "true" ||
      process.env.VITE_TEST_MODE === "true" ||
      (globalThis as any).process?.env?.TEST_MODE === "true";

    if ((building || isTest) && !forceSecurity) {
      return { level: "none", action: "allow" };
    }

    try {
      const limiter = await this.getOrCreateLimiter(endpoint, tenantId);
      await limiter.consume(ip, points);
      return { level: "none", action: "allow" };
    } catch (rej: any) {
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

      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
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
   * Gracefully shuts down the security service, dumping state to disk.
   */
  public async destroy(): Promise<void> {
    await this.dumpState();
  }

  /**
   * Dumps current rate limiter state to a JSON file for persistence.
   */
  private async dumpState(): Promise<void> {
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
      await fs.mkdir(path.dirname(this.DUMP_PATH), { recursive: true });
      await fs.writeFile(this.DUMP_PATH, JSON.stringify(data), "utf8");
      logger.info(`[Security] Rate limiter state dumped (${count} limiters)`);
    } catch (err) {
      logger.error("[Security] Failed to dump rate limiter state", err);
    }
  }

  /**
   * Restores rate limiter state from a JSON file.
   */
  private async restoreState(): Promise<void> {
    if (building) return;
    try {
      if (
        !(await fs
          .access(this.DUMP_PATH)
          .then(() => true)
          .catch(() => false))
      )
        return;

      const raw = await fs.readFile(this.DUMP_PATH, "utf8");
      this.restoredData = JSON.parse(raw);
      const count = Object.keys(this.restoredData).length;
      if (count > 0) {
        logger.info(`[Security] Rate limiter state loaded (${count} pending restores)`);
      }
      // Clean up file after loading to prevent stale restores on crash
      await fs.unlink(this.DUMP_PATH).catch(() => {});
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
    // If destroy exists, call it to prevent leaks on HMR
    if (typeof g.__SVELTY_SECURITY_INSTANCE__.destroy === "function") {
      g.__SVELTY_SECURITY_INSTANCE__.destroy();
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
    typeof g.__SVELTY_SECURITY_INSTANCE__.destroy !== "function"
  )
    g.__SVELTY_SECURITY_INSTANCE__ = new SecurityResponseService();
  return g.__SVELTY_SECURITY_INSTANCE__;
})();

// Process hooks for persistent state
if (!(building || g.__SVELTY_SECURITY_READY__)) {
  process.on("SIGTERM", () => securityResponseService.destroy());
  process.on("SIGINT", () => securityResponseService.destroy());
  g.__SVELTY_SECURITY_READY__ = true;
}
