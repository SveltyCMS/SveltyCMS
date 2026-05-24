/**
 * @file src/databases/auth/github-auth.ts
 * @description Utility functions for GitHub OAuth.
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";
import { dev } from "$app/environment";
import { signOAuthState, verifyOAuthState } from "./google-auth";

export function getGithubOAuthRedirectUri(): string {
  if (dev) {
    logger.debug("🔧 Development mode detected - using development host for GitHub");
    return `${publicEnv.HOST_DEV}/login/oauth?provider=github`;
  }

  logger.debug("🚀 Production mode detected - using production host for GitHub");
  return `${publicEnv.HOST_PROD}/login/oauth?provider=github`;
}

export async function generateGithubAuthUrl(
  token?: string | null,
  _promptType?: "consent" | "none" | "select_account",
  tenantId?: string | null,
): Promise<string> {
  const githubClientId = getPrivateSettingSync("GITHUB_CLIENT_ID");
  if (!githubClientId) {
    throw new Error("GitHub OAuth is not initialized");
  }

  const redirectUri = getGithubOAuthRedirectUri();
  const state = signOAuthState(token) || "no-token";

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", githubClientId as string);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);

  logger.debug("Generated GitHub Auth URL", { tenantId });

  return url.toString();
}

export { signOAuthState, verifyOAuthState };
