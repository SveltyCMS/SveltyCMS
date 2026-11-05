/**
 * @file src/routes/(app)/dashboard/widget-storage.ts
 * @description Isolated, sandboxed client-side storage for SveltyCMS dashboard widgets.
 *
 * Features:
 * - Scoped keys per tenant, user, and widget id to prevent cross-widget pollution
 * - Per-widget quota caps (256 KB) to prevent LocalStorage exhaustion
 * - Automatic TTL expiration cleanup on read
 * - Resilient memory-map fallback when LocalStorage is disabled, blocked, or quota-exceeded
 */

import { logger } from "@utils/logger";
import type { SandboxedStorage } from "./widget-contract";

const MAX_WIDGET_STORAGE_BYTES = 256 * 1024; // 256 KB per widget instance

function getStorageSafe(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    // Probe access
    const testKey = "__svelty_storage_probe__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

interface StoredEnvelope<T = unknown> {
  data: T;
  timestamp: number;
  ttl?: number;
}

/**
 * Creates an isolated sandboxed storage instance for a specific widget.
 */
export function createWidgetStorage(
  widgetId: string,
  tenantId: string = "global",
  userId: string = "anon",
): SandboxedStorage {
  const prefix = `svelty_wgt:${tenantId}:${userId}:${widgetId}:`;
  // Per-instance fallback. A module-global map would leak widget data between
  // SSR requests (and between users in the same worker).
  const memoryStorageFallback = new Map<string, string>();

  function currentUsage(excludingKey?: string): number {
    let total = 0;
    for (const [key, value] of memoryStorageFallback) {
      if (key.startsWith(prefix) && key !== excludingKey) total += utf8ByteLength(value);
    }
    const storage = getStorageSafe();
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key || !key.startsWith(prefix) || key === excludingKey) continue;
          total += utf8ByteLength(storage.getItem(key) ?? "");
        }
      } catch {
        // Storage enumeration can fail in private mode; the per-value guard
        // below still applies.
      }
    }
    return total;
  }

  return {
    get<T = unknown>(key: string, defaultValue?: T): T | null {
      const fullKey = prefix + key;
      const storage = getStorageSafe();
      let raw: string | null = null;

      try {
        raw = storage ? storage.getItem(fullKey) : null;
        if (raw === null) raw = memoryStorageFallback.get(fullKey) ?? null;
      } catch (err) {
        logger.debug("[WidgetStorage] Read error, checking memory fallback:", err);
        raw = memoryStorageFallback.get(fullKey) ?? null;
      }

      if (!raw) return defaultValue ?? null;

      try {
        const envelope = JSON.parse(raw) as StoredEnvelope<T>;
        if (envelope && typeof envelope === "object" && "timestamp" in envelope) {
          if (envelope.ttl && Date.now() - envelope.timestamp > envelope.ttl) {
            // Expired
            if (storage) {
              try {
                storage.removeItem(fullKey);
              } catch {
                // Ignore removal failure
              }
            }
            memoryStorageFallback.delete(fullKey);
            return defaultValue ?? null;
          }
          return envelope.data;
        }
        return raw as unknown as T;
      } catch {
        return defaultValue ?? null;
      }
    },

    set<T = unknown>(key: string, value: T, ttlMs?: number): boolean {
      const fullKey = prefix + key;
      const storage = getStorageSafe();
      const envelope: StoredEnvelope<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttlMs && ttlMs > 0 ? ttlMs : undefined,
      };

      let serialized = "";
      try {
        serialized = JSON.stringify(envelope);
      } catch (err) {
        logger.warn("[WidgetStorage] Value serialization error:", err);
        return false;
      }

      // Check quota: cap is per widget instance, not per individual value.
      // Existing bytes for this key are replaced, so subtract them first.
      const nextBytes = utf8ByteLength(serialized);
      if (nextBytes > MAX_WIDGET_STORAGE_BYTES) {
        logger.warn(
          `[WidgetStorage] Value exceeds max widget quota (${MAX_WIDGET_STORAGE_BYTES} bytes): ${nextBytes} bytes`,
        );
        return false;
      }
      if (currentUsage(fullKey) + nextBytes > MAX_WIDGET_STORAGE_BYTES) {
        logger.warn(
          `[WidgetStorage] Widget "${widgetId}" exceeded its ${MAX_WIDGET_STORAGE_BYTES}-byte storage quota`,
        );
        return false;
      }

      if (storage) {
        try {
          storage.setItem(fullKey, serialized);
          memoryStorageFallback.delete(fullKey);
          return true;
        } catch (err) {
          logger.warn(
            "[WidgetStorage] LocalStorage setItem failed (quota exceeded?), falling back to memory:",
            err,
          );
        }
      }

      memoryStorageFallback.set(fullKey, serialized);
      return true;
    },

    remove(key: string): void {
      const fullKey = prefix + key;
      const storage = getStorageSafe();
      if (storage) {
        try {
          storage.removeItem(fullKey);
        } catch {
          // Ignore
        }
      }
      memoryStorageFallback.delete(fullKey);
    },

    clear(): void {
      const storage = getStorageSafe();
      if (storage) {
        try {
          const toRemove: string[] = [];
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k && k.startsWith(prefix)) {
              toRemove.push(k);
            }
          }
          for (const k of toRemove) {
            storage.removeItem(k);
          }
        } catch {
          // Ignore
        }
      }

      for (const k of memoryStorageFallback.keys()) {
        if (k.startsWith(prefix)) {
          memoryStorageFallback.delete(k);
        }
      }
    },
  };
}
