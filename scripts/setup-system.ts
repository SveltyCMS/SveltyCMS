#!/usr/bin/env bun
/**
 * @file scripts/setup-system.ts
 * @description Fast, non-browser setup for SveltyCMS during CI/Testing.
 * Directly calls SvelteKit Server Actions to configure database and admin.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4173";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "";
const rootDir = process.cwd();

/**
 * Helper to parse SvelteKit Server Action "devalue" serialization.
 */
function parseActionResult(result: any): any {
  if (result.type === "success" && typeof result.data === "string") {
    try {
      const parsed = JSON.parse(result.data);
      if (Array.isArray(parsed)) {
        const [structure, ...values] = parsed;
        if (typeof structure === "object" && structure !== null) {
          const unmarshaler = (val: any): any => {
            if (typeof val === "number") return values[val - 1];
            if (Array.isArray(val)) return val.map(unmarshaler);
            if (typeof val === "object" && val !== null) {
              const obj: Record<string, any> = {};
              for (const [k, v] of Object.entries(val)) {
                obj[k] = unmarshaler(v);
              }
              return obj;
            }
            return val;
          };
          return unmarshaler(structure);
        }
        return values[0];
      }
    } catch (e) {
      console.warn("[parseActionResult] Failed to parse data:", e);
    }
  }
  return result.data;
}

async function postAction(actionName: string, formData: FormData) {
  let lastError: any;
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}/setup?/${actionName}`, {
        method: "POST",
        body: formData,
        headers: {
          "x-sveltekit-action": "true",
          "x-test-secret": TEST_API_SECRET,
          Origin: API_BASE_URL,
        },
        signal: AbortSignal.timeout(60000), // 60s timeout
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Action ${actionName} failed with status ${res.status}. Body: ${text}`);
      }
      return await res.json();
    } catch (error: any) {
      lastError = error;
      const isConnectionError =
        error.code === "ConnectionRefused" ||
        error.message?.includes("ConnectionRefused") ||
        error.message?.includes("Unable to connect") ||
        error.message?.includes("fetch failed");

      if (isConnectionError) {
        const delay = 2000 * attempt;
        console.warn(
          `⚠️ Connection issue on attempt ${attempt}/${maxAttempts} for ${actionName}. Retrying in ${delay}ms... (${error.message})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function waitForReady() {
  console.log(`⏳ Waiting for server to be operational at ${API_BASE_URL}...`);
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`);
      if (res.ok || res.status === 503) {
        const data = (await res.json()) as any;
        console.log(`[DEBUG] Health check response:`, JSON.stringify(data));
        // In setup mode, status might be 'IDLE' or 'SETUP'
        // We just need it to be responsive and not 'INITIALIZING'
        const okStatuses = ["READY", "SETUP", "IDLE", "DEGRADED", "WARMING", "WARMED"];
        if (okStatuses.includes(data.overallStatus)) {
          console.log(`✅ Server is operational (Status: ${data.overallStatus}).`);
          return;
        }
        console.log(`⏳ Server status: ${data.overallStatus}...`);
      }
    } catch {
      // Ignore fetch errors while waiting for boot
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server operational timeout (60s)");
}

async function main() {
  await waitForReady();

  const isClean = process.argv.includes("--clean");
  const dbType = process.env.DB_TYPE || "sqlite";
  const dbHost = process.env.DB_HOST || "127.0.0.1";
  const dbPort =
    process.env.DB_PORT || (dbType === "mariadb" ? 3306 : dbType === "postgresql" ? 5432 : 27017);
  const dbName = process.env.DB_NAME || "SveltyCMS_test";
  const dbUser = process.env.DB_USER || "";
  const dbPass = process.env.DB_PASSWORD || "";

  const dbConfig = {
    type: dbType,
    host: dbHost,
    port: Number(dbPort),
    name: dbName,
    user: dbUser,
    password: dbPass,
  };

  console.log(`🚀 Starting system setup for ${dbType}...`);

  const multiTenant = process.env.MULTI_TENANT === "true";
  const demoMode = process.env.DEMO === "true";

  try {
    // 0. Clean Database if requested
    if (isClean) {
      console.log("🧹 Dropping existing database collections (--clean)...");
      const cleanForm = new FormData();
      cleanForm.append("config", JSON.stringify(dbConfig));
      const cleanRes = await postAction("cleanDatabase", cleanForm);
      const cleanData = parseActionResult(cleanRes);
      if (!cleanData?.success) {
        console.warn(
          `⚠️ Warning: cleanDatabase reported failure: ${cleanData?.error || "Unknown"}`,
        );
      } else {
        console.log("✅ Database cleaned successfully.");
      }
    }

    // 1. Test Database
    console.log("🔗 Testing database connection...");
    const testForm = new FormData();
    testForm.append("config", JSON.stringify(dbConfig));
    testForm.append("createIfMissing", "true");
    const testRes = await postAction("testDatabase", testForm);
    const testData = parseActionResult(testRes);

    if (!testData || testData.success === false) {
      throw new Error(`Database connection failed: ${testData?.error || "Unknown error"}`);
    }
    console.log("✅ Database connection successful.");

    // 2. Seed Database
    console.log("🌱 Seeding database...");
    const seedForm = new FormData();
    seedForm.append("config", JSON.stringify(dbConfig));
    seedForm.append("system", JSON.stringify({ preset: "blog" }));
    const seedRes = await postAction("seedDatabase", seedForm);
    const seedData = parseActionResult(seedRes);

    if (!seedData || seedData.success === false) {
      throw new Error(`Database seeding failed: ${seedData?.error || "Unknown error"}`);
    }
    console.log("✅ Database seeding started.");

    // Small delay to ensure server handles background tasks smoothly before the next heavy call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Complete Setup (Create Admin)
    console.log(
      `👤 Creating admin user and completing setup (Multi-Tenant: ${multiTenant}, Demo: ${demoMode})...`,
    );
    const completeForm = new FormData();
    const payload = {
      database: dbConfig,
      admin: {
        username: "admin",
        email: "admin@example.com",
        password: "Admin123!",
        confirmPassword: "Admin123!",
      },
      system: {
        multiTenant,
        demoMode,
        useRedis: process.env.USE_REDIS === "true",
        siteName: "SveltyCMS Test",
        defaultContentLanguage: "en",
        contentLanguages: ["en"],
        defaultSystemLanguage: "en",
        systemLanguages: ["en"],
        preset: "blog",
      },
    };
    completeForm.append("data", JSON.stringify(payload));
    const completeRes = await postAction("completeSetup", completeForm);
    const completeData = parseActionResult(completeRes);

    if (!completeData || completeData.success === false) {
      throw new Error(`Setup completion failed: ${completeData?.error || "Unknown error"}`);
    }
    console.log("✅ Setup completed successfully! 🎉");

    // 4. Verification
    const configDir = join(rootDir, "config");
    // Ensure config directory exists (may not exist in fresh CI clones)
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
      console.log("✅ Created config directory.");
    }

    const configName = process.env.TEST_MODE === "true" ? "private.test.ts" : "private.ts";
    const configPath = join(configDir, configName);
    if (existsSync(configPath)) {
      console.log(`✅ Verified: ${configName} was created.`);
    } else {
      console.warn(`⚠️ Warning: ${configName} not found at expected path: ${configPath}`);
    }
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
