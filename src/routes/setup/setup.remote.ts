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
  }: {
    database: import("./setup-types").DbConfig;
    admin: import("./setup-types").AdminUser;
    system?: import("./setup-types").SystemSettings;
  }) => {
    const { completeSetup: fn } = await import("./setup.server");
    const result = await fn(database, admin, system);

    if (result.success && result.sessionCookie) {
      try {
        const event = getRequestEvent();
        const isSecure = event.url.protocol === "https:" || event.url.hostname !== "localhost";
        event.cookies.set(result.sessionCookie.name, result.sessionCookie.value, {
          ...result.sessionCookie.attributes,
          secure: isSecure,
          path: "/",
        } as any);
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
