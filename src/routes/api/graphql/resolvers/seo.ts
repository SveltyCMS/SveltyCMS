/**
 * @file src/routes/api/graphql/resolvers/seo.ts
 * @description SEO-related GraphQL resolvers for redirects and metadata.
 */

import { dbAdapter } from "@src/databases/db";
import { logger } from "@utils/logger";
import type { User } from "@src/databases/auth/types";

interface GraphQLContext {
  tenantId?: string | null;
  user?: User;
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
        // 1. Check exact match
        const result = await dbAdapter.crud.findOne("redirects", {
          from: args.from,
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
              const regex = new RegExp(r.from);
              if (regex.test(args.from)) {
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
