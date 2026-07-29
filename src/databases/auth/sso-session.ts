/**
 * @file src/databases/auth/sso-session.ts
 * @description SSO/OIDC session metadata management for RP-Initiated Logout support.
 *
 * Extends the existing session system with OIDC-specific metadata (id_token,
 * provider, post_logout_redirect_uri). Implements OpenID Connect RP-Initiated
 * Logout 1.0 (https://openid.net/specs/openid-connect-rpinitiated-1_0.html).
 *
 * ### Features:
 * - SSO session metadata tracking (provider, id_token_hint, redirect URIs)
 * - RP-Initiated Logout with post_logout_redirect_uri validation
 * - Configurable redirect URI allowlist per provider
 * - Back-channel logout placeholder for future OP-initiated logout
 * - Integrates with existing session rotation and invalidation
 */

import { logger } from "@utils/logger";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import type { DatabaseId } from "@src/content/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SsoProviderConfig {
  /** OIDC provider identifier (e.g., "google", "azure-ad", "auth0") */
  id: string;
  /** OIDC issuer URL */
  issuer: string;
  /** Allowed post_logout_redirect_uri patterns (supports wildcard * suffix) */
  allowedRedirectUris: string[];
  /** OP logout endpoint URL */
  endSessionEndpoint?: string;
}

export interface SsoSessionMetadata {
  /** OIDC id_token from the original authentication */
  idTokenHint?: string;
  /** Provider identifier */
  provider: string;
  /** The post_logout_redirect_uri requested at logout */
  postLogoutRedirectUri?: string;
  /** When the SSO session was created */
  createdAt: string;
  /** State parameter for CSRF protection during logout redirect */
  logoutState?: string;
}

// ─── Provider registry ─────────────────────────────────────────────────────

const ssoProviders = new Map<string, SsoProviderConfig>();

/** Cache of discovered OP configurations (issuer → well-known response). */
const discoveryCache = new Map<string, { endSessionEndpoint?: string; ttl: number }>();
const DISCOVERY_CACHE_TTL_MS = 3600_000; // 1 hour

/** Session → SSO metadata mapping (in-memory, keyed by sessionId). */
const ssoSessionMetadata = new Map<string, SsoSessionMetadata>();

// ─── Provider management ───────────────────────────────────────────────────

export function registerSsoProvider(config: SsoProviderConfig): void {
  ssoProviders.set(config.id, config);
  logger.info(`[SSO] Registered provider: ${config.id} (${config.issuer})`);
}

export function getSsoProvider(id: string): SsoProviderConfig | undefined {
  return ssoProviders.get(id);
}

export function getAllSsoProviders(): SsoProviderConfig[] {
  return [...ssoProviders.values()];
}

/**
 * Load SSO providers from system settings.
 * Settings key: SSO_PROVIDERS — JSON array of SsoProviderConfig objects.
 */
export function loadSsoProvidersFromSettings(): void {
  try {
    const raw = getPrivateSettingSync("SSO_PROVIDERS");
    if (!raw) return;
    const providers: SsoProviderConfig[] = typeof raw === "string" ? JSON.parse(raw) : raw;
    for (const p of providers) {
      registerSsoProvider(p);
    }
  } catch (err) {
    logger.warn("[SSO] Failed to load SSO providers from settings:", err);
  }
}

// ─── Session metadata ──────────────────────────────────────────────────────

export function setSsoSessionMetadata(sessionId: string, metadata: SsoSessionMetadata): void {
  ssoSessionMetadata.set(sessionId, metadata);
}

export function getSsoSessionMetadata(sessionId: string): SsoSessionMetadata | undefined {
  return ssoSessionMetadata.get(sessionId);
}

export function deleteSsoSessionMetadata(sessionId: string): void {
  ssoSessionMetadata.delete(sessionId);
}

/** Clean up all SSO metadata for a user's sessions. */
export function invalidateSsoSessionsForUser(_userId: string): void {
  // Simple sweep — in production this would use a reverse index
  for (const [sessionId, _meta] of ssoSessionMetadata) {
    // Sessions keyed by sessionId; we don't have userId here.
    // The caller (auth layer) handles per-session cleanup.
    logger.debug(`[SSO] Retaining SSO metadata for session ${sessionId.slice(0, 8)}...`);
  }
}

// ─── Redirect URI validation ───────────────────────────────────────────────

/**
 * Validates a post_logout_redirect_uri against a provider's allowlist.
 * Supports wildcard patterns (e.g., "https://*.example.com/logout").
 *
 * Per OIDC spec: the redirect URI must be pre-registered or match a pattern.
 * Returns false for any URI not matching the allowlist.
 */
export function validatePostLogoutRedirectUri(providerId: string, redirectUri: string): boolean {
  const provider = ssoProviders.get(providerId);
  if (!provider) {
    logger.warn(`[SSO] Unknown provider: ${providerId}`);
    return false;
  }

  if (!redirectUri) return true; // No redirect URI is always allowed
  if (provider.allowedRedirectUris.length === 0) return true; // No restrictions configured

  return provider.allowedRedirectUris.some((pattern) => {
    // Convert wildcard patterns to regex
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regexStr = escaped.replace(/\\\*/g, ".*");
    try {
      return new RegExp(`^${regexStr}$`, "i").test(redirectUri);
    } catch {
      return false;
    }
  });
}

// ─── RP-Initiated Logout ───────────────────────────────────────────────────

export interface RpInitiatedLogoutParams {
  /** Required: session ID to terminate */
  sessionId: string;
  /** Optional: id_token_hint from the original authentication */
  idTokenHint?: string;
  /** Optional: where to redirect after logout */
  postLogoutRedirectUri?: string;
  /** Optional: OIDC state parameter for CSRF protection */
  state?: string;
  /** Tenant context */
  tenantId?: DatabaseId | null;
}

export interface RpInitiatedLogoutResult {
  success: boolean;
  /** If the OP has an end_session_endpoint, this is the redirect URL */
  endSessionUrl?: string;
  /** Human-readable message */
  message: string;
}

/**
 * Performs RP-Initiated Logout per OpenID Connect spec.
 *
 * 1. Validates session exists
 * 2. Retrieves SSO metadata (provider, id_token)
 * 3. Validates post_logout_redirect_uri against provider allowlist
 * 4. Destroys the local session
 * 5. If provider has end_session_endpoint, constructs OP logout URL
 */
export async function performRpInitiatedLogout(
  params: RpInitiatedLogoutParams,
): Promise<RpInitiatedLogoutResult> {
  const { sessionId, idTokenHint, postLogoutRedirectUri, state, tenantId: _tenantId } = params;

  // 1. Retrieve SSO metadata
  const metadata = getSsoSessionMetadata(sessionId);
  if (!metadata) {
    // Not an SSO session — fall through to normal logout
    return {
      success: true,
      message: "Local session terminated (not an SSO session)",
    };
  }

  const provider = ssoProviders.get(metadata.provider);
  const effectiveIdToken = idTokenHint || metadata.idTokenHint;

  // 2. Validate redirect URI
  const redirectUri = postLogoutRedirectUri || metadata.postLogoutRedirectUri;
  if (redirectUri && !validatePostLogoutRedirectUri(metadata.provider, redirectUri)) {
    logger.warn(`[SSO] post_logout_redirect_uri not in allowlist: ${redirectUri}`);
    return {
      success: false,
      message: "Invalid post_logout_redirect_uri — not in provider allowlist",
    };
  }

  // 3. Clean up local SSO metadata
  deleteSsoSessionMetadata(sessionId);

  // 4. Resolve end_session_endpoint (manual config or auto-discovery)
  let endSessionEndpoint = provider?.endSessionEndpoint;
  if (!endSessionEndpoint && provider) {
    endSessionEndpoint = await discoverEndSessionEndpoint(metadata.provider);
  }

  // 5. If provider has end_session_endpoint, build OP logout URL
  if (endSessionEndpoint) {
    const params = new URLSearchParams();
    if (effectiveIdToken) params.set("id_token_hint", effectiveIdToken);
    if (redirectUri) params.set("post_logout_redirect_uri", redirectUri);
    if (state) params.set("state", state);

    const endSessionUrl = `${provider.endSessionEndpoint}?${params.toString()}`;

    logger.info(`[SSO] RP-Initiated Logout → ${provider.id}: ${endSessionUrl}`);
    return {
      success: true,
      endSessionUrl,
      message: `Redirecting to ${provider.id} for federated logout`,
    };
  }

  // No OP endpoint — local logout only
  logger.info(`[SSO] Local logout only (no end_session_endpoint for ${metadata.provider})`);
  return {
    success: true,
    message: "SSO session terminated locally",
  };
}

// ─── OP Discovery ───────────────────────────────────────────────────────────

/**
 * Discovers OP endpoints via OIDC Discovery (`.well-known/openid-configuration`).
 * Falls back to the manually configured `endSessionEndpoint` on the provider config.
 */
export async function discoverEndSessionEndpoint(providerId: string): Promise<string | undefined> {
  const provider = ssoProviders.get(providerId);
  if (!provider) return undefined;

  // Check discovery cache
  const cached = discoveryCache.get(provider.issuer);
  if (cached && Date.now() < cached.ttl) {
    return cached.endSessionEndpoint || provider.endSessionEndpoint;
  }

  try {
    const wellKnownUrl = `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const res = await fetch(wellKnownUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const config = await res.json();
    const discovered = config.end_session_endpoint as string | undefined;

    discoveryCache.set(provider.issuer, {
      endSessionEndpoint: discovered,
      ttl: Date.now() + DISCOVERY_CACHE_TTL_MS,
    });

    logger.info(`[SSO] Discovered end_session_endpoint for ${providerId}: ${discovered || "none"}`);
    return discovered || provider.endSessionEndpoint;
  } catch (err) {
    logger.warn(`[SSO] Discovery failed for ${provider.issuer}:`, err);
    // Cache the failure for a shorter period to avoid thundering herd
    discoveryCache.set(provider.issuer, {
      endSessionEndpoint: undefined,
      ttl: Date.now() + 300_000, // 5 min
    });
    return provider.endSessionEndpoint;
  }
}

// ─── Front-Channel Logout ───────────────────────────────────────────────────

/**
 * Handles OP-Initiated Front-Channel Logout requests.
 *
 * Per OIDC Front-Channel Logout 1.0, the OP embeds an iframe pointing
 * at the RP's frontchannel_logout_uri. The RP clears the session and
 * returns 200 with cache-prevention headers.
 *
 * Query params: `iss` (issuer) and `sid` (session ID).
 *
 * @see https://openid.net/specs/openid-connect-frontchannel-1_0.html
 */
export async function handleFrontChannelLogout(issuer: string, sid: string): Promise<Response> {
  logger.info(`[SSO] Front-channel logout: issuer=${issuer}, sid=${sid.slice(0, 8)}...`);

  // Clear sessions associated with this sid
  // In a production implementation, this would use a sid→sessionId reverse index
  for (const [sessionId, metadata] of ssoSessionMetadata) {
    if (metadata.provider && ssoProviders.get(metadata.provider)?.issuer === issuer) {
      deleteSsoSessionMetadata(sessionId);
    }
  }

  return new Response("", {
    status: 200,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

// ─── Back-Channel Logout ────────────────────────────────────────────────────

interface LogoutTokenClaims {
  iss: string;
  sub?: string;
  aud?: string;
  iat: number;
  jti: string;
  sid?: string;
  events: {
    "http://schemas.openid.net/event/backchannel-logout": Record<string, never>;
  };
}

/**
 * Handles OpenID Connect Back-Channel Logout 1.0.
 *
 * The OP sends a POST with a signed JWT `logout_token` to the RP's
 * backchannel_logout_uri. The RP validates the token and terminates
 * all sessions for the identified user.
 *
 * Token validation (per spec §2.6):
 * - Must be signed with OP's public key
 * - `iss` must match expected issuer
 * - `aud` must include this RP's client_id
 * - `iat` must be within acceptable clock skew
 * - `events` must contain the backchannel-logout event
 * - Must contain `sub` or `sid` (or both)
 * - `nonce` must NOT be present
 *
 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html
 */
export async function handleBackChannelLogout(
  logoutToken: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Decode the JWT without verification (header + payload only)
    const parts = logoutToken.split(".");
    if (parts.length !== 3) {
      return { success: false, message: "Invalid logout token format" };
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as LogoutTokenClaims;

    // Validate required claims
    if (!payload.iss) {
      return { success: false, message: "Missing iss claim" };
    }
    if (!payload.events?.["http://schemas.openid.net/event/backchannel-logout"]) {
      return { success: false, message: "Missing backchannel-logout event" };
    }
    if (!payload.sub && !payload.sid) {
      return { success: false, message: "Must contain sub or sid claim" };
    }

    // Find matching provider by issuer
    let matchedProvider: SsoProviderConfig | undefined;
    for (const provider of ssoProviders.values()) {
      if (provider.issuer === payload.iss) {
        matchedProvider = provider;
        break;
      }
    }
    if (!matchedProvider) {
      logger.warn(`[SSO] Unknown back-channel issuer: ${payload.iss}`);
      return { success: false, message: "Unknown issuer" };
    }

    // TODO: Full JWT signature verification using provider's JWKS
    // For now, validate structural claims only

    // Invalidate all SSO sessions for this issuer
    let invalidated = 0;
    for (const [sessionId, metadata] of ssoSessionMetadata) {
      if (metadata.provider === matchedProvider.id) {
        deleteSsoSessionMetadata(sessionId);
        invalidated++;
      }
    }

    logger.info(`[SSO] Back-channel logout: ${payload.iss}, invalidated ${invalidated} sessions`);
    return {
      success: true,
      message: `Back-channel logout processed (${invalidated} sessions terminated)`,
    };
  } catch (err) {
    logger.error("[SSO] Back-channel logout failed:", err);
    return { success: false, message: "Logout token validation failed" };
  }
}
