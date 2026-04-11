/**
 * @file src/services/security-state-store.ts
 * @description Persistent security state storage using Redis with memory fallback.
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger.server";
import type { SecurityIncident } from "./security-types";

const PREFIX = "svelty:sec:";

export class PersistentSecurityStore {
  /** Checks if an IP is blocked. */
  async isBlocked(ip: string): Promise<boolean> {
    return !!(await cacheService.get<string>(`${PREFIX}block:${ip}`));
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

  /** Gets throttle factor for an IP. */
  async getThrottle(
    ip: string,
  ): Promise<{ throttled: boolean; factor: number; until: number } | null> {
    const raw = await cacheService.get<string>(`${PREFIX}throttle:${ip}`);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      if (data.until <= Date.now()) {
        await cacheService.delete(`${PREFIX}throttle:${ip}`);
        return null;
      }
      return { throttled: true, factor: data.factor, until: data.until };
    } catch {
      return null;
    }
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
