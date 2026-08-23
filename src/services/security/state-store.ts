/**
 * @file src/services/security/state-store.ts
 * @description Persistent security state storage using Redis with memory fallback.
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import type { SecurityIncident } from "./types";

const PREFIX = "svelty:sec:";

let _l2At = 0;
let _l2Open = false;

function l2IsOpen(): boolean {
  const now = Date.now();
  if (now - _l2At < 250) return _l2Open;
  const l2 = cacheService.getRedisClient();
  _l2Open = Boolean(l2 && l2.isOpen);
  _l2At = now;
  return _l2Open;
}

export class PersistentSecurityStore {
  /**
   * Checks if an IP is blocked.
   * L1 is the source of truth when Redis is down (set() always writes L1).
   * With Redis up, L1 miss still reads L2 so multi-instance blocks propagate.
   */
  async isBlocked(ip: string): Promise<boolean> {
    const key = `${PREFIX}block:${ip}`;
    if (cacheService.getSync<string>(key)) return true;
    if (!l2IsOpen()) return false;
    return !!(await cacheService.get<string>(key));
  }

  /** Synchronous L1 block check — no microtask. Redis misses still use `isBlocked()`. */
  isBlockedSync(ip: string): boolean {
    return !!cacheService.getSync<string>(`${PREFIX}block:${ip}`);
  }

  /** True when L2 Redis is up and L1 miss must be confirmed against it. */
  needsDistributedLookup(): boolean {
    return l2IsOpen();
  }

  /** Blocks an IP address with TTL (seconds). */
  async blockIp(ip: string, reason: string, ttlSeconds: number): Promise<void> {
    await cacheService.set(`${PREFIX}block:${ip}`, reason, ttlSeconds);
    logger.warn(`Security Store: IP Blocked: ${ip} | Reason: ${reason} | TTL: ${ttlSeconds}s`);
  }

  /** Unblocks an IP. */
  async unblockIp(ip: string): Promise<void> {
    await cacheService.delete(`${PREFIX}block:${ip}`);
  }

  /** Sets a throttle factor for an IP. */
  async setThrottle(ip: string, factor: number, untilMs: number): Promise<void> {
    const ttl = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
    if (ttl > 0) {
      await cacheService.set(
        `${PREFIX}throttle:${ip}`,
        JSON.stringify({ factor, until: untilMs }),
        ttl,
      );
    }
  }

  private parseThrottle(
    raw: string | null | undefined,
    ip: string,
  ): { throttled: boolean; factor: number; until: number } | null {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as { factor?: number; until?: number };
      if (!data.until || data.until <= Date.now()) {
        void cacheService.delete(`${PREFIX}throttle:${ip}`).catch(() => {});
        return null;
      }
      return { throttled: true, factor: data.factor ?? 1, until: data.until };
    } catch {
      return null;
    }
  }

  /** Gets throttle factor for an IP. */
  async getThrottle(
    ip: string,
  ): Promise<{ throttled: boolean; factor: number; until: number } | null> {
    const key = `${PREFIX}throttle:${ip}`;
    const l1 = cacheService.getSync<string>(key);
    if (l1) return this.parseThrottle(l1, ip);
    if (!l2IsOpen()) return null;
    return this.parseThrottle(await cacheService.get<string>(key), ip);
  }

  /** Synchronous L1 throttle check — no microtask. */
  getThrottleSync(ip: string): { throttled: boolean; factor: number; until: number } | null {
    return this.parseThrottle(cacheService.getSync<string>(`${PREFIX}throttle:${ip}`), ip);
  }

  /** Adds an incident to the store. */
  async addIncident(incident: SecurityIncident): Promise<void> {
    const key = `${PREFIX}incidents:${incident.tenantId || "global"}`;
    let incidents = (await cacheService.get<SecurityIncident[]>(key)) || [];

    const idx = incidents.findIndex((i) => i.id === incident.id);
    if (idx > -1) {
      incidents[idx] = incident;
    } else {
      incidents.push(incident);
    }

    // Keep only last 100 incidents per tenant in cache to avoid growth issues
    if (incidents.length > 100) incidents = incidents.slice(-100);

    await cacheService.set(key, incidents, 7 * 24 * 60 * 60); // 7 days retention
  }

  /** Gets active incidents for a tenant. */
  async getIncidents(tenantId?: string): Promise<SecurityIncident[]> {
    const key = `${PREFIX}incidents:${tenantId || "global"}`;
    return (await cacheService.get<SecurityIncident[]>(key)) || [];
  }

  /** Resolves an incident. */
  async resolveIncident(id: string, notes: string, tenantId: string = "global"): Promise<boolean> {
    const key = `${PREFIX}incidents:${tenantId}`;
    const incidents = await cacheService.get<SecurityIncident[]>(key);
    if (incidents) {
      const idx = incidents.findIndex((i) => i.id === id);
      if (idx > -1) {
        incidents[idx].resolved = true;
        incidents[idx].notes = notes;
        await cacheService.set(key, incidents, 7 * 24 * 60 * 60);
        return true;
      }
    }
    return false;
  }
}

export const securityStore = new PersistentSecurityStore();
