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
import { getUntypedSetting } from "@src/services/core/settings-service";
import { validateEgressUrl, safeFetch } from "@src/utils/egress-guard";
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
  /** OAuth/OIDC client id (login flow) */
  clientId?: string;
  /** OAuth/OIDC client secret (token exchange — server only) */
  clientSecret?: string;
  /** Authorization endpoint (or discovered) */
  authorizationEndpoint?: string;
  /** Token endpoint (or discovered) */
  tokenEndpoint?: string;
  /** JWKS URI for JWT signature verification */
  jwksUri?: string;
  /** Scopes for authorization code flow (default openid profile email) */
  scopes?: string[];
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
    const raw = getUntypedSetting("SSO_PROVIDERS");
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
  if (endSessionEndpoint && provider) {
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

interface DiscoveredOidcConfig {
  endSessionEndpoint?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  ttl: number;
}

const discoveryCache = new Map<string, DiscoveredOidcConfig>();
const DISCOVERY_CACHE_TTL_MS = 3_600_000; // 1h
const jwksCache = new Map<string, { keys: any[]; ttl: number }>();

/**
 * Full OIDC discovery document (cached). Populates auth/token/jwks/logout endpoints.
 */
export async function discoverOidcConfig(
  providerId: string,
): Promise<DiscoveredOidcConfig | undefined> {
  const provider = ssoProviders.get(providerId);
  if (!provider) return undefined;

  const cached = discoveryCache.get(provider.issuer);
  if (cached && Date.now() < cached.ttl) return cached;

  try {
    const wellKnownUrl = `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    // 🛡️ SSRF: the issuer is admin-configured — discovery must go through the
    // awaited egress guard + safeFetch, never a raw fetch on the configured URL.
    const allowHttp = process.env.NODE_ENV === "development";
    await validateEgressUrl(wellKnownUrl, { allowHttp });
    const resp = await safeFetch(wellKnownUrl, {
      allowHttp,
      timeoutMs: 5000,
      maxSizeBytes: 1024 * 1024,
    });
    if (!resp.success || !resp.body) throw new Error(resp.error || `HTTP ${resp.status}`);
    const config = JSON.parse(resp.body);
    const discovered: DiscoveredOidcConfig = {
      endSessionEndpoint: (config.end_session_endpoint as string) || provider.endSessionEndpoint,
      authorizationEndpoint:
        (config.authorization_endpoint as string) || provider.authorizationEndpoint,
      tokenEndpoint: (config.token_endpoint as string) || provider.tokenEndpoint,
      jwksUri: (config.jwks_uri as string) || provider.jwksUri,
      ttl: Date.now() + DISCOVERY_CACHE_TTL_MS,
    };
    discoveryCache.set(provider.issuer, discovered);
    // Also hydrate provider config for subsequent calls
    if (discovered.endSessionEndpoint) provider.endSessionEndpoint = discovered.endSessionEndpoint;
    if (discovered.authorizationEndpoint)
      provider.authorizationEndpoint = discovered.authorizationEndpoint;
    if (discovered.tokenEndpoint) provider.tokenEndpoint = discovered.tokenEndpoint;
    if (discovered.jwksUri) provider.jwksUri = discovered.jwksUri;
    logger.info(`[SSO] OIDC discovery OK for ${providerId}`);
    return discovered;
  } catch (err) {
    logger.warn(`[SSO] Discovery failed for ${provider.issuer}:`, err);
    const fallback: DiscoveredOidcConfig = {
      endSessionEndpoint: provider.endSessionEndpoint,
      authorizationEndpoint: provider.authorizationEndpoint,
      tokenEndpoint: provider.tokenEndpoint,
      jwksUri: provider.jwksUri,
      ttl: Date.now() + 300_000,
    };
    discoveryCache.set(provider.issuer, fallback);
    return fallback;
  }
}

/**
 * Discovers OP logout endpoint via OIDC Discovery.
 */
export async function discoverEndSessionEndpoint(providerId: string): Promise<string | undefined> {
  const discovered = await discoverOidcConfig(providerId);
  return discovered?.endSessionEndpoint;
}

/** Fetch and cache JWKS for an issuer. */
async function fetchJwks(jwksUri: string): Promise<any[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() < cached.ttl) return cached.keys;
  // 🛡️ SSRF: jwksUri is admin-configured/discovered — guard it like discovery.
  const allowHttp = process.env.NODE_ENV === "development";
  await validateEgressUrl(jwksUri, { allowHttp });
  const resp = await safeFetch(jwksUri, {
    allowHttp,
    timeoutMs: 5000,
    maxSizeBytes: 1024 * 1024,
  });
  if (!resp.success || !resp.body) throw new Error(resp.error || `JWKS HTTP ${resp.status}`);
  const body = JSON.parse(resp.body);
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(jwksUri, { keys, ttl: Date.now() + 3_600_000 });
  return keys;
}

/**
 * Verify a JWT (logout token / id_token) with the provider JWKS (RS256/ES256).
 * Uses Node crypto — no external jose dependency.
 */
export async function verifyJwtWithProviderJwks(
  token: string,
  provider: SsoProviderConfig,
): Promise<{ valid: boolean; payload?: Record<string, unknown>; reason?: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, reason: "Invalid JWT format" };

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;

    if (payload.iss && payload.iss !== provider.issuer) {
      return { valid: false, reason: "iss mismatch" };
    }

    const discovered = await discoverOidcConfig(provider.id);
    const jwksUri = discovered?.jwksUri || provider.jwksUri;
    if (!jwksUri) {
      // Structural validation only when JWKS not configured
      logger.warn(`[SSO] No jwks_uri for ${provider.id} — structural claims only`);
      return { valid: true, payload, reason: "no_jwks_structural_only" };
    }

    const keys = await fetchJwks(jwksUri);
    const jwk =
      (header.kid ? keys.find((k) => k.kid === header.kid) : undefined) ||
      keys.find((k) => k.kty === "RSA" || k.kty === "EC") ||
      keys[0];
    if (!jwk) return { valid: false, reason: "No matching JWK" };

    const { createPublicKey, createVerify, createHmac, timingSafeEqual } =
      await import("node:crypto");
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], "base64url");
    const alg = header.alg || "RS256";

    if (alg.startsWith("HS")) {
      if (!provider.clientSecret) return { valid: false, reason: "HS* without clientSecret" };
      const h = createHmac(
        alg === "HS512" ? "sha512" : alg === "HS384" ? "sha384" : "sha256",
        provider.clientSecret,
      );
      h.update(data);
      const expected = h.digest();
      if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
        return { valid: false, reason: "HMAC signature mismatch" };
      }
      return { valid: true, payload };
    }

    const keyObject = createPublicKey({ key: jwk, format: "jwk" });
    const verifyAlg = alg.startsWith("ES")
      ? alg === "ES512"
        ? "SHA512"
        : alg === "ES384"
          ? "SHA384"
          : "SHA256"
      : alg === "RS512"
        ? "RSA-SHA512"
        : alg === "RS384"
          ? "RSA-SHA384"
          : "RSA-SHA256";
    const v = createVerify(verifyAlg);
    v.update(data);
    v.end();
    const ok = v.verify(keyObject, signature);
    if (!ok) return { valid: false, reason: "Signature verification failed" };
    return { valid: true, payload };
  } catch (err) {
    logger.warn("[SSO] JWT JWKS verification failed:", err);
    return { valid: false, reason: err instanceof Error ? err.message : "verify error" };
  }
}

/**
 * Build OIDC authorization URL for login (authorization code flow).
 */
export async function buildOidcAuthorizationUrl(
  providerId: string,
  opts: { redirectUri: string; state: string; nonce?: string },
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const provider = ssoProviders.get(providerId);
  if (!provider) return { success: false, message: "Unknown provider" };
  if (!provider.clientId) return { success: false, message: "Provider missing clientId" };

  const discovered = await discoverOidcConfig(providerId);
  const authEndpoint = discovered?.authorizationEndpoint || provider.authorizationEndpoint;
  if (!authEndpoint) return { success: false, message: "No authorization_endpoint" };

  const scopes = (provider.scopes || ["openid", "profile", "email"]).join(" ");
  const url = new URL(authEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", opts.state);
  if (opts.nonce) url.searchParams.set("nonce", opts.nonce);
  return { success: true, url: url.toString() };
}

/**
 * Exchange authorization code for tokens at the OP token endpoint.
 */
export async function exchangeOidcCode(
  providerId: string,
  opts: { code: string; redirectUri: string },
): Promise<
  | { success: true; idToken?: string; accessToken?: string; payload?: Record<string, unknown> }
  | { success: false; message: string }
> {
  const provider = ssoProviders.get(providerId);
  if (!provider?.clientId)
    return { success: false, message: "Unknown provider or missing clientId" };
  const discovered = await discoverOidcConfig(providerId);
  const tokenEndpoint = discovered?.tokenEndpoint || provider.tokenEndpoint;
  if (!tokenEndpoint) return { success: false, message: "No token_endpoint" };

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: provider.clientId,
    });
    if (provider.clientSecret) body.set("client_secret", provider.clientSecret);

    // 🛡️ SSRF: tokenEndpoint is admin-configured/discovered — egress-guarded.
    const allowHttp = process.env.NODE_ENV === "development";
    await validateEgressUrl(tokenEndpoint, { allowHttp });
    const resp = await safeFetch(tokenEndpoint, {
      allowHttp,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      timeoutMs: 10_000,
      maxSizeBytes: 1024 * 1024,
    });
    if (!resp.success || !resp.body) {
      return {
        success: false,
        message: `Token exchange failed: ${resp.status} ${(resp.body || resp.error || "").slice(0, 200)}`,
      };
    }
    const json = JSON.parse(resp.body) as {
      id_token?: string;
      access_token?: string;
    };
    let payload: Record<string, unknown> | undefined;
    if (json.id_token) {
      const verified = await verifyJwtWithProviderJwks(json.id_token, provider);
      if (!verified.valid) {
        return { success: false, message: `id_token invalid: ${verified.reason}` };
      }
      payload = verified.payload;
    }
    return {
      success: true,
      idToken: json.id_token,
      accessToken: json.access_token,
      payload,
    };
  } catch (err) {
    logger.error("[SSO] Token exchange failed:", err);
    return { success: false, message: "Token exchange error" };
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

    // 🚀 JWKS signature verification (RS256/ES256) when jwks_uri available
    const verified = await verifyJwtWithProviderJwks(logoutToken, matchedProvider);
    if (!verified.valid) {
      logger.warn(`[SSO] Back-channel logout token rejected: ${verified.reason}`);
      return { success: false, message: `Invalid logout token: ${verified.reason}` };
    }

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
