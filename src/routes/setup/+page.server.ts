/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { version as pkgVersion } from "../../../package.json";
import { logger } from "@utils/logger";
import type { Actions, PageServerLoad } from "./$types";
import inlangSettings from "../../../project.inlang/settings.json";

// Delegate core setup logic to setup.remote.ts
import {
  testDatabaseConnection,
  seedDatabase,
  completeSetup,
  testEmailConnection,
  testRedisConnection,
} from "./setup.server";

const execAsync = promisify(exec);

// Database driver mapping (MongoDB is default, others are optional)
const DRIVER_PACKAGES = {
  mongodb: "mongoose",
  "mongodb+srv": "mongoose",
  postgresql: "postgres",
  mysql: "mysql2",
  mariadb: "mysql2",
  sqlite: "bun:sqlite",
} as const;

type DatabaseType = keyof typeof DRIVER_PACKAGES;

export const load: PageServerLoad = async ({ locals, cookies }) => {
  // Clear ALL existing auth session cookie variants to ensure fresh start
  const { SESSION_COOKIE_NAME } = await import("@src/databases/auth/constants");
  for (const name of [
    SESSION_COOKIE_NAME,
    `__Host-${SESSION_COOKIE_NAME}`,
    `__Secure-${SESSION_COOKIE_NAME}`,
  ]) {
    cookies.delete(name, { path: "/" });
  }

  const availableLanguages: string[] = inlangSettings.locales || ["en", "de"];

  return {
    theme: locals.theme,
    darkMode: locals.darkMode,
    availableLanguages,
    settings: {
      PKG_VERSION: pkgVersion,
    },
  };
};

export const actions: Actions = {
  // Setup actions delegate to setup.remote.ts
  testDatabase: async ({ request }) => {
    const fd = await request.formData();
    const config = JSON.parse(fd.get("config") as string);
    const createIfMissing = fd.get("createIfMissing") === "true";
    const allowOverwrite = fd.get("allowOverwrite") === "true";
    return testDatabaseConnection(config, createIfMissing, allowOverwrite);
  },
  seedDatabase: async ({ request }) => {
    const fd = await request.formData();
    const config = JSON.parse(fd.get("config") as string);
    const system = JSON.parse((fd.get("system") as string) || "{}");
    return seedDatabase(config, system);
  },
  completeSetup: async ({ request, cookies, url }) => {
    const fd = await request.formData();
    const payload = JSON.parse(fd.get("data") as string);
    const result = await completeSetup(
      payload.database,
      payload.admin,
      payload.system || {},
      payload.emailSettings || {},
    );
    if (result.sessionCookie) {
      const { getSessionCookieName, isSecureCookieContext } =
        await import("@src/databases/auth/constants");
      const isSecure = isSecureCookieContext(url.protocol, url.hostname);
      const cookieName = getSessionCookieName(isSecure);
      cookies.set(cookieName, result.sessionCookie.value, {
        ...result.sessionCookie.attributes,
        secure: isSecure,
        sameSite: isSecure ? "strict" : "lax",
      } as any);
    }
    return result;
  },
  testEmail: async ({ request }) => {
    const fd = await request.formData();
    const config = JSON.parse(fd.get("config") as string);
    return testEmailConnection(config);
  },
  testRedis: async ({ request }) => {
    const fd = await request.formData();
    const host = (fd.get("host") as string) || "localhost";
    const port = parseInt((fd.get("port") as string) || "6379", 10);
    const password = fd.get("security") as string;
    return testRedisConnection(host, port, password);
  },

  /**
   * Installs database drivers (optional)
   */
  installDriver: async ({ request }) => {
    logger.info("🚀 Action: installDriver called");
    const formData = await request.formData();
    const dbType = formData.get("dbType") as DatabaseType;

    if (!(dbType && DRIVER_PACKAGES[dbType]) || dbType === "sqlite") {
      return {
        success: true,
        message: "No driver installation needed (or invalid type).",
      };
    }

    const packageName = DRIVER_PACKAGES[dbType];

    try {
      // Check if already installed
      try {
        await import(/* @vite-ignore */ packageName);
        return {
          success: true,
          message: `Driver ${packageName} is already installed.`,
          alreadyInstalled: true,
          package: packageName,
        };
      } catch {
        // Install needed
      }

      // Detect package manager
      const cwd = process.cwd();
      let pm = "npm";
      if (existsSync(join(cwd, "bun.lock"))) {
        pm = "bun";
      } else if (existsSync(join(cwd, "yarn.lock"))) {
        pm = "yarn";
      } else if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
        pm = "pnpm";
      }

      const cmd =
        pm === "bun" || pm === "yarn" || pm === "pnpm"
          ? `${pm} add ${packageName}`
          : `npm install ${packageName}`;

      logger.info(`Installing ${packageName} using ${pm}...`);
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: 120_000,
      });
      logger.info("Installation output:", stdout + stderr);

      return {
        success: true,
        message: `Successfully installed ${packageName}.`,
        package: packageName,
      };
    } catch (error: any) {
      logger.error("Driver installation failed:", error);
      return {
        success: false,
        error: `Installation failed: ${error.message}`,
      };
    }
  },
};
