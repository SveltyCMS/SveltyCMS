/**
 * @file src/routes/api/[...path]/handlers/testing/testing-reset.ts
 * @description Database/media/cache reset actions for the testing API.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { contentSystem } from "@src/content/index.server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { deepClone } from "@utils/native-utils";
import {
  isAutomatedTestHarness,
  resolvePrivateConfigFileName,
  assertLocalMustNotMutatePrivateTs,
} from "@utils/private-config-policy";
import {
  invalidateAllCaches,
  loadEngineServerModule,
  rawResponse,
  resetSystemStores,
  wipeMediaFolder,
  type TestingContext,
} from "./testing-shared";

export async function handleTestingResetRoutes(ctx: TestingContext): Promise<Response | undefined> {
  const { cms, tenantId, params, initializedAdapter, action } = ctx;

  if (action === "reset-to-state") {
    const { state, email, password } = params;
    if (!state || (state !== "setup" && state !== "ready")) {
      throw new AppError("State must be 'setup' or 'ready'", 400);
    }

    // Step 1: Wipe DB / media / caches (common to both states)
    if (initializedAdapter.clearDatabase) {
      await initializedAdapter.clearDatabase();
    } else if ((initializedAdapter as any).reset) {
      await (initializedAdapter as any).reset();
    }

    // Wipe media and caches (common to both states)
    await wipeMediaFolder();
    await invalidateAllCaches(tenantId);
    await resetSystemStores();

    const isTest = isAutomatedTestHarness();
    const configFileName = resolvePrivateConfigFileName();
    const privateConfigPath = path.join(process.cwd(), "config", configFileName);

    if (state === "setup") {
      if (!isTest) {
        assertLocalMustNotMutatePrivateTs("reset system state");
      }
      // Delete private config file
      if (fs.existsSync(privateConfigPath)) {
        try {
          await fsp.unlink(privateConfigPath);
        } catch (err) {
          logger.warn(`[TestingHandler] Failed to delete config file: ${err}`);
        }
      }
      return rawResponse({ success: true, message: "Transitioned to setup mode" });
    }

    if (state === "ready") {
      // Transition to ready mode
      // 1. Write mock private config if missing
      if (!fs.existsSync(privateConfigPath)) {
        const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");
        const dbType = process.env.DB_TYPE || "sqlite";
        const dummyConfig = {
          type: dbType as any,
          host: process.env.DB_HOST || "localhost",
          port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
          name: process.env.DB_NAME || "sveltycms_test",
          user: process.env.DB_USER || "",
          password: process.env.DB_PASSWORD || "",
        };
        await writePrivateConfig(dummyConfig);
      }

      // Invalidate cache with complete state
      const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
      invalidateSetupCache(false, true);

      // 2. Seed roles
      try {
        const { seedRoles } = await import("@src/routes/setup/seed");
        await seedRoles(initializedAdapter, tenantId);
      } catch (err: any) {
        logger.warn(`[TestingHandler] Role seeding error: ${err.message}`);
      }

      // 3. Create admin user
      const seedEmail = email || "admin@test.com";
      const seedPassword = password || "Password123!";
      const result = await cms.auth.createUser(
        {
          email: seedEmail,
          password: seedPassword,
          username: "admin",
          role: "admin",
          isRegistered: true,
          emailVerified: true,
        },
        { tenantId },
      );

      // 4. Seed default theme and refresh ThemeManager
      const { DEFAULT_THEME, ThemeManager } = await import("@src/databases/theme-manager");
      const safeTheme = deepClone(DEFAULT_THEME);
      await initializedAdapter.system.themes.ensure(safeTheme);
      const themeManager = ThemeManager.getInstance();
      if (themeManager.isInitialized()) {
        await themeManager.refresh();
      }

      // 5. Seed dynamic collections
      try {
        await contentSystem.initialize(tenantId, { force: true });
      } catch (err: any) {
        logger.warn(`[TestingHandler] Collection seeding error: ${err.message}`);
      }

      // Sync content store + SDK schema cache
      const { refreshContent } = await loadEngineServerModule();
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter: initializedAdapter,
      });
      if (cms.collections?.refresh) {
        await cms.collections.refresh(tenantId as any, true);
      }

      return rawResponse({
        success: result.success,
        message: result.success
          ? "Transitioned to ready mode and seeded successfully"
          : (result as any).message,
      });
    }
  }

  if (action === "reset") {
    process.stderr.write(`[TestingHandler] RESET TRIGGERED for tenant: ${tenantId}\n`);

    // 1. Wipe Database (Collections + Data)
    if (initializedAdapter.clearDatabase) {
      await initializedAdapter.clearDatabase();
    } else if ((initializedAdapter as any).reset) {
      await (initializedAdapter as any).reset();
    }

    // Re-initialize adapter default collections/roles if available (e.g. MongoDB roles seed)
    try {
      if (typeof (initializedAdapter as any).ensureAuth === "function") {
        await (initializedAdapter as any).ensureAuth();
      }
      if (typeof (initializedAdapter as any).ensureSystem === "function") {
        await (initializedAdapter as any).ensureSystem();
      }
    } catch (err) {
      logger.warn(`[TestingHandler] Non-fatal database initialization error after reset: ${err}`);
    }

    // 2. Wipe media and reset caches + state
    await wipeMediaFolder();
    await invalidateAllCaches(tenantId);
    await resetSystemStores();

    return rawResponse({
      success: true,
      message: "System reset successfully",
    });
  }

  return undefined;
}
