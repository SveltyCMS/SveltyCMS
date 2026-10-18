/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import { version as pkgVersion } from "../../../package.json";
import { redirect } from "@sveltejs/kit";
import { getSetupState, SetupState } from "@utils/server/setup-check";
import type { Actions, PageServerLoad } from "./$types";
import inlangSettings from "../../../project.inlang/settings.json";

/** Cached lazy handle to the auth constants — one module-registry lookup instead of one per call. */
let authConstantsModulePromise: Promise<typeof import("@src/databases/auth/constants")> | undefined;
function loadAuthConstantsModule(): Promise<typeof import("@src/databases/auth/constants")> {
  return (authConstantsModulePromise ??= import("@src/databases/auth/constants"));
}

import {
  testDatabaseConnection,
  seedDatabase,
  completeSetup,
  testEmailConnection,
  testRedisConnection,
} from "./setup.server";

// Database driver mapping
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
  if ((await getSetupState()) === SetupState.COMPLETE) {
    throw redirect(302, "/login");
  }

  const { clearAllSessionCookies } = await loadAuthConstantsModule();
  clearAllSessionCookies(cookies, "/");

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
  testDatabase: async ({ request }) => {
    const fd = await request.formData();
    const config = JSON.parse(fd.get("config") as string);
    const createIfMissing = fd.get("createIfMissing") === "true";
    const allowOverwrite = fd.get("allowOverwrite") === "true";
    const ownsDatabase = fd.get("ownsDatabase") === "true";
    return testDatabaseConnection(config, createIfMissing, allowOverwrite, ownsDatabase);
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
      const { getSessionCookieName, isSecureCookieContext } = await loadAuthConstantsModule();
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
  installDriver: async ({ request }) => {
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
      await import(/* @vite-ignore */ packageName);
      return {
        success: true,
        message: `Driver ${packageName} is already installed.`,
        alreadyInstalled: true,
        package: packageName,
      };
    } catch {
      return {
        success: false,
        error: `Driver ${packageName} is not installed.`,
      };
    }
  },
};
