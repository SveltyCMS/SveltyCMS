/**
 * @file src/routes/api/graphql/resolvers/seo.ts
 * @description SEO-related GraphQL resolvers for redirects and metadata.
 */

import { dbAdapter } from "@src/databases/db";
import { logger } from "@utils/logger";
import type { User } from "@src/databases/auth/types";
import type { PublicationFilter } from "@src/utils/security/publication-policy";

interface GraphQLContext {
  tenantId?: string | null;
  user?: User;
  /** Publication visibility of the request (resolved in +server.ts context). */
  publicationFilter?: PublicationFilter;
}

export const seoTypeDefs = `
	type Redirect {
		from: String!
		to: String!
		type: Int!
		isRegex: Boolean
	}

	extend type Query {
		redirect(from: String!): Redirect
	}
`;

export const seoResolvers = {
  Query: {
    redirect: async (_: unknown, args: { from: string }, context: GraphQLContext) => {
      const { tenantId } = context;
      const activeTenantId = tenantId || "default";

      try {
        if (!dbAdapter) return null;

        // Guardian: bound the untrusted URL input before any regex test so a
        // catastrophic (ReDoS-prone) admin pattern cannot backtrack against an
        // arbitrarily large string. Real request paths are far below this cap.
        const input = args.from ?? "";
        if (input.length > 4096) return null;

        // 1. Check exact match
        const result = await dbAdapter.crud.findOne("redirects", {
          from: input,
          tenantId: activeTenantId,
          active: true,
        } as any);

        if (result.success && result.data) {
          return result.data;
        }

        // 2. Check regex matches
        const allRedirects = await dbAdapter.crud.findMany("redirects", {
          tenantId: activeTenantId,
          active: true,
          isRegex: true,
        } as any);

        if (allRedirects.success && Array.isArray(allRedirects.data)) {
          for (const r of allRedirects.data as any[]) {
            try {
              const regex = getCompiledRegex(activeTenantId, r.from, r._id ?? r.id);
              if (regex === null) continue;
              if (regex.test(input)) {
                return r;
              }
            } catch {
              // Ignore invalid regex
            }
          }
        }

        return null;
      } catch (error) {
        logger.error("Error in graphql redirect resolver:", error);
        return null;
      }
    },
  },
};

/**
 * Compile regex redirect patterns once and cache them per (tenantId, source).
 * Recompiling `new RegExp(from)` per request, for every regex rule, is pure waste
 * on a hot path and re-runs the same (potentially catastrophic) compilation.
 * Invalid patterns are cached as `null` so they are not retried each request.
 */
const redirectRegexCache = new Map<string, RegExp | null>();

function getCompiledRegex(tenantId: string, from: string, id: string): RegExp | null {
  // `from` may be an empty/missing source; a wildcard pattern like "" or ".*"
  // would match everything — treat as invalid to avoid unbounded matches.
  if (typeof from !== "string" || from.length === 0) return null;
  const key = `${tenantId}\u0000${from}\u0000${id ?? ""}`;
  let regex = redirectRegexCache.get(key);
  if (regex === undefined) {
    try {
      regex = new RegExp(from);
    } catch {
      regex = null;
    }
    if (redirectRegexCache.size >= 200) {
      // Simple bounded cache eviction: drop the oldest entry.
      const oldestKey = redirectRegexCache.keys().next().value;
      if (oldestKey !== undefined) redirectRegexCache.delete(oldestKey);
    }
    redirectRegexCache.set(key, regex);
  }
  return regex;
}
