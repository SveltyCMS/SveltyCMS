/**
 * @file src/databases/auth/google-auth.ts
 * @description Utility functions for Google and GitHub OAuth.
 *
 * This module provides:
 * - Google OAuth client initialization
 * - Google OAuth client setup
 * - GitHub OAuth authorization URL generation
 * - Shared OAuth state signing/verification helpers
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
// System Logger
import { logger } from "@utils/logger";

import type { Credentials, OAuth2Client } from "google-auth-library";
import { dev } from "$app/env";

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

function signOAuthState(statePayload: string | null | undefined): string | undefined {
  if (!statePayload) return undefined;
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  // 🔴 FIX: without a secret we cannot sign the state — fail closed (throw) rather
  // than emit an unsigned token that an attacker can replay/forge.
  if (!secret) throw new Error("OAuth state signing requires JWT_SECRET_KEY");
  // RFC 6749 §10.12 OAuth state anti-CSRF parameter signature (not a password hash).
  // codeql[js/insufficient-password-hash]: keyed HMAC-SHA-256 integrity MAC for the OAuth state nonce; login passwords use Argon2id.
  const signature = createHmac("sha256", secret).update(statePayload).digest("hex");
  return encodeURIComponent(`${statePayload}.${signature}`);
}

export function verifyOAuthState(state: string | null | undefined): string | null {
  if (!state) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(state);
  } catch {
    // Malformed percent-encoding is attacker-controlled input, not a server error.
    logger.warn("OAuth state could not be decoded");
    return null;
  }
  const parts = decoded.split(".");
  if (parts.length !== 2) {
    logger.warn("OAuth state missing HMAC signature");
    return null;
  }
  const [statePayload, signature] = parts;
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  // 🔴 FIX: fail closed — never return an unverified token.
  if (!secret) return null;
  // RFC 6749 §10.12 anti-CSRF state verification: this is an HMAC integrity check
  // on the OAuth state nonce / payload, not a password hash.
  // codeql[js/insufficient-password-hash]: keyed HMAC-SHA-256 integrity MAC; login passwords use Argon2id.
  const expected = createHmac("sha256", secret).update(statePayload).digest("hex");
  // 🔴 FIX: constant-time comparison to avoid HMAC timing side-channels.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.warn("OAuth state HMAC signature mismatch!");
    return null;
  }
  return statePayload;
}

async function generateGoogleAuthUrl(
  statePayload?: string | null,
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
    state: signOAuthState(statePayload),
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

// ─── GitHub OAuth ─────────────────────────────────────────────────────────

export function getGithubOAuthRedirectUri(): string {
  if (dev) {
    logger.debug("🔧 Development mode detected - using development host for GitHub");
    return `${publicEnv.HOST_DEV}/login/oauth?provider=github`;
  }

  logger.debug("🚀 Production mode detected - using production host for GitHub");
  return `${publicEnv.HOST_PROD}/login/oauth?provider=github`;
}

export async function generateGithubAuthUrl(
  statePayload?: string | null,
  _promptType?: "consent" | "none" | "select_account",
  tenantId?: string | null,
): Promise<string> {
  const githubClientId = getPrivateSettingSync("GITHUB_CLIENT_ID");
  if (!githubClientId) {
    throw new Error("GitHub OAuth is not initialized");
  }

  const redirectUri = getGithubOAuthRedirectUri();
  const state = signOAuthState(statePayload) || "no-token";

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", githubClientId as string);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);

  logger.debug("Generated GitHub Auth URL", { tenantId });

  return url.toString();
}

export { generateGoogleAuthUrl, getOAuthRedirectUri, googleAuth, setCredentials, signOAuthState };
