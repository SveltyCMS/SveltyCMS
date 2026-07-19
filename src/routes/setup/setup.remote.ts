/**
 * @file src/routes/setup/setup.remote.ts
 * @description Setup Remote Functions — database testing, seeding, completion, email, and Redis.
 *
 * All exports MUST be SvelteKit remote functions (command/query wrappers).
 * Type definitions are in setup-types.ts to avoid exporting plain interfaces here.
 */

import { query, command, getRequestEvent } from "$app/server";

export const testDatabaseConnection = query(
  "unchecked",
  async ({
    configData,
    createIfMissing = false,
    allowOverwrite = false,
  }: {
    configData: import("./setup-types").DbConfig;
    createIfMissing?: boolean;
    allowOverwrite?: boolean;
  }) => {
    const { testDatabaseConnection: fn } = await import("./setup.server");
    return fn(configData, createIfMissing, allowOverwrite);
  },
);

export const seedDatabase = query(
  "unchecked",
  async ({
    configData,
    systemData = {},
  }: {
    configData: import("./setup-types").DbConfig;
    systemData?: import("./setup-types").SystemSettings;
  }) => {
    const { seedDatabase: fn } = await import("./setup.server");
    return fn(configData, systemData);
  },
);

export const completeSetup = command(
  "unchecked",
  async ({
    database,
    admin,
    system = {},
    emailSettings = {},
  }: {
    database: import("./setup-types").DbConfig;
    admin: import("./setup-types").AdminUser;
    system?: import("./setup-types").SystemSettings;
    emailSettings?: {
      skipWelcomeEmail?: boolean;
      smtpConfigured?: boolean;
      host?: string;
      port?: string;
      user?: string;
      password?: string;
      from?: string;
      secure?: boolean;
    };
  }) => {
    const { completeSetup: fn } = await import("./setup.server");
    const result = await fn(database, admin, system, emailSettings);

    if (result.success && result.sessionCookie) {
      try {
        const event = getRequestEvent();
        const { getSessionCookieName, isSecureCookieContext } =
          await import("@src/databases/auth/constants");
        const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
        const cookieName = getSessionCookieName(isSecure);
        event.cookies.set(cookieName, result.sessionCookie.value, {
          ...result.sessionCookie.attributes,
          secure: isSecure,
          path: "/",
        } as any);
        // Also invalidate setup cache immediately so handleSystemState allows requests
        const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
        invalidateSetupCache(false, true);
      } catch (err) {
        const { logger } = await import("@src/utils/logger");
        logger.error("Failed to set session cookie in setup.remote.ts:", err);
      }
    }

    return result;
  },
);

export const testEmailConnection = query(
  "unchecked",
  async (cfg: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
    secure: boolean;
    testEmail: string;
  }) => {
    const { testEmailConnection: fn } = await import("./setup.server");
    return fn(cfg);
  },
);

export const testRedisConnection = query(
  "unchecked",
  async ({
    host = "localhost",
    port = 6379,
    password,
  }: {
    host?: string;
    port?: number;
    password?: string;
  }) => {
    const { testRedisConnection: fn } = await import("./setup.server");
    return fn(host, port, password);
  },
);

export const probeRedis = query("unchecked", async (_payload?: {}) => {
  const { probeRedis: fn } = await import("./setup.server");
  return fn();
});

export const installDatabaseDriver = command("unchecked", async (dbType: string) => {
  const { exec } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { promisify } = await import("node:util");
  const { logger } = await import("@utils/logger");

  const execAsync = promisify(exec);
  const DRIVER_PACKAGES: Record<string, string> = {
    mongodb: "mongoose",
    "mongodb+srv": "mongoose",
    postgresql: "postgres",
    mysql: "mysql2",
    mariadb: "mysql2",
    sqlite: "bun:sqlite",
  };

  const packageName = DRIVER_PACKAGES[dbType];
  if (!packageName || dbType === "sqlite") {
    return {
      success: true,
      message: "No driver installation needed (or invalid type).",
    };
  }

  try {
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
});
