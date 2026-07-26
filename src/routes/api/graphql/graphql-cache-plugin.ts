/**
 * @file src/routes/api/graphql/graphql-cache-plugin.ts
 * @description Envelop plugin for GraphQL response caching using cacheService L1 LRU.
 *
 * ### Features:
 * - L1 in-memory cache via cacheService (sub-ms hits)
 * - Cache key: gql:resp:{queryHash}:{tenant}:{role}
 * - 30s TTL with auto-expiry via LRU
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

const GQL_CACHE_TTL_S = 30;

function hashQuery(query: string, variables: Record<string, unknown> = {}): string {
  const normalized = JSON.stringify({ query, variables }, Object.keys({ query, variables }).sort());
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash ^ (normalized.length << 3)).toString(36);
}

function isBenchmark(): boolean {
  return process.env.BENCHMARK === "true" || process.env.BENCHMARK_MODE === "true";
}

interface CacheEntry {
  result: any;
  cachedAt: number;
}

function buildCacheKey(ctx: any, query: string, variables: Record<string, unknown>): string {
  const tenantId = ctx?.tenantId ?? "global";
  const userRole = ctx?.user?.role ?? "anonymous";
  const queryHash = hashQuery(query, variables);
  return `gql:resp:${queryHash}:${tenantId}:${userRole}`;
}

export function useGraphQLResponseCache(): any {
  // Skip entirely in benchmark mode
  if (isBenchmark()) return {};

  return {
    /**
     * Cache-read phase: check L1 before execution.
     */
    onExecute({ args, setResultAndStopExecution }: any) {
      try {
        const ctx = args.contextValue;
        if (!ctx || ctx?.operation?.operation !== "query") return;

        const query = ctx?.params?.query || ctx?.request?.query || "";
        const variables = args.variableValues ?? ctx?.request?.variables ?? {};
        if (!query) return;

        const cacheKey = buildCacheKey(ctx, String(query), variables);
        const cached = cacheService.getSync<CacheEntry>(cacheKey, ctx?.tenantId ?? "global");
        if (cached?.result) {
          setResultAndStopExecution(cached.result);
        }
      } catch {
        // Cache miss or error — let execution proceed normally
      }
    },

    /**
     * Cache-write phase: after successful execution, store result.
     */
    onExecuteDone({ result, args }: any) {
      try {
        const ctx = args.contextValue;
        if (!ctx || ctx?.operation?.operation !== "query") return;
        if (result?.errors?.length) return;

        const query = ctx?.params?.query || ctx?.request?.query || "";
        const variables = args.variableValues ?? ctx?.request?.variables ?? {};
        if (!query) return;

        const cacheKey = buildCacheKey(ctx, String(query), variables);
        const entry: CacheEntry = { result, cachedAt: Date.now() };

        cacheService
          .set(cacheKey, entry, GQL_CACHE_TTL_S, ctx?.tenantId ?? "global", CacheCategory.API, [
            "graphql",
          ])
          .catch(() => {});
      } catch {
        // Non-critical — cache write failure shouldn't affect the response
      }
    },
  };
}
