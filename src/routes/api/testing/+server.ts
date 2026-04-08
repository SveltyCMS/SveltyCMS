/**
 * @file src/routes/api/testing/+server.ts
 * @description Test Orchestration Endpoint - ONLY FOR TESTING
 * Allows the test runner to reset DB, seed data, and create users via HTTP.
 * STRICTLY GUARDED by TEST_MODE environment variable.
 */

import { json, type RequestEvent } from "@sveltejs/kit";
import { invalidateUserCountCache } from "@src/hooks/handle-authorization";

// Security Guard
function checkTestMode(event: RequestEvent) {
  if (process.env.TEST_MODE !== "true") {
    throw new Error("FORBIDDEN: Test endpoints only available in TEST_MODE");
  }

  const clientAddress = event.getClientAddress?.() || "";
  const hostname = event.url.hostname;
  const isLocal =
    clientAddress === "127.0.0.1" ||
    clientAddress === "::1" ||
    clientAddress === "::ffff:127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isLocal) {
    // In TEST_MODE and Local, we allow access even without secret
    // to simplify benchmarking and CI where secret injection might be flaky.
    return;
  }

  const testSecret = event.request.headers.get("x-test-secret");
  const masterSecret = process.env.TEST_API_SECRET;

  if (!masterSecret || testSecret !== masterSecret) {
    console.error(`[API/Testing] Forbidden non-local access attempt details:`, {
      clientAddress,
      hostname,
      isLocal,
      masterSecretSet: !!masterSecret,
      testSecretSet: !!testSecret,
      secretsMatch: testSecret === masterSecret,
    });

    throw new Error(
      `FORBIDDEN: Unauthorized access attempt (Local: ${isLocal}, Match: ${testSecret === masterSecret})`,
    );
  }
}

export async function POST(event: RequestEvent) {
  const { request } = event;
  try {
    checkTestMode(event);

    // In TEST_MODE, the middleware (handleSystemState) bypasses initialization.
    // We must ensure the database is initialized before proceeding.
    // We use reinitializeSystem(true) to force a reload of the private.test.ts file
    // which might have just been created by the setup wizard.
    const {
      dbAdapter: initialDb,
      auth: initialAuth,
      reinitializeSystem,
      getDbInitPromise,
    } = await import("@src/databases/db");

    // Wait for any existing initialization to complete
    await getDbInitPromise();

    if (!initialDb || !initialAuth) {
      console.log(
        "[API/Testing] Database/Auth not fully initialized. Attempting re-initialization...",
      );

      let attempts = 0;
      while (attempts < 3) {
        await reinitializeSystem(true);
        console.log(`[API/Testing] Re-initialization attempt ${attempts + 1}: SUCCESS`);

        const {
          getDbInitPromise: getNewInitPromise,
          getDb,
          getAuth,
        } = await import("@src/databases/db");
        await getNewInitPromise();

        if (getDb() && getAuth()) {
          break;
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Re-import after initialization (module-level `dbAdapter` may have been reassigned)
    const { getDb, getAuth } = await import("@src/databases/db");
    const currentDbAdapter = getDb();
    const currentAuth = getAuth();

    if (!(currentDbAdapter && currentAuth)) {
      console.error("[API/Testing] Database or Auth still missing after init attempt", {
        hasDb: !!currentDbAdapter,
        hasAuth: !!currentAuth,
      });
      return json(
        {
          error: "Database or Auth not initialized after init attempt",
          hasDb: !!currentDbAdapter,
          hasAuth: !!currentAuth,
        },
        { status: 503 },
      );
    }

    const body = await request.json();
    const action = body.action;

    switch (action) {
      case "reset": {
        await currentDbAdapter.clearDatabase();
        // Invalidate setup cache so the server realizes the DB is now empty
        const { invalidateSetupCache } = await import("@src/utils/setup-check");
        invalidateSetupCache(true, false); // forceStatus = false (Setup NOT complete)

        // 🔥 Hard Reset: Delete private.test.ts to force system back into setup mode
        if (process.env.TEST_MODE === "true") {
          try {
            const fs = await import("node:fs");
            const path = await import("node:path");
            const testConfigPath = path.join(process.cwd(), "config", "private.test.ts");
            if (fs.existsSync(testConfigPath)) {
              fs.unlinkSync(testConfigPath);
              console.log("[API/Testing] Hard Reset: Deleted config/private.test.ts");
            }
          } catch (e) {
            console.warn("[API/Testing] Non-fatal error deleting test config:", e);
          }
        }

        // Clear all session caches to prevent session bleed
        const { clearAllSessionCaches } = await import("@src/hooks/handle-authentication");
        await clearAllSessionCaches();

        // Wipe uploaded media files from tests
        try {
          const { getPublicSetting } = await import("@src/services/settings-service");
          const fs = await import("node:fs");
          const fsp = await import("node:fs/promises");
          const path = await import("node:path");
          const mediaFolderPath = (await getPublicSetting("MEDIA_FOLDER")) || "mediaFolder";
          const fullPath = path.resolve(process.cwd(), mediaFolderPath);

          // Recursively empty the folder rather than deleting it completely to avoid EBUSY on Windows
          if (fs.existsSync(fullPath)) {
            const items = await fsp.readdir(fullPath);
            for (const item of items) {
              await fsp.rm(path.join(fullPath, item), {
                recursive: true,
                force: true,
              });
            }
          }
        } catch (e) {
          console.warn("[API/Testing] Non-fatal error cleaning media folder:", e);
        }

        return json({
          success: true,
          message: "Database cleared, test config deleted, and caches invalidated",
        });
      }

      case "invalidate-cache": {
        await invalidateUserCountCache();
        return json({ success: true, message: "User count cache invalidated" });
      }

      case "get-user-count": {
        const countResult = await currentAuth.getUserCount();
        return json({ success: true, count: countResult });
      }

      case "get-user": {
        const email = body.email;
        const userResult = await currentAuth.getUserByEmail({ email });
        return json({ success: true, user: userResult });
      }

      case "seed": {
        // Initialize default roles, settings and themes
        const { seedRoles, seedDefaultTheme, seedSettings, seedCollectionsForSetup } =
          await import("@src/routes/setup/seed");

        await seedSettings(currentDbAdapter);
        await seedDefaultTheme(currentDbAdapter);
        await seedRoles(currentDbAdapter);

        // Also seed collections so the CMS isn't "empty" (prevents redirects to builder)
        await seedCollectionsForSetup(currentDbAdapter);

        // Seed Admin User
        const adminEmail = body.email || "admin@test.com";
        const adminPassword = body.password || "Test123!";

        // Check if already exists
        const userResult = await currentAuth.getUserByEmail({
          email: adminEmail,
        });
        if (!userResult) {
          await currentAuth.createUser({
            email: adminEmail,
            password: adminPassword,
            username: "admin",
            role: "admin",
            isAdmin: true,
            isRegistered: true,
          });
        }

        // Invalidate setup cache so the server recognizes the system is now setup
        const { invalidateSetupCache: invalidateAfterSeed } =
          await import("@src/utils/setup-check");
        invalidateAfterSeed(true);

        await invalidateUserCountCache();

        return json({ success: true, message: "Database seeded" });
      }

      case "create-user": {
        const { email, password, username, role, isAdmin } = body;
        if (!(email && password && role)) {
          return json({ error: "Missing fields" }, { status: 400 });
        }
        const user = await currentAuth.createUser({
          email,
          password,
          username: username || email.split("@")[0],
          role,
          isAdmin: isAdmin === true || role === "admin",
          isRegistered: true,
        });
        return json({
          success: true,
          user: { id: user._id, email: user.email, role: user.role },
        });
      }

      case "create-collection": {
        const { name, schema: partialSchema } = body;
        if (!name || !partialSchema) {
          return json({ error: "Missing name or schema" }, { status: 400 });
        }

        const { getCollectionFilePath } = await import("@utils/tenant-paths");
        const { compile } = await import("@src/utils/compilation/compile");
        const fs = await import("node:fs");

        const tenantId = body.tenantId || event.locals.tenantId;
        const collectionPath = getCollectionFilePath(name, tenantId);

        const fieldsArray = partialSchema.fields || [];
        const fieldsStr = JSON.stringify(fieldsArray, null, 2);

        const content = [
          "/**",
          ` * @file ${name}.ts`,
          " * @description Generated benchmark collection",
          " */",
          "import type { Schema } from '@src/content/types';",
          "",
          "export const schema: Schema = {",
          partialSchema._id ? `  _id: "${partialSchema._id}",` : "",
          `  name: "${name}",`,
          `  icon: "${partialSchema.icon || "bi:file"}",`,
          `  status: "${partialSchema.status || "publish"}",`,
          `  slug: "${partialSchema.slug || name.toLowerCase()}",`,
          `  fields: ${fieldsStr}`,
          "};",
        ]
          .filter((line) => line !== "")
          .join("\n");

        const path = await import("node:path");
        fs.mkdirSync(path.dirname(collectionPath), { recursive: true });
        fs.writeFileSync(collectionPath, content);

        // Compile and Refresh
        await compile({ tenantId });

        // Force a full reload that bypasses L2 cache to ensure the new file is scanned
        const { scanAndProcessFiles, contentService } =
          await import("@src/content/content-service.server");
        const schemas = await scanAndProcessFiles();

        await contentService.reconcile(schemas, tenantId, false, currentDbAdapter, true);

        // Wait a bit for filesystem/database to settle
        await new Promise((r) => setTimeout(r, 1000));

        return json({ success: true, message: `Collection ${name} created and compiled` });
      }

      case "setup": {
        // Forces the system to recognize the setup is complete (useful after setup-wizard)
        const { reinitializeSystem } = await import("@src/databases/db");
        await reinitializeSystem(true);
        const { invalidateSetupCache } = await import("@src/utils/setup-check");
        invalidateSetupCache(false, true);
        return json({
          success: true,
          message: "System marked as setup in-memory",
        });
      }

      case "cleanup": {
        const { type, email, tenantId } = body;
        if (type === "user" && email) {
          // Wipe a specific user
          const userResult = await currentAuth.getUserByEmail({
            email,
            tenantId,
          });
          if (userResult) {
            await currentAuth.deleteUser(userResult._id, tenantId);
            return json({ success: true, message: `User ${email} deleted` });
          }
          return json({
            success: true,
            message: "User not found, nothing to delete",
          });
        }

        if (type === "all-data") {
          // Clear database but keep settings/roles if possible
          // clearDatabase usually drops everything
          await currentDbAdapter.clearDatabase();

          // Re-initialize to restore basic system state
          if (currentDbAdapter.ensureSystem) await currentDbAdapter.ensureSystem();
          if (currentDbAdapter.ensureAuth) await currentDbAdapter.ensureAuth();

          return json({
            success: true,
            message: "Data cleared and system re-initialized",
          });
        }

        return json({ error: "Invalid cleanup type" }, { status: 400 });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    if (error.message.startsWith("FORBIDDEN")) {
      return json({ error: error.message }, { status: 403 });
    }
    console.error("[API/Testing] Error:", error);
    return json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
