/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 *
 * ### Features
 * - Settings Loading
 * - User Management
 * - Theme Management
 * - Content Versioning
 *
 * ### Security
 * - Settings Loading is cached
 * - User Management is cached
 * - Theme Management is cached
 * - Content Versioning is cached
 */

import type { NavigationNode } from "@src/content";
import type { Locale } from "@src/paraglide/runtime";
import { getPrivateSettingSync, loadSettingsCache } from "@src/services/settings-service";
import { version } from "../../package.json";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
  // Use cached setup status from hooks instead of re-checking
  // The handleSetup hook already sets locals.__setupConfigExists
  const setupMode = locals.__setupConfigExists === false || url.pathname.startsWith("/setup");

  // Fast-path for setup mode - skip ALL CMS initialization
  if (setupMode) {
    return {
      systemLanguage: (cookies.get("systemLanguage") as Locale) ?? "en",
      contentLanguage: (cookies.get("contentLanguage") as Locale) ?? "en",
      user: null,
      isAdmin: false,
      isMultiTenant: false,
      cspNonce: locals.cspNonce,
      tenantId: null,
      darkMode: locals.darkMode ?? false,
      navigationStructure: [],
      contentNodes: [],
      contentVersion: 0,
      settings: {
        PKG_VERSION: version,
        siteName: "SveltyCMS Setup",
      },
    };
  }

  // Wrap settings loading in try-catch for preview mode resilience
  let publicSettings: any;
  try {
    const settingsResult = await loadSettingsCache();
    publicSettings = settingsResult.public;
  } catch (error) {
    console.error("[Layout] Settings load failed (preview mode?):", error);
    // Return minimal valid data structure
    return {
      systemLanguage: "en" as Locale,
      contentLanguage: "en" as Locale,
      user: null,
      isAdmin: false,
      isMultiTenant: false,
      cspNonce: locals.cspNonce,
      tenantId: null,
      darkMode: locals.darkMode ?? false,
      navigationStructure: [],
      contentNodes: [],
      contentVersion: 0,
      settings: {
        PKG_VERSION: version,
        siteName: "SveltyCMS",
      },
    };
  }

  // Extract values for server-side logic
  const baseLocale = publicSettings.BASE_LOCALE;
  const defaultContentLanguage = publicSettings.DEFAULT_CONTENT_LANGUAGE;

  // Private settings only accessible server-side
  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

  const systemLanguage = (cookies.get("systemLanguage") as Locale) ?? baseLocale;
  const contentLanguage = (cookies.get("contentLanguage") as Locale) ?? defaultContentLanguage;

  // Content System Hydration with error handling for preview mode
  const { contentSystem } = await import("@src/content");
  let navigationStructure: NavigationNode[] = [];
  let contentNodes: any[] = [];
  let contentVersion = 0;
  let firstCollectionRedirectUrl = "";

  try {
    // Ensurecontent-manageris initialized before use to guarantee sidebar population.
    // This is critical for the first load after setup.
    await contentSystem.initialize(locals.tenantId);

    navigationStructure = await contentSystem.getNavigationStructureProgressive({
      maxDepth: 1,
      tenantId: locals.tenantId,
    });
    contentNodes = await contentSystem.getContentStructure(locals.tenantId);
    contentVersion = contentSystem.getContentVersion();

    // Get the redirect URL for the first collection
    firstCollectionRedirectUrl =
      (await contentSystem.getFirstCollectionRedirectUrl(
        contentLanguage as string,
        locals.tenantId,
      )) || "";
  } catch (error) {
    console.error("[Layout]ContentSystem error (preview mode?):", error);
    // Continue with empty navigation - don't block page load
  }

  return {
    systemLanguage,
    contentLanguage,
    user: locals.user ?? null,
    isAdmin: locals.isAdmin ?? false,
    isMultiTenant,
    cspNonce: locals.cspNonce,
    tenantId: locals.tenantId ?? null,
    darkMode: locals.darkMode ?? false,
    navigationStructure,
    contentNodes: contentNodes ? JSON.parse(JSON.stringify(contentNodes)) : [],
    contentVersion,
    // Pass CSRF token for state-changing API calls
    csrfToken:
      cookies.get(
        url.protocol === "https:" || (url.hostname !== "localhost" && !dev)
          ? "__Host-csrf_token"
          : "csrf_token",
      ) ?? null,
    // Pass public settings to client for store initialization
    settings: {
      ...publicSettings,
      PKG_VERSION: version,
      FIRST_COLLECTION_REDIRECT_URL: firstCollectionRedirectUrl,
    },
  };
};
