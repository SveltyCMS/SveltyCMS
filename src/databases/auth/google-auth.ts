/**
 * @file src/databases/auth/googleAuth.ts
 * @description Utility functions for Google OAuth.
 *
 * This module provides:
 * - Google OAuth client initialization
 * - Google OAuth client setup
 */

import { createHmac } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
// System Logger
import { logger } from "@utils/logger";

import type { Credentials, OAuth2Client } from "google-auth-library";
import { dev } from "$app/environment";

// Utility function to determine the correct OAuth redirect URI
function getOAuthRedirectUri(): string {
  // Use SvelteKit's built-in environment detection
  if (dev) {
    logger.debug("🔧 Development mode detected - using development host");
    return `${publicEnv.HOST_DEV}/login/oauth`;
  } // For production builds, use the production host

  logger.debug("🚀 Production mode detected - using production host");
  return `${publicEnv.HOST_PROD}/login/oauth`;
}

// Google OAuth
let googleAuthClient: OAuth2Client | null = null;

// Initialize Google OAuth client with ID, secret, and redirect URL
async function googleAuth(): Promise<OAuth2Client | null> {
  const googleClientId = getPrivateSettingSync("GOOGLE_CLIENT_ID");
  const googleClientSecret = getPrivateSettingSync("GOOGLE_CLIENT_SECRET");
  if (!(googleClientId && googleClientSecret)) {
    logger.warn("Google client ID and secret are not provided. OAuth unavailable.");
    return null;
  }

  try {
    if (!googleAuthClient) {
      logger.debug("Setting up Google OAuth2...");
      const { OAuth2Client } = await import("google-auth-library");
      const redirectUri = getOAuthRedirectUri();
      logger.debug(`Using OAuth redirect URI: ${redirectUri}`);

      googleAuthClient = new OAuth2Client(googleClientId, googleClientSecret, redirectUri);
    }

    return googleAuthClient;
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Unknown error initializing Google OAuth client";
    logger.error("Error initializing Google OAuth client:", error);
    return null;
  }
}

// Set credentials for the OAuth client
async function setCredentials(credentials: Credentials): Promise<void> {
  const client = await googleAuth();
  if (client) {
    client.setCredentials(credentials);
  }
}

function signOAuthState(token: string | null | undefined): string | undefined {
  if (!token) return undefined;
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!secret) return encodeURIComponent(token);
  const signature = createHmac("sha256", secret).update(token).digest("hex");
  return encodeURIComponent(`${token}.${signature}`);
}

export function verifyOAuthState(state: string | null | undefined): string | null {
  if (!state) return null;
  const decoded = decodeURIComponent(state);
  const parts = decoded.split(".");
  if (parts.length !== 2) {
    logger.warn("OAuth state missing HMAC signature");
    return null;
  }
  const [token, signature] = parts;
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!secret) return token;
  const expected = createHmac("sha256", secret).update(token).digest("hex");
  if (signature !== expected) {
    logger.warn("OAuth state HMAC signature mismatch!");
    return null;
  }
  return token;
}

async function generateGoogleAuthUrl(
  token?: string | null,
  promptType?: "consent" | "none" | "select_account",
  tenantId?: string | null,
): Promise<string> {
  const googleAuthClient = await googleAuth();
  if (!googleAuthClient) {
    throw new Error("Google OAuth is not initialized");
  }

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
  ];
  const baseUrl = getOAuthRedirectUri(); // Generate auth URL without PKCE parameters to avoid Google's "code_verifier or verifier is not needed" error
  // Use 'online' access_type to prevent PKCE from being auto-enabled in newer googleapis versions

  const authUrlOptions: Record<string, string | boolean | undefined> = {
    access_type: "offline", // Refresh tokens enabled; PKCE disabled via tokenCredential flow
    prompt: "consent", // Force refresh token on every auth to ensure token freshness
    scope: scopes.join(" "),
    redirect_uri: baseUrl,
    state: signOAuthState(token),
    include_granted_scopes: true,
  };
  // Only add prompt if explicitly specified
  if (promptType) {
    authUrlOptions.prompt = promptType;
  } else if (authUrlOptions.access_type === "offline") {
    delete authUrlOptions.prompt; // Let Google handle prompt for offline access
  }

  const authUrl = googleAuthClient.generateAuthUrl(authUrlOptions);
  logger.debug("Generated Google Auth URL", { tenantId, promptType });

  return authUrl;
}

export { generateGoogleAuthUrl, getOAuthRedirectUri, googleAuth, setCredentials, signOAuthState };
