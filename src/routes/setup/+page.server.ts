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

import { testEmailConnection } from "./setup.server";

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
  testEmail: async ({ request }) => {
    const fd = await request.formData();
    const config = JSON.parse(fd.get("config") as string);
    return testEmailConnection(config);
  },
};
