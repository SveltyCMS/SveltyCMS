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
 * - SSO metadata is kept in process memory and in the distributed cache so
 *   another node can finish RP-initiated logout
 * - Integrates with existing session rotation and invalidation
 */

import {
  constants as cryptoConstants,
  createHash,
  createPublicKey,
  randomBytes,
  verify as cryptoVerify,
} from "node:crypto";
import { logger } from "@utils/logger";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { getPrivateSettingSync, getUntypedSetting } from "@src/services/core/settings-service";
import { validateEgressUrl, safeFetch } from "@src/utils/egress-guard";
import type { DatabaseId } from "@src/content/types";

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoleMappingRule {
  claimValue: string;
  role: string;
}

export interface SsoProviderConfig {
  /** OIDC provider identifier (e.g., "google", "azure-ad", "okta", "auth0") */
  id: string;
  /** Display name (e.g. "Google Workspace", "Microsoft Entra ID", "Okta") */
  name?: string;
  /** Iconify icon identifier */
  icon?: string;
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
  /** Just-In-Time (JIT) provisioning enabled (default true) */
  jitProvisioning?: boolean;
  /** Default role assigned to newly provisioned users (default "user") */
  defaultRole?: string;
  /** JIT role mapping rules from claims or groups */
  roleMapping?: {
    claimField?: string; // e.g. "groups" or "roles"
    rules?: RoleMappingRule[];
  };
  /** Whether to synchronize roles on every login */
  syncRolesOnLogin?: boolean;
}

/** Public metadata safe to expose to client login screens */
export interface PublicSsoProvider {
  id: string;
  name: string;
  icon: string;
  authUrl: string;
}

/**
 * Generate PKCE code_verifier and code_challenge (RFC 7636).
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { codeVerifier: verifier, codeChallenge: challenge };
}

/**
 * Resolves local CMS role for an incoming user from OIDC claims based on provider JIT rules.
 */
export function resolveJitRole(claims: Record<string, unknown>, config: SsoProviderConfig): string {
  const defaultRole = config.defaultRole || "user";
  if (!config.roleMapping?.rules || config.roleMapping.rules.length === 0) {
    return defaultRole;
  }

  const claimField = config.roleMapping.claimField || "groups";
  const claimVal = claims[claimField];

  // Claims can be array (e.g. groups: ["Admins", "Devs"]) or string
  const userValues = Array.isArray(claimVal)
    ? claimVal.map(String)
    : typeof claimVal === "string"
      ? [claimVal]
      : [];

  for (const rule of config.roleMapping.rules) {
    if (userValues.includes(rule.claimValue)) {
      return rule.role;
    }
  }

  return defaultRole;
}

export interface SsoSessionMetadata {
  /** OIDC id_token from the original authentication */
  idTokenHint?: string;
  /** Provider identifier */
  provider: string;
  /** Tenant that owns the provider registration (absent = legacy/global) */
  tenantId?: string;
  /** The post_logout_redirect_uri requested at logout */
  postLogoutRedirectUri?: string;
  /** When the SSO session was created */
  createdAt: string;
  /**
   * SAML `NameID` of the assertion that created this session.
   *
   * An IdP-initiated `LogoutRequest` carries only a `NameID` (and optionally a
   * `SessionIndex`) — never our session cookie — so this is the only link back
   * to the CMS session that has to be destroyed.
   */
  samlNameId?: string;
  /** SAML `AuthnStatement/@SessionIndex` recorded at login. */
  samlSessionIndex?: string;
  /**
   * OIDC `sid` claim of the ID token that created this session.
   *
   * An OP-initiated front- or back-channel logout message identifies the
   * session by `sid` (or, as a fallback, `sub`) — never by our session cookie —
   * so this is the only link back to the CMS session that has to be destroyed.
   * Absent when the OP does not mint a `sid`.
   */
  oidcSid?: string;
  /** OIDC `sub` claim of the ID token that created this session (fallback logout key). */
  oidcSubject?: string;
  /** State parameter for CSRF protection during logout redirect */
  logoutState?: string;
}

// ─── Provider registry ─────────────────────────────────────────────────────

/**
 * Provider registry keyed by `${tenantId ?? "global"}:${providerId}`.
 *
 * Keying by provider id alone let two tenants with the same provider id
 * silently overwrite each other's issuer/client/secret — a cross-tenant
 * authentication bug. Every lookup helper accepts an optional tenant id.
 */
const ssoProviders = new Map<string, SsoProviderConfig>();

function providerKey(id: string, tenantId?: string | null): string {
  return `${tenantId ?? "global"}:${id}`;
}

/** Provider id under which SAML sessions are recorded. */
export const SAML_SSO_PROVIDER_ID = "saml";

/** Session → SSO metadata mapping (in-memory, keyed by sessionId). */
const ssoSessionMetadata = new Map<string, SsoSessionMetadata>();

/** Same lifetime as the OIDC session cookie. Shared through the cache's L2. */
const SSO_META_TTL_S = 7 * 24 * 3600;

function ssoMetaKey(sessionId: string): string {
  return `sso:session:${sessionId}`;
}

/* -------------------------------------------------------------------------- */
/* Distributed session directory                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cache namespace that is *not* scoped to the session's tenant.
 *
 * Metadata is written twice on login: once under the session's tenant (the
 * existing, tenant-scoped copy a tenant purge can clear) and once here. A
 * logout message arrives on whichever node the load balancer picked and carries
 * no tenant/cookie context, so the lookup surface has to be tenant-neutral.
 */
const SSO_SHARED_TENANT = "global";

/** Directory entry: sessionId → metadata, readable from any node/tenant. */
function ssoDirectoryKey(sessionId: string): string {
  return `sso:directory:${sessionId}`;
}

/** The external identifier a logout message is keyed by. */
type SsoIndexKind = "sid" | "sub" | "nameid";

/**
 * Index bucket key.
 *
 * Values (OP `sid`, `sub`, SAML `NameID`) are identifiers, not secrets, so they
 * stay readable for diagnostics. `encodeURIComponent` keeps `:`/`@`/whitespace
 * out of the key without hashing — a hash would make a collision silently sign
 * out the wrong session.
 */
function ssoIndexKey(kind: SsoIndexKind, value: string): string {
  return `sso:index:${kind}:${encodeURIComponent(value)}`;
}

/** Upper bound per bucket — a bucket that grows past this is a bug, not a workload. */
const SSO_INDEX_MAX_IDS = 500;

/** Every (kind, value) pair a session can be found by. */
function ssoIndexEntries(metadata: SsoSessionMetadata): Array<[SsoIndexKind, string]> {
  const entries: Array<[SsoIndexKind, string]> = [];
  if (metadata.oidcSid) entries.push(["sid", metadata.oidcSid]);
  if (metadata.oidcSubject) entries.push(["sub", metadata.oidcSubject]);
  if (metadata.samlNameId) entries.push(["nameid", metadata.samlNameId]);
  return entries;
}

function matchesIndexEntry(
  metadata: SsoSessionMetadata,
  [kind, value]: [SsoIndexKind, string],
): boolean {
  switch (kind) {
    case "sid":
      return metadata.oidcSid === value;
    case "sub":
      return metadata.oidcSubject === value;
    case "nameid":
      return metadata.samlNameId === value;
  }
}

/** Append a session id to a bucket (best effort; a lost append degrades to "not found"). */
async function addToSsoIndex(
  [kind, value]: [SsoIndexKind, string],
  sessionId: string,
): Promise<void> {
  const key = ssoIndexKey(kind, value);
  const current =
    (await cacheService.get<string[]>(key, SSO_SHARED_TENANT, CacheCategory.SESSION)) ?? [];
  if (current.includes(sessionId)) return;
  const next = [...current, sessionId].slice(-SSO_INDEX_MAX_IDS);
  await cacheService.set(key, next, SSO_META_TTL_S, SSO_SHARED_TENANT, CacheCategory.SESSION);
}

/** Remove a session id from a bucket (best effort). */
async function removeFromSsoIndex(
  [kind, value]: [SsoIndexKind, string],
  sessionId: string,
): Promise<void> {
  const key = ssoIndexKey(kind, value);
  const current =
    (await cacheService.get<string[]>(key, SSO_SHARED_TENANT, CacheCategory.SESSION)) ?? [];
  if (!current.includes(sessionId)) return;
  const next = current.filter((id) => id !== sessionId);
  await cacheService.set(key, next, SSO_META_TTL_S, SSO_SHARED_TENANT, CacheCategory.SESSION);
}

/**
 * Resolve every session a logout message can name, across nodes.
 *
 * Merges two sources so neither is a single point of failure:
 * - the process-local map (fast path; also covers a failed index write)
 * - the distributed index → directory (sessions created on another node)
 *
 * Stale ids (session already gone) are filtered out, not rewritten, so a
 * concurrent reader can never delete a live entry.
 */
async function collectIndexedSsoSessions(
  identifiers: Array<[SsoIndexKind, string]>,
  tenantId?: string | null,
): Promise<Array<{ sessionId: string; metadata: SsoSessionMetadata }>> {
  if (identifiers.length === 0) return [];

  const matches: Array<{ sessionId: string; metadata: SsoSessionMetadata }> = [];
  const seen = new Set<string>();

  for (const [sessionId, metadata] of ssoSessionMetadata) {
    if (!identifiers.some((entry) => matchesIndexEntry(metadata, entry))) continue;
    seen.add(sessionId);
    matches.push({ sessionId, metadata });
  }

  try {
    const ids = new Set<string>();
    for (const entry of identifiers) {
      const bucket =
        (await cacheService.get<string[]>(
          ssoIndexKey(entry[0], entry[1]),
          SSO_SHARED_TENANT,
          CacheCategory.SESSION,
        )) ?? [];
      for (const id of bucket) ids.add(id);
    }
    const missing = [...ids].filter((id) => !seen.has(id));
    if (missing.length > 0) {
      const stored = await cacheService.getMany<SsoSessionMetadata>(
        missing.map(ssoDirectoryKey),
        SSO_SHARED_TENANT,
      );
      missing.forEach((sessionId, index) => {
        const metadata = stored[index];
        if (!metadata?.provider) return;
        // Warm the local map so a second lookup in this process stays a map hit.
        ssoSessionMetadata.set(sessionId, metadata);
        matches.push({ sessionId, metadata });
      });
    }
  } catch (err) {
    logger.debug(
      `[SSO] Distributed session index unavailable, using local metadata only: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  void tenantId; // tenant filtering stays in the callers, which own the provider registry
  return matches;
}

// ─── Provider management ───────────────────────────────────────────────────

export function registerSsoProvider(config: SsoProviderConfig, tenantId?: string | null): void {
  ssoProviders.set(providerKey(config.id, tenantId), config);
  logger.info(
    `[SSO] Registered provider: ${config.id} (${config.issuer}) tenant=${tenantId ?? "global"}`,
  );
}

export function getSsoProvider(
  id: string,
  tenantId?: string | null,
): SsoProviderConfig | undefined {
  return ssoProviders.get(providerKey(id, tenantId));
}

/**
 * Lists registered providers.
 *
 * - With a tenant id: only that tenant's providers (the safe production call).
 * - Without: every provider across all tenants (tests, diagnostics and the
 *   back-channel logout dispatcher, which receives no tenant context).
 */
export function getAllSsoProviders(tenantId?: string | null): SsoProviderConfig[] {
  if (tenantId === undefined || tenantId === null) {
    return [...ssoProviders.values()];
  }
  const prefix = `${tenantId}:`;
  return [...ssoProviders.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, config]) => config);
}

/** Known provider icon mappings for client display */
const DEFAULT_PROVIDER_ICONS: Record<string, string> = {
  google: "flat-color-icons:google",
  github: "mdi:github",
  microsoft: "logos:microsoft-icon",
  "azure-ad": "logos:microsoft-icon",
  azure: "logos:microsoft-icon",
  okta: "logos:okta",
  auth0: "logos:auth0-icon",
  keycloak: "mdi:shield-key-outline",
};

export function getPublicSsoProviders(tenantId?: string | null): PublicSsoProvider[] {
  const providers = getAllSsoProviders(tenantId).map((p) => ({
    id: p.id,
    name: p.name || p.id.charAt(0).toUpperCase() + p.id.slice(1),
    icon: p.icon || DEFAULT_PROVIDER_ICONS[p.id.toLowerCase()] || "mdi:shield-key-outline",
    authUrl: `/api/auth/oidc-login?provider=${encodeURIComponent(p.id)}`,
  }));

  const samlConfigured =
    Boolean((getPrivateSettingSync as any)?.("SAML_ENTRY_POINT", tenantId ?? undefined)) ||
    (typeof process !== "undefined" && Boolean(process.env?.SAML_ENTRY_POINT));

  if (samlConfigured) {
    providers.push({
      id: "saml",
      name: "Enterprise SSO (SAML)",
      icon: "mdi:shield-account-outline",
      authUrl: `/api/auth/saml/login?tenant=${encodeURIComponent(tenantId || "default")}`,
    });
  }

  return providers;
}

/**
 * Load SSO providers from system settings.
 * Settings key: SSO_PROVIDERS — JSON array of SsoProviderConfig objects.
 */
export async function loadSsoProvidersFromSettings(
  tenantId?: string,
): Promise<SsoProviderConfig[]> {
  try {
    const raw = await getUntypedSetting("SSO_PROVIDERS", "private", tenantId);
    if (!raw) return getAllSsoProviders(tenantId);
    const providers: SsoProviderConfig[] =
      typeof raw === "string" ? JSON.parse(raw) : (raw as SsoProviderConfig[]);
    if (Array.isArray(providers)) {
      // Replace the tenant's registry so providers removed from settings stop
      // being usable immediately; other tenants are left untouched.
      const prefix = `${tenantId ?? "global"}:`;
      const keysToReplace: string[] = [];
      for (const key of ssoProviders.keys()) {
        if (key.startsWith(prefix)) keysToReplace.push(key);
      }
      for (const key of keysToReplace) ssoProviders.delete(key);

      for (const p of providers) {
        if (p && typeof p.id === "string") registerSsoProvider(p, tenantId);
      }
    }
  } catch (err) {
    logger.warn("[SSO] Failed to load SSO providers from settings:", err);
  }
  return getAllSsoProviders(tenantId);
}

/**
 * Persist SSO providers to system preferences and refresh memory cache.
 */
export async function saveSsoProviders(
  providers: SsoProviderConfig[],
  tenantId?: string,
): Promise<void> {
  const { dbAdapter } = await loadDbModule();
  if (dbAdapter?.system.preferences) {
    await dbAdapter.system.preferences.set("SSO_PROVIDERS", JSON.stringify(providers), {
      scope: "system",
      tenantId: (tenantId || "global") as any,
    });
    const { invalidateSettingsCache } = await loadSettingsServiceModule();
    invalidateSettingsCache(tenantId || "global");
  }
  // Replace only this tenant's entries — never wipe another tenant's providers.
  const prefix = `${tenantId ?? "global"}:`;
  const keysToReplace: string[] = [];
  for (const key of ssoProviders.keys()) {
    if (key.startsWith(prefix)) keysToReplace.push(key);
  }
  for (const key of keysToReplace) ssoProviders.delete(key);
  for (const p of providers) {
    registerSsoProvider(p, tenantId);
  }
}

/**
 * Destroys the CMS session behind an SSO logout, then drops its SSO metadata.
 *
 * Deleting the metadata alone (the previous behaviour at all three logout paths) left
 * the session row valid, so an IdP-driven logout terminated nothing: the user stayed
 * signed in until the session expired. The adapter call is used — not a process-local
 * set — so a second node sees the deletion too, and the in-process session cache is
 * invalidated so the same node stops serving the cached entry as well.
 */
export async function terminateSessionAndMetadata(
  sessionId: string,
  tenantId?: string | null,
): Promise<void> {
  // Read before delete so the distributed index can be pruned; the lookup falls
  // back to the directory when this node never cached the metadata.
  const metadata = await getSsoSessionMetadata(sessionId, tenantId);
  deleteSsoSessionMetadata(sessionId, tenantId, metadata);
  try {
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (db?.auth?.deleteSession) {
      // BaseQueryOptions.tenantId is a branded id type; the value comes from session
      // metadata, which is a plain string there.
      await db.auth.deleteSession(
        sessionId as DatabaseId,
        tenantId ? ({ tenantId } as never) : undefined,
      );
    }
    const { invalidateSessionCache } = await import("@src/hooks/handle-authentication");
    invalidateSessionCache(sessionId, (tenantId ?? null) as DatabaseId | null);
  } catch (err) {
    logger.warn(
      `[SSO] Session ${sessionId.slice(0, 8)}... could not be destroyed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Clear in-memory registered providers.
 * With a tenant id only that tenant is cleared; without, the whole registry
 * (useful in tests).
 */
export function clearSsoProviders(tenantId?: string | null): void {
  if (tenantId === undefined || tenantId === null) {
    ssoProviders.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  const keysToClear: string[] = [];
  for (const key of ssoProviders.keys()) {
    if (key.startsWith(prefix)) keysToClear.push(key);
  }
  for (const key of keysToClear) ssoProviders.delete(key);
}

// ─── Session metadata ──────────────────────────────────────────────────────

export async function setSsoSessionMetadata(
  sessionId: string,
  metadata: SsoSessionMetadata,
  tenantId?: string | null,
): Promise<void> {
  ssoSessionMetadata.set(sessionId, metadata);
  // Three writes on login, all best effort: the tenant-scoped copy, the
  // tenant-neutral directory and one bucket per external identifier. Without
  // them a logout delivered to another node could not find this session.
  await Promise.allSettled([
    cacheService.set(
      ssoMetaKey(sessionId),
      metadata,
      SSO_META_TTL_S,
      tenantId ?? "global",
      CacheCategory.SESSION,
    ),
    cacheService.set(
      ssoDirectoryKey(sessionId),
      metadata,
      SSO_META_TTL_S,
      SSO_SHARED_TENANT,
      CacheCategory.SESSION,
    ),
    ...ssoIndexEntries(metadata).map((entry) => addToSsoIndex(entry, sessionId)),
  ]).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        logger.warn(
          `[SSO] Failed to persist session metadata: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        );
      }
    }
  });
}

export async function getSsoSessionMetadata(
  sessionId: string,
  tenantId?: string | null,
): Promise<SsoSessionMetadata | undefined> {
  const local = ssoSessionMetadata.get(sessionId);
  if (local) return local;
  try {
    const stored = await cacheService.get<SsoSessionMetadata>(
      ssoMetaKey(sessionId),
      tenantId ?? "global",
      CacheCategory.SESSION,
    );
    if (stored?.provider) {
      ssoSessionMetadata.set(sessionId, stored);
      return stored;
    }
  } catch (err) {
    logger.debug("[SSO] Distributed session metadata unavailable", err);
  }
  return undefined;
}

/**
 * Finds the SSO sessions created by a SAML assertion.
 *
 * IdP-initiated `LogoutRequest` messages identify the session by `NameID` and,
 * optionally, `SessionIndex`. A request without a `SessionIndex` — or a session
 * recorded without one — matches on `NameID` alone: refusing to match would
 * leave the session alive, which is the failure this lookup exists to prevent.
 */
export async function findSamlSessions(
  nameId: string,
  sessionIndex?: string,
  tenantId?: string | null,
): Promise<Array<{ sessionId: string; tenantId?: string }>> {
  if (!nameId) return [];
  const candidates = await collectIndexedSsoSessions([["nameid", nameId]], tenantId);
  const matches: Array<{ sessionId: string; tenantId?: string }> = [];
  for (const { sessionId, metadata } of candidates) {
    if (metadata.provider !== SAML_SSO_PROVIDER_ID) continue;
    if (metadata.samlNameId !== nameId) continue;
    if (sessionIndex && metadata.samlSessionIndex && metadata.samlSessionIndex !== sessionIndex) {
      continue;
    }
    matches.push({ sessionId, tenantId: metadata.tenantId });
  }
  return matches;
}

export function deleteSsoSessionMetadata(
  sessionId: string,
  tenantId?: string | null,
  metadata?: SsoSessionMetadata,
): void {
  const known = metadata ?? ssoSessionMetadata.get(sessionId);
  ssoSessionMetadata.delete(sessionId);
  void cacheService.delete(ssoMetaKey(sessionId), tenantId ?? "global").catch((err: unknown) => {
    logger.debug(
      `[SSO] Failed to delete distributed session metadata: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  void cacheService.delete(ssoDirectoryKey(sessionId), SSO_SHARED_TENANT).catch((err: unknown) => {
    logger.debug(
      `[SSO] Failed to delete session directory entry: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  // Pruning is best effort: a missed prune leaves a dead id behind, which the
  // lookup filters out (the directory entry is already gone).
  for (const entry of known ? ssoIndexEntries(known) : []) {
    void removeFromSsoIndex(entry, sessionId).catch((err: unknown) => {
      logger.debug(
        `[SSO] Failed to prune session index entry: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}

/**
 * Drop every in-process SSO session metadata entry.
 *
 * Production code never calls this; it exists so a test can model a second
 * application instance (one that has never cached the login) and prove the
 * logout lookup still finds the session through the distributed index.
 */
export function resetSsoSessions(): void {
  ssoSessionMetadata.clear();
}

// ─── Redirect URI validation ───────────────────────────────────────────────

/**
 * Validates a post_logout_redirect_uri against a provider's allowlist.
 * Supports wildcard patterns (e.g., "https://*.example.com/logout").
 *
 * Per OIDC spec: the redirect URI must be pre-registered or match a pattern.
 * Returns false for any URI not matching the allowlist.
 */
export function validatePostLogoutRedirectUri(
  providerId: string,
  redirectUri: string,
  tenantId?: string | null,
): boolean {
  const provider = getSsoProvider(providerId, tenantId);
  if (!provider) {
    logger.warn(`[SSO] Unknown provider: ${providerId} (tenant=${tenantId ?? "global"})`);
    return false;
  }

  if (!redirectUri) return true; // No redirect URI is always allowed
  // 🔴 FIX: an empty allowlist must reject every URI (open redirect), not allow all.
  if (provider.allowedRedirectUris.length === 0) return false;

  return provider.allowedRedirectUris.some((pattern) => {
    // Convert wildcard patterns to regex. `*` must be escaped with the rest of
    // the metacharacters first, otherwise `\*` never matches and the wildcard
    // pattern is compiled as a quantifier on the preceding character.
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const metadata = await getSsoSessionMetadata(sessionId, _tenantId);
  if (!metadata) {
    // Not an SSO session — fall through to normal logout
    return {
      success: true,
      message: "Local session terminated (not an SSO session)",
    };
  }

  // Prefer the tenant recorded with the session; fall back to the caller's
  // tenant, then (legacy metadata only) to the global registry entry.
  const requestedTenant = metadata.tenantId ?? (_tenantId ? String(_tenantId) : undefined);
  let providerTenant = requestedTenant;
  let provider = getSsoProvider(metadata.provider, requestedTenant);
  if (!provider && !metadata.tenantId) {
    provider = getSsoProvider(metadata.provider);
    providerTenant = undefined;
  }
  const effectiveIdToken = idTokenHint || metadata.idTokenHint;

  // 2. Validate redirect URI
  const redirectUri = postLogoutRedirectUri || metadata.postLogoutRedirectUri;
  if (
    redirectUri &&
    !validatePostLogoutRedirectUri(metadata.provider, redirectUri, providerTenant)
  ) {
    logger.warn(`[SSO] post_logout_redirect_uri not in allowlist: ${redirectUri}`);
    return {
      success: false,
      message: "Invalid post_logout_redirect_uri — not in provider allowlist",
    };
  }

  // 3. Destroy the CMS session and its SSO metadata (metadata alone left it valid)
  await terminateSessionAndMetadata(sessionId, metadata.tenantId ?? _tenantId);

  // 4. Resolve end_session_endpoint (manual config or auto-discovery)
  let endSessionEndpoint = provider?.endSessionEndpoint;
  if (!endSessionEndpoint && provider) {
    endSessionEndpoint = await discoverEndSessionEndpoint(metadata.provider, providerTenant);
  }

  // 5. If provider has end_session_endpoint, build OP logout URL
  if (endSessionEndpoint && provider) {
    const params = new URLSearchParams();
    if (effectiveIdToken) params.set("id_token_hint", effectiveIdToken);
    if (redirectUri) params.set("post_logout_redirect_uri", redirectUri);
    if (state) params.set("state", state);

    const endSessionUrl = `${endSessionEndpoint}?${params.toString()}`;

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
  tenantId?: string | null,
): Promise<DiscoveredOidcConfig | undefined> {
  const provider = getSsoProvider(providerId, tenantId);
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
export async function discoverEndSessionEndpoint(
  providerId: string,
  tenantId?: string | null,
): Promise<string | undefined> {
  const discovered = await discoverOidcConfig(providerId, tenantId);
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
 * JWA algorithms accepted for IdP-issued JWTs. HMAC (`HS*`) is deliberately
 * absent: accepting it alongside a public JWKS enables algorithm-confusion
 * attacks that forge tokens with the OIDC client secret.
 */
const SUPPORTED_JWT_ALGS = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
]);

const JWT_CLOCK_SKEW_S = 60;
const JWT_MAX_IAT_FUTURE_S = 300;

function jwtHash(alg: string): "SHA256" | "SHA384" | "SHA512" {
  if (alg.endsWith("256")) return "SHA256";
  if (alg.endsWith("384")) return "SHA384";
  return "SHA512";
}

function jwtHashBytes(alg: string): number {
  if (alg.endsWith("256")) return 32;
  if (alg.endsWith("384")) return 48;
  return 64;
}

/** True when a JWK can verify a signature produced with `alg`. */
function isUsableJwk(jwk: any, alg: string): boolean {
  if (!jwk || typeof jwk !== "object") return false;
  if (jwk.use && jwk.use !== "sig") return false;
  if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes("verify")) return false;
  // A key pinned to another algorithm must not be used for this one.
  if (jwk.alg && jwk.alg !== alg) return false;

  if (alg.startsWith("RS") || alg.startsWith("PS")) return jwk.kty === "RSA";
  if (alg.startsWith("ES")) {
    if (jwk.kty !== "EC") return false;
    const expectedCurve = alg === "ES256" ? "P-256" : alg === "ES384" ? "P-384" : "P-521";
    return !jwk.crv || jwk.crv === expectedCurve;
  }
  return false;
}

/** Encode a positive big-endian integer as an ASN.1 INTEGER. */
function asn1Integer(value: Buffer): Buffer {
  // Strip redundant leading zeros, but keep one when the high bit is set.
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  let bytes = value.subarray(start);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
}

/**
 * JOSE ECDSA signatures are raw `r || s`; node:crypto expects DER.
 * Returns null when the signature length is not valid for the curve.
 */
function joseEcdsaToDer(signature: Buffer, partLength: number): Buffer | null {
  if (signature.length !== partLength * 2) return null;
  const r = asn1Integer(signature.subarray(0, partLength));
  const s = asn1Integer(signature.subarray(partLength));
  const content = Buffer.concat([r, s]);
  const length = content.length;
  // DER length: short form below 0x80, long form otherwise (P-521 needs it).
  const header =
    length < 0x80
      ? Buffer.from([0x30, length])
      : length <= 0xff
        ? Buffer.from([0x30, 0x81, length])
        : Buffer.from([0x30, 0x82, (length >> 8) & 0xff, length & 0xff]);
  return Buffer.concat([header, content]);
}

function verifyJwtSignature(alg: string, data: string, signature: Buffer, jwk: any): boolean {
  const keyObject = createPublicKey({ key: jwk, format: "jwk" });
  const hash = jwtHash(alg);

  if (alg.startsWith("ES")) {
    const der = joseEcdsaToDer(signature, jwtHashBytes(alg));
    if (!der) return false;
    return cryptoVerify(hash, Buffer.from(data), keyObject, der);
  }

  if (alg.startsWith("PS")) {
    return cryptoVerify(
      hash,
      Buffer.from(data),
      {
        key: keyObject,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: jwtHashBytes(alg),
      },
      signature,
    );
  }

  return cryptoVerify(hash, Buffer.from(data), keyObject, signature);
}

/**
 * Verify a JWT (id_token / logout token) with the provider JWKS.
 *
 * Enforced checks: exact `iss`, asymmetric algorithm allowlist (no `HS*`),
 * `exp`/`nbf`/`iat` with clock skew, `aud` containing the configured client
 * id, `azp` equality when present, and strict JWKS key selection by `kid`.
 * Uses Node crypto — no external jose dependency.
 */
export async function verifyJwtWithProviderJwks(
  token: string,
  provider: SsoProviderConfig,
  tenantId?: string | null,
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

    // 1. Exact issuer match.
    if (!payload.iss || payload.iss !== provider.issuer) {
      return { valid: false, reason: "iss mismatch" };
    }

    // 2. Asymmetric algorithms only (algorithm-confusion resistant).
    const alg = header.alg;
    if (!alg || !SUPPORTED_JWT_ALGS.has(alg)) {
      return { valid: false, reason: `Unsupported alg: ${alg ?? "missing"}` };
    }

    // 3. Time claims.
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return { valid: false, reason: "missing or invalid exp" };
    }
    if (now >= payload.exp + JWT_CLOCK_SKEW_S) {
      return { valid: false, reason: "token expired" };
    }
    if (payload.nbf !== undefined) {
      if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf)) {
        return { valid: false, reason: "invalid nbf" };
      }
      if (now + JWT_CLOCK_SKEW_S < payload.nbf) {
        return { valid: false, reason: "token not yet valid" };
      }
    }
    if (payload.iat !== undefined) {
      if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
        return { valid: false, reason: "invalid iat" };
      }
      if (payload.iat > now + JWT_MAX_IAT_FUTURE_S) {
        return { valid: false, reason: "iat too far in the future" };
      }
    }

    // 4. Audience / authorized party binding.
    if (!provider.clientId) {
      return { valid: false, reason: "provider clientId not configured" };
    }
    const audiences = Array.isArray(payload.aud)
      ? payload.aud.map(String)
      : typeof payload.aud === "string"
        ? [payload.aud]
        : [];
    if (!audiences.includes(provider.clientId)) {
      return { valid: false, reason: "aud mismatch" };
    }
    if (payload.azp !== undefined && payload.azp !== provider.clientId) {
      return { valid: false, reason: "azp mismatch" };
    }

    // 5. Resolve the signing key. A token that names a `kid` must use exactly
    // that key — never silently fall back to another key or `keys[0]`.
    const discovered = await discoverOidcConfig(provider.id, tenantId);
    const jwksUri = discovered?.jwksUri || provider.jwksUri;
    if (!jwksUri) {
      // 🔴 FIX: without a JWKS we cannot verify the signature — fail closed
      // instead of accepting the token structurally (auth bypass).
      logger.warn(`[SSO] No jwks_uri for ${provider.id} — rejecting token`);
      return { valid: false, reason: "no_jwks_configured" };
    }

    const keys = await fetchJwks(jwksUri);
    let candidates: any[];
    if (header.kid) {
      const matching = keys.filter((k) => k?.kid === header.kid);
      if (matching.length !== 1) {
        return { valid: false, reason: `No JWK for kid: ${header.kid}` };
      }
      if (!isUsableJwk(matching[0], alg)) {
        return { valid: false, reason: `Unusable JWK for alg: ${alg}` };
      }
      candidates = matching;
    } else {
      candidates = keys.filter((k) => isUsableJwk(k, alg));
      if (candidates.length === 0) {
        return { valid: false, reason: "No matching JWK" };
      }
    }

    const data = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], "base64url");
    const ok = candidates.some((jwk) => verifyJwtSignature(alg, data, signature, jwk));
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
  opts: {
    redirectUri: string;
    state: string;
    nonce?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  },
  tenantId?: string | null,
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const provider = getSsoProvider(providerId, tenantId);
  if (!provider) return { success: false, message: "Unknown provider" };
  if (!provider.clientId) return { success: false, message: "Provider missing clientId" };

  const discovered = await discoverOidcConfig(providerId, tenantId);
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
  if (opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", opts.codeChallengeMethod || "S256");
  }
  return { success: true, url: url.toString() };
}

/**
 * Exchange authorization code for tokens at the OP token endpoint.
 */
export async function exchangeOidcCode(
  providerId: string,
  opts: { code: string; redirectUri: string; codeVerifier?: string },
  tenantId?: string | null,
): Promise<
  | { success: true; idToken?: string; accessToken?: string; payload?: Record<string, unknown> }
  | { success: false; message: string }
> {
  const provider = getSsoProvider(providerId, tenantId);
  if (!provider?.clientId)
    return { success: false, message: "Unknown provider or missing clientId" };
  const discovered = await discoverOidcConfig(providerId, tenantId);
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
    if (opts.codeVerifier) body.set("code_verifier", opts.codeVerifier);

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
      const verified = await verifyJwtWithProviderJwks(json.id_token, provider, tenantId);
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
 * Query params: `iss` (issuer) and `sid` (session ID). Only the session(s)
 * whose recorded `oidcSid` equals `sid` are terminated: the OP names one login
 * session, so a logout must not sign out every user on the same provider.
 *
 * @see https://openid.net/specs/openid-connect-frontchannel-1_0.html
 */
export async function handleFrontChannelLogout(
  issuer: string,
  sid: string,
  tenantId?: string | null,
): Promise<Response> {
  logger.info(`[SSO] Front-channel logout: issuer=${issuer}, sid=${sid.slice(0, 8)}...`);

  // Match the exact OP session id (recorded at login from the id_token `sid`).
  // No match — including sessions without a recorded sid — terminates nothing;
  // the response is still a 200 so the OP iframe completes. The lookup is
  // distributed: the login may have happened on another node.
  const candidates = sid ? await collectIndexedSsoSessions([["sid", sid]], tenantId) : [];
  for (const { sessionId, metadata } of candidates) {
    if (!metadata.provider) continue;
    if (metadata.oidcSid !== sid) continue;
    const provider = getSsoProvider(metadata.provider, metadata.tenantId ?? tenantId);
    if (provider?.issuer === issuer) {
      await terminateSessionAndMetadata(sessionId, metadata.tenantId ?? tenantId);
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

/** Accepted iat skew / maximum age for a back-channel logout token (spec §2.6). */
const LOGOUT_TOKEN_MAX_AGE_S = 300;

interface LogoutTokenClaims {
  iss: string;
  sub?: string;
  aud?: string | string[];
  iat: number;
  jti: string;
  sid?: string;
  /** Spec §2.6: a logout token MUST NOT carry a nonce. */
  nonce?: string;
  events: {
    "http://schemas.openid.net/event/backchannel-logout": Record<string, never>;
  };
}

/**
 * Handles OpenID Connect Back-Channel Logout 1.0.
 *
 * The OP sends a POST with a signed JWT `logout_token` to the RP's
 * backchannel_logout_uri. The RP validates the token and terminates the
 * sessions it identifies: by `sid` when present, otherwise by `sub`. Sessions
 * the token does not name are never touched (spec §2.6 / §2.7).
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
  tenantId?: string | null,
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

    // Find candidates by issuer (scoped to the tenant when known). The issuer
    // is the discriminator; the token audience then selects the RP config.
    const candidates = getAllSsoProviders(tenantId).filter(
      (provider) => provider.issuer === payload.iss,
    );
    if (candidates.length === 0) {
      logger.warn(`[SSO] Unknown back-channel issuer: ${payload.iss}`);
      return { success: false, message: "Unknown issuer" };
    }

    // Spec §2.6: a logout token is single-use/near-term and minted for one RP.
    // Without these checks any token signed by the provider (for any client,
    // however old) could terminate this deployment's sessions.
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || Math.abs(now - payload.iat) > LOGOUT_TOKEN_MAX_AGE_S) {
      return { success: false, message: "Stale or invalid iat claim" };
    }
    if (payload.nonce !== undefined) {
      return { success: false, message: "Logout token must not contain nonce" };
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const withClientId = candidates.filter((provider) => Boolean(provider.clientId));
    const audienceCandidates =
      withClientId.length > 0
        ? withClientId.filter((provider) => audiences.includes(provider.clientId as string))
        : candidates;
    if (withClientId.length > 0 && audienceCandidates.length === 0) {
      return { success: false, message: "aud mismatch" };
    }

    // 🚀 JWKS signature verification (RS*/PS*/ES*) — try only the providers
    // whose client id matches the token audience, so a token minted for one
    // tenant can never terminate another tenant's sessions.
    let matchedProvider: SsoProviderConfig | undefined;
    let rejectionReason: string | undefined;
    for (const candidate of audienceCandidates) {
      const verified = await verifyJwtWithProviderJwks(logoutToken, candidate, tenantId);
      if (verified.valid) {
        matchedProvider = candidate;
        break;
      }
      rejectionReason = verified.reason;
    }
    if (!matchedProvider) {
      logger.warn(`[SSO] Back-channel logout token rejected: ${rejectionReason}`);
      return {
        success: false,
        message: `Invalid logout token: ${rejectionReason ?? "verification failed"}`,
      };
    }

    // A logout token names one login session (`sid`) or, when the OP does not
    // send one, the user (`sub`). Only those sessions may be terminated: per
    // OIDC Back-Channel Logout 1.0 an RP must not sign out unrelated sessions.
    const logoutSid = typeof payload.sid === "string" && payload.sid ? payload.sid : undefined;
    const logoutSubject = typeof payload.sub === "string" && payload.sub ? payload.sub : undefined;

    // Invalidate the matching SSO sessions for this exact provider registration.
    // Resolve each session's own tenant provider so an identically named
    // provider in another tenant is never terminated by a token minted for this
    // issuer.
    let invalidated = 0;
    const identifiers: Array<["sid" | "sub", string]> =
      logoutSid !== undefined
        ? [["sid", logoutSid]]
        : logoutSubject !== undefined
          ? [["sub", logoutSubject]]
          : [];
    // Distributed: the session may have been created on another node, so the
    // local map is only one of two sources (see collectIndexedSsoSessions).
    const logoutCandidates = await collectIndexedSsoSessions(identifiers, tenantId);
    for (const { sessionId, metadata } of logoutCandidates) {
      if (metadata.provider !== matchedProvider.id) continue;
      if (logoutSid !== undefined) {
        if (metadata.oidcSid !== logoutSid) continue;
      } else if (logoutSubject !== undefined) {
        if (metadata.oidcSubject !== logoutSubject) continue;
      } else {
        continue;
      }
      const sessionProvider = getSsoProvider(metadata.provider, metadata.tenantId ?? tenantId);
      if (sessionProvider) {
        // Object identity distinguishes tenant registrations with the same id.
        if (sessionProvider !== matchedProvider) continue;
      } else if (metadata.tenantId) {
        // A tenant-scoped session must resolve its own provider — fail closed.
        continue;
      }
      await terminateSessionAndMetadata(sessionId, metadata.tenantId ?? tenantId);
      invalidated++;
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
