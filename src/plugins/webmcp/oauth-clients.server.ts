/**
 * @file src/plugins/webmcp/oauth-clients.server.ts
 * @description OAuth 2.1 client-credentials client registry for the WebMCP gateway.
 *
 * Clients are adapter records in `plugin_webmcp_oauth_clients` (one row per
 * client, keyed by `clientId`). A dedicated row store is required because token
 * issuance must resolve a client by id *before* any tenant is known, while the
 * plugin-settings document is a single row per plugin + tenant. Only the
 * HMAC-SHA-256 of the client secret is persisted — never the plaintext.
 *
 * Features:
 * - `createWebMcpOAuthClient()` returns the plaintext secret exactly once
 * - constant-time secret verification (compare HMACs, never plaintext)
 * - tenant-bound, scope-bounded client records
 * - legacy static `agentApiKey` lookup for backward-compatible token exchange
 * - CSPRNG-only credential generation (`crypto.getRandomValues`)
 *
 * ### Security:
 * - Server-only module (`*.server.ts`) — never part of the client graph.
 * - The provisioning helper performs no authentication. Call it only from an
 *   admin-authorized server path (CLI or plugin settings), never from a route.
 * - `secretHash` is HMAC-SHA-256 with the server secret and a domain prefix, so
 *   a leaked database cannot be brute-forced offline without the server secret.
 */

import { timingSafeEqual } from "node:crypto";
import {
  type BaseEntity,
  type DatabaseId,
  type DatabaseResult,
  type IDBAdapter,
  withSystemScope,
} from "@databases/db-interface";
import { hashApiKey } from "@src/databases/auth/api-keys";
import { PluginSettingsService } from "@plugins/settings";
import { logger } from "@utils/logger";
import { webmcpPlugin } from "./index";

/** Stable plugin id used for license and settings lookups. */
export const WEBMCP_PLUGIN_ID = "webmcp";

/** Plugin-private collection holding one OAuth client per row. */
export const WEBMCP_OAUTH_CLIENT_COLLECTION = "plugin_webmcp_oauth_clients";

/** Fixed scope allowlist — the only scopes a WebMCP client can ever receive. */
export const WEBMCP_OAUTH_SCOPES = ["webmcp:read", "webmcp:write"] as const;

/** A scope value accepted by the WebMCP token endpoint. */
export type WebMcpOAuthScope = (typeof WEBMCP_OAUTH_SCOPES)[number];

/**
 * Reserved client id for the legacy shared `agentApiKey`. A request without a
 * `client_id` is also treated as legacy when a static key is configured.
 */
export const WEBMCP_LEGACY_CLIENT_ID = "webmcp-legacy";

/** Domain separator so client-secret HMACs cannot collide with API-key HMACs. */
const CLIENT_SECRET_HMAC_PREFIX = "webmcp-oauth-client:";

/** Domain separator for the legacy static-key constant-time comparison. */
const LEGACY_KEY_HMAC_PREFIX = "webmcp-legacy-agent-key:";

/**
 * Persisted OAuth client shape (secret hash only).
 *
 * `tenantId` is mandatory on the record (though it may be `null` in
 * single-tenant mode) so every issued token is bound to one tenant.
 */
export interface WebMcpOAuthClientRecord extends BaseEntity {
  allowedScopes: WebMcpOAuthScope[];
  clientId: string;
  disabled: boolean;
  name: string;
  secretHash: string;
  tenantId: DatabaseId | null;
}

/** Public (secret-free) client view returned by verification. */
export interface WebMcpOAuthClient {
  allowedScopes: WebMcpOAuthScope[];
  clientId: string;
  disabled: boolean;
  name: string;
  tenantId: DatabaseId | null;
}

/** Options for {@link createWebMcpOAuthClient}. */
export interface CreateWebMcpOAuthClientOptions {
  /** Scopes the client may request. Defaults to the full allowlist. */
  allowedScopes?: readonly string[];
  /** Issue the client disabled (defaults to `false`). */
  disabled?: boolean;
  /** Human-readable client label (shown on issued API keys). */
  name: string;
  /**
   * Tenant the client is bound to. Use `null` in single-tenant deployments so
   * the issued API key matches the `tenantId IS NULL` scope used by the API-key
   * authenticator; use the tenant id when multi-tenancy is enabled.
   */
  tenantId: DatabaseId | null;
}

/** One-time provisioning result — `clientSecret` is never retrievable again. */
export interface CreatedWebMcpOAuthClient {
  allowedScopes: WebMcpOAuthScope[];
  clientId: string;
  clientSecret: string;
  name: string;
  tenantId: DatabaseId | null;
}

function failure<T>(code: string, message: string): DatabaseResult<T> {
  return { success: false, message, error: { code, message } };
}

/** True when `value` is one of the fixed WebMCP scopes. */
export function isWebMcpOAuthScope(value: string): value is WebMcpOAuthScope {
  return (WEBMCP_OAUTH_SCOPES as readonly string[]).includes(value);
}

/** HMAC of a client secret (domain-separated, server secret from the auth stack). */
export function hashWebMcpClientSecret(secret: string): string {
  return hashApiKey(CLIENT_SECRET_HMAC_PREFIX + secret);
}

/** Constant-time comparison for two equal-length hex/base64 digests. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
}

/**
 * Constant-time comparison of a presented legacy `agentApiKey`.
 *
 * Both values are HMACed first so the comparison never touches the plaintext
 * and always runs over fixed-length buffers.
 */
export function legacyAgentApiKeyMatches(provided: string, configured: string): boolean {
  if (configured.length === 0) return false;
  return constantTimeEqual(
    hashApiKey(LEGACY_KEY_HMAC_PREFIX + provided),
    hashApiKey(LEGACY_KEY_HMAC_PREFIX + configured),
  );
}

/**
 * Synthetic API-key owner id for a client (also the revoke ownership marker).
 *
 * `auth_api_keys.userId` is `varchar(36)` on the SQL adapters. Provisioned client
 * ids are `wmc_` + 32 hex characters (exactly 36), so the client id doubles as
 * the owner id — the `wmc_` prefix keeps it distinguishable from user ids.
 */
export function webmcpTokenOwnerId(clientId: string): DatabaseId {
  return clientId as DatabaseId;
}

/** Human-readable API-key name for an issued client token. */
export function webmcpTokenName(clientId: string): string {
  return `WebMCP OAuth token (${clientId})`;
}

/** Normalize a scope array read back from the database. */
function normalizeScopes(value: unknown): WebMcpOAuthScope[] {
  if (!Array.isArray(value)) return [];
  const scopes: WebMcpOAuthScope[] = [];
  for (const scope of value) {
    if (typeof scope === "string" && isWebMcpOAuthScope(scope) && !scopes.includes(scope)) {
      scopes.push(scope);
    }
  }
  return scopes;
}

/** Map a persisted row to the secret-free client view. */
function toClient(row: WebMcpOAuthClientRecord): WebMcpOAuthClient | null {
  if (typeof row.clientId !== "string" || row.clientId.length === 0) return null;
  if (typeof row.secretHash !== "string" || row.secretHash.length === 0) return null;
  return {
    allowedScopes: normalizeScopes(row.allowedScopes),
    clientId: row.clientId,
    disabled: row.disabled === true,
    name: typeof row.name === "string" ? row.name : row.clientId,
    tenantId: row.tenantId ?? null,
  };
}

/**
 * Look up an OAuth client by id (disabled clients included — callers decide).
 *
 * Reads under the branded `"plugin"` system scope because the client id is
 * globally unique and the tenant is only known after the record is loaded.
 */
export async function getWebMcpOAuthClient(
  db: IDBAdapter,
  clientId: string,
): Promise<WebMcpOAuthClient | null> {
  const result = await db.crud.findOne<WebMcpOAuthClientRecord>(
    WEBMCP_OAUTH_CLIENT_COLLECTION,
    { clientId },
    withSystemScope("plugin"),
  );
  if (!result.success || !result.data) return null;
  return toClient(result.data);
}

/**
 * Verify client credentials. Returns `null` for an unknown or disabled client
 * and for a wrong secret — callers must fail closed with `invalid_client`.
 *
 * The provided secret is always hashed, even when the client is unknown, so the
 * response time does not trivially distinguish “no such client” from “bad secret”.
 */
export async function verifyWebMcpOAuthClient(
  db: IDBAdapter,
  clientId: string,
  clientSecret: string,
): Promise<WebMcpOAuthClient | null> {
  const providedHash = hashWebMcpClientSecret(clientSecret);
  const result = await db.crud.findOne<WebMcpOAuthClientRecord>(
    WEBMCP_OAUTH_CLIENT_COLLECTION,
    { clientId },
    withSystemScope("plugin"),
  );
  if (!result.success || !result.data) return null;

  const client = toClient(result.data);
  if (!client) return null;
  if (client.disabled) {
    logger.warn(`[WebMCP] OAuth client "${clientId}" is disabled`);
    return null;
  }
  return constantTimeEqual(providedHash, result.data.secretHash) ? client : null;
}

/**
 * Provision a new OAuth client.
 *
 * The plaintext `clientSecret` is returned **once** and is never persisted:
 * only its HMAC is written to the plugin-private collection.
 *
 * @example
 *   const created = await createWebMcpOAuthClient(db, {
 *     tenantId: "tenant-a",
 *     name: "CI agent",
 *     allowedScopes: ["webmcp:read"],
 *   });
 *   // created.data.clientId / created.data.clientSecret
 */
export async function createWebMcpOAuthClient(
  db: IDBAdapter,
  options: CreateWebMcpOAuthClientOptions,
): Promise<DatabaseResult<CreatedWebMcpOAuthClient>> {
  const name = options.name.trim();
  if (name.length === 0) {
    return failure("CLIENT_NAME_REQUIRED", "A client name is required");
  }

  const requestedScopes = options.allowedScopes ?? WEBMCP_OAUTH_SCOPES;
  const allowedScopes: WebMcpOAuthScope[] = [];
  for (const scope of requestedScopes) {
    if (!isWebMcpOAuthScope(scope)) {
      return failure("INVALID_SCOPE", `Unsupported WebMCP scope "${scope}"`);
    }
    if (!allowedScopes.includes(scope)) allowedScopes.push(scope);
  }
  if (allowedScopes.length === 0) {
    return failure("INVALID_SCOPE", "At least one WebMCP scope is required");
  }

  const clientId = generateClientId();
  const clientSecret = generateClientSecret();

  const inserted = await db.crud.insert<WebMcpOAuthClientRecord>(
    WEBMCP_OAUTH_CLIENT_COLLECTION,
    {
      allowedScopes,
      clientId,
      disabled: options.disabled ?? false,
      name,
      secretHash: hashWebMcpClientSecret(clientSecret),
      tenantId: options.tenantId,
    },
    withSystemScope("plugin"),
  );

  if (!inserted.success) {
    return failure(inserted.error.code, inserted.message);
  }

  return {
    success: true,
    data: { allowedScopes, clientId, clientSecret, name, tenantId: options.tenantId },
  };
}

/**
 * 128-bit client id prefixed with `wmc_` and exactly 36 characters long so it
 * can also be stored in `auth_api_keys.userId` (`varchar(36)`).
 */
function generateClientId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `wmc_${hex}`;
}

/** 256-bit base64url secret from the platform CSPRNG. */
function generateClientSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Read the legacy static `agentApiKey` for backward compatibility.
 *
 * Resolution order:
 * 1. Per-tenant plugin state (`pluginStates.settings.agentApiKey`), which is the
 *    runtime config the plugin lifecycle hooks receive.
 * 2. Per-tenant plugin settings (`plugin_settings.settings.agentApiKey`), which is
 *    where `/api/plugin-settings` writes admin-managed values.
 * 3. The code-declared default (`config.private.agentApiKey`).
 *
 * Returns an empty string when no static key is configured. Never throws — a
 * settings read failure simply disables the legacy path (tokens keep working).
 */
export async function getConfiguredStaticAgentApiKey(
  db: IDBAdapter,
  tenantId: DatabaseId | null,
): Promise<string> {
  // Single-tenant deployments have no request tenant. Plugin state is seeded
  // under "default" while `/api/plugin-settings` writes `String(null)` = "null",
  // so both keys are checked before falling back to the declared config.
  const tenantKeys = tenantId ? [String(tenantId)] : ["default", "null"];
  const service = new PluginSettingsService(db);

  for (const tenantKey of tenantKeys) {
    try {
      const state = await service.getPluginState(WEBMCP_PLUGIN_ID, tenantKey);
      const settings = state?.settings as Record<string, unknown> | undefined;
      const fromState = settings?.agentApiKey;
      if (typeof fromState === "string" && fromState.length > 0) return fromState;
    } catch (err) {
      logger.debug(
        `[WebMCP] Legacy agentApiKey state lookup failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const settings = await service.getDecryptedSettings(WEBMCP_PLUGIN_ID, tenantKey);
      const fromSettings = settings?.agentApiKey;
      if (typeof fromSettings === "string" && fromSettings.length > 0) return fromSettings;
    } catch (err) {
      logger.debug(
        `[WebMCP] Legacy agentApiKey settings lookup failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const declared = webmcpPlugin.config?.private?.agentApiKey;
  return typeof declared === "string" ? declared : "";
}
