/**
 * @file src/databases/cache/inmemory-store.ts
 * @description In-memory cache store implementation with tag support and TTL.
 */

import { logger } from "@utils/logger";
import type { CacheStore } from "./types";
import type { RedisClientType } from "redis";

// In-memory cache store implementation with tag support and TTL.
export class InMemoryStore implements CacheStore {
  private readonly cache = new Map<string, { value: any; expiresAt: number; tags?: string[] }>();
  private readonly tagMap = new Map<string, Set<string>>();
  private isInitialized = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  // 🚀 COMPILED REGEX CACHE: Avoids new RegExp() allocation on every clearByPattern.
  // Patterns like "collection:*" are compiled once and reused.
  private readonly patternCache = new Map<string, RegExp>();
  private readonly MAX_PATTERN_CACHE = 64;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.interval = setInterval(() => this.cleanup(), 60_000);
    this.isInitialized = true;
    logger.info("In-memory cache initialized (Zero-serialization mode).");
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.removeFromTags(key, item.tags || []);
        this.cache.delete(key);
      }
    }
  }

  private removeFromTags(key: string, tags: string[]) {
    for (const tag of tags) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagMap.delete(tag);
        }
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.removeFromTags(key, item.tags || []);
      this.cache.delete(key);
      return null;
    }

    // Near-zero latency: Return direct reference for maximum speed.
    // In strict enterprise mode, we could use structuredClone(item.value) to prevent mutations.
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    // Remove from old tags if exists
    const existing = this.cache.get(key);
    if (existing) {
      this.removeFromTags(key, existing.tags || []);
    }

    // Zero-overhead: Store direct reference
    this.cache.set(key, { value, expiresAt, tags });

    if (tags) {
      for (const tag of tags) {
        let keys = this.tagMap.get(tag);
        if (!keys) {
          keys = new Set();
          this.tagMap.set(tag, keys);
        }
        keys.add(key);
      }
    }
  }

  async delete(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const existing = this.cache.get(k);
      if (existing) {
        this.removeFromTags(k, existing.tags || []);
      }
      this.cache.delete(k);
    }
  }

  async clearByPattern(pattern: string): Promise<void> {
    // 🚀 COMPILED REGEX CACHE: Reuse compiled patterns, evict oldest when full
    let regex = this.patternCache.get(pattern);
    if (!regex) {
      regex = new RegExp(pattern.replace(/\*/g, ".*"));
      if (this.patternCache.size >= this.MAX_PATTERN_CACHE) {
        // Evict oldest entry (first key in Map insertion order)
        const firstKey = this.patternCache.keys().next().value;
        if (firstKey) this.patternCache.delete(firstKey);
      }
      this.patternCache.set(pattern, regex);
    }
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        await this.delete(key);
      }
    }
  }

  async clearByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        const keysArray = Array.from(keys);
        for (const key of keysArray) {
          await this.delete(key);
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
    this.tagMap.clear();
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.isInitialized = false;
    logger.info("In-memory cache disconnected.");
  }

  public getStats() {
    return {
      size: this.cache.size,
      items: Array.from(this.cache.keys()),
    };
  }

  getClient(): RedisClientType | null {
    return null;
  }
}
