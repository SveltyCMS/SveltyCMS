/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Enterprise-level SSR for collection pages with optimized data loading and caching.
 *
 * ## Architecture Overview
 * This module implements a **two-tier data loading strategy** for optimal performance:
 *
 * ### Tier 1: EntryList (View Mode) - Language-Specific Partial Data
 * - Loads only the CURRENT language data for list display
 * - Prevents over-fetching (100s of entries × N languages)
 * - Cache key includes language: `collection:ID:page:1:lang:EN`
 * - Typical payload: ~50KB for 10 entries
 *
 * ### Tier 2: Fields (Edit Mode) - Full Multilingual Data
 * - Loads ALL language data for the single entry being edited
 * - Enables simultaneous translation editing
 * - Minimal overhead: 1 entry × N languages (~5KB)
 * - Cache key: `entry:ID` (language-agnostic)
 *
 * ## Translation Status Integration
 * The TranslationStatus component shows per-language completion:
 * - **Dropdown (View Mode)**: Switches language → triggers SSR reload with new `lang` param
 * - **Progress Bar (Edit Mode)**: Shows translation % → updates locally without reload
 * - **Cache Strategy**: Language change invalidates list cache, preserves entry cache
 *
 * ## Performance Characteristics
 * | Scenario | Data Size | Requests | Cache Hit Rate |
 * |----------|-----------|----------|----------------|
 * | List 100 entries (EN) | ~50KB | 1 | 95% |
 * | Switch to DE | ~50KB | 1 | 95% (new cache key) |
 * | Edit entry | ~5KB | 1 | 80% |
 * | Toggle language in edit | 0KB | 0 | 100% (local only) |
 *
 * ## Cache Invalidation Rules
 * - Entry save/update → Invalidates `entry:ID` + all `collection:ID:*` keys
 * - Language change → Natural cache miss (different `lang` in key)
 * - Pagination → Natural cache miss (different `page` in key)
 *
 * @see docs/architecture/collection-store-dataflow.mdx
 */

// Core SveltyCMS services
import { contentSystem } from "@src/content/index.server";
import type { User } from "@src/databases/auth/types";
import { collectionService } from "@src/services/core/collection-service";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { error, isRedirect, redirect } from "@sveltejs/kit";
import { parseCollectionListQuery } from "@utils/collection-query-filters";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const returnUrl = `${url.pathname}${url.search}`;
  const user = getAuthenticatedUser(locals, returnUrl);
  const typedUser = user as User;
  const { tenantId } = locals;
  const { language, collection } = params;

  // =================================================================
  // 1. PRE-FLIGHT CHECKS & REDIRECTS (moved outside try-catch)
  // =================================================================

  const availableLanguages = getPublicSettingSync("AVAILABLE_CONTENT_LANGUAGES") || ["en"];
  if (!availableLanguages.includes(language)) {
    throw error(404, "Not Found");
  }

  const collectionNameOnly = collection?.split("/").pop();
  const systemPages = ["config", "user", "dashboard", "imageEditor", "email-previews"];
  if (collectionNameOnly && systemPages.includes(collectionNameOnly)) {
    throw redirect(302, `/${collectionNameOnly}${url.search}`);
  }

  if (
    typedUser?.locale &&
    typedUser.locale !== language &&
    availableLanguages.includes(typedUser.locale)
  ) {
    const newPath = url.pathname.replace(`/${language}/`, `/${typedUser.locale}/`);
    throw redirect(302, newPath);
  }

  if (typedUser.lastAuthMethod === "token") {
    // Token users go to root on error, or builder if no collections (though they likely shouldn't be in the builder)
    throw redirect(302, "/");
  }

  try {
    // =================================================================
    // 2. GET COLLECTION SCHEMA
    // =================================================================
    // Ensurecontent-manageris initialized before use
    await contentSystem.initialize(tenantId ?? undefined);

    // Check if collection param is a UUID (32 char hex) or a path
    const isUUID = /^[a-f0-9]{32}$/i.test(collection || "");
    let currentCollection: any;
    if (isUUID) {
      // Direct UUID lookup
      logger.debug(`Loading collection by UUID: \x1b[33m${collection}\x1b[0m`);
      currentCollection = contentSystem.getCollectionById(collection!, tenantId);

      // SELF-HEALING: If not found, it might be a stalecontent-managerafter setup
      if (!currentCollection) {
        logger.warn(`Collection UUID ${collection} not found. Triggeringcontent-managerrefresh...`);
        await contentSystem.refresh(tenantId);
        currentCollection = contentSystem.getCollectionById(collection!, tenantId);
      }

      // Redirect to pretty path if available (Prevents UUID -> Path flicker on client)
      if (currentCollection?.path) {
        const newPath = `/${language}${currentCollection.path}${url.search}`;
        logger.debug(`Redirecting UUID to canonical path: ${newPath}`);
        throw redirect(302, newPath);
      }
    } else {
      // Path-based lookup (backward compatibility)
      const collectionPath = `/${collection}`;
      logger.debug(`Loading collection by path: \x1b[34m${collectionPath}\x1b[0m`);
      currentCollection = contentSystem.getCollection(collectionPath, tenantId);

      // SELF-HEALING: If not found, it might be a stalecontent-managerafter setup
      // Optimization: Skip refresh for "Collections" root, as it will be handled by redirect logic below
      if (!currentCollection && collectionNameOnly?.toLowerCase() !== "collections") {
        logger.warn(
          `Collection path ${collectionPath} not found. Triggeringcontent-managerrefresh...`,
        );
        await contentSystem.refresh(tenantId);
        currentCollection = contentSystem.getCollection(collectionPath, tenantId);
      }
    }

    if (!currentCollection) {
      if (collectionNameOnly?.toLowerCase() === "collections") {
        const allCollections = await contentSystem.getCollections(tenantId);
        if (allCollections.length > 0) {
          throw redirect(302, `/${language}${allCollections[0].path}`);
        }
        // FRESH INSTALL: If no collections exist, send admins to the builder
        if (locals.isAdmin) {
          throw redirect(302, "/config/collectionbuilder");
        }
        throw redirect(302, "/user/profile");
      }
      logger.warn(`Collection not found: ${collection}, returning 404.`, {
        tenantId,
        isUUID,
      });
      throw error(404, "Not Found");
    }

    // If accessed via a non-canonical path, it will be handled by the client-side to update the URL,
    // but the server will still serve the content to avoid a redirect.
    // This check is to prevent potential redirect loops if client-side logic fails.
    if (!isUUID && currentCollection.path && `/${collection}` !== currentCollection.path) {
      logger.warn(
        `Serving content from non-canonical path: /${collection}. Canonical is ${currentCollection.path}`,
      );
    }

    // =================================================================
    // 3. PARSE URL QUERY (search / filter_* / sort / page) — schema-whitelisted
    // =================================================================
    // Shared parser: whitelist field names against collection schema, stable
    // queryHash for L1/L2 cache keys (see collection-query-filters + cache-system.mdx).
    const listQuery = parseCollectionListQuery(url.searchParams, currentCollection);
    const editEntryId = url.searchParams.get("edit");

    // =================================================================
    // 4. LOAD COLLECTION DATA (via CollectionService + getOrSetSWR)
    // =================================================================
    // Service builds `collection:{id}:query:{hash}:…` keys and uses SWR.
    // Content mutations must call invalidateCollection(id) (prefix clear).
    const { entries, pagination, revisions, contentLanguage, collectionSchema } =
      await collectionService.getCollectionData({
        collection: currentCollection,
        page: listQuery.page,
        pageSize: listQuery.pageSize,
        sort: listQuery.sort,
        filter: listQuery.filter,
        search: listQuery.search,
        language,
        user: typedUser,
        tenantId,
        editEntryId: editEntryId || undefined,
      });

    // Status facets for filter chips (non-blocking failure → empty map)
    let statusFacets: Partial<Record<string, number>> = {};
    try {
      statusFacets = await collectionService.getStatusFacets({
        collection: currentCollection,
        tenantId,
      });
    } catch {
      statusFacets = {};
    }

    // In-process list metrics (SSR snapshot for ?debug=table badge)
    const { summarizeListQueryMetrics } = await import("@utils/list-query-metrics");
    const listMetrics = summarizeListQueryMetrics("CollectionService.getCollectionData");

    // =================================================================
    // 5. PREPARE FINAL RESPONSE
    // =================================================================

    const returnData = {
      user: {
        _id: typedUser?._id,
        username: typedUser?.username,
        email: typedUser?.email,
        role: typedUser?.role,
        avatar: typedUser?.avatar,
        locale: typedUser?.locale,
      },
      isAdmin: locals.isAdmin,
      hasManageUsersPermission: locals.hasManageUsersPermission,
      roles: locals.roles,
      siteName: getPublicSettingSync("SITE_NAME") || "SveltyCMS",
      contentLanguage,
      collectionSchema,
      entries,
      pagination,
      revisions,
      statusFacets,
      listMetrics,
    };

    return returnData;
  } catch (err) {
    // If it's a redirect (SvelteKit standard behavior), just rethrow it without logging an error
    if (isRedirect(err)) {
      throw err;
    }

    logger.error("Error loading collection page", {
      error: err,
      collection,
      language,
      url: url.pathname,
    });
    throw err;
  }
};
