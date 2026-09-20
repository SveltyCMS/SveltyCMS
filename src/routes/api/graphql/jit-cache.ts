/**
 * @file src/routes/api/graphql/jit-cache.ts
 * @description Bounded LRU JIT cache for compiled GraphQL query execution plans.
 * Prevents re-compiling DocumentNode ASTs on repeated HTTP query strings.
 */

import type { JITCache } from "@envelop/graphql-jit";

export class BoundedJITCache implements JITCache {
  private readonly max: number;
  private readonly map = new Map<string, any>();

  constructor(max = 1000) {
    this.max = max;
  }

  get(key: string): any {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // LRU refresh: promote to most recent
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, value: any): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}
