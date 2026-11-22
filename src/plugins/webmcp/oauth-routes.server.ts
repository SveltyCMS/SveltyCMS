/**
 * @file src/plugins/webmcp/oauth-routes.server.ts
 * @description OAuth 2.1 client-credentials endpoints for the WebMCP gateway.
 *
 * `POST /api/webmcp/oauth/token` exchanges client credentials for a scoped,
 * expiring, revocable SveltyCMS API key (`sck_…`, authenticates through the
 * normal Bearer pipeline). `POST /api/webmcp/oauth/revoke` revokes a token owned
 * by the authenticated client (RFC 7009: unknown tokens still answer 200).
 *
 * Features:
 * - form-urlencoded and JSON request bodies
 * - license gate first (403 when the WebMCP plugin license is inactive)
 * - constant-time client-secret verification against stored HMACs
 * - scope allowlist (`webmcp:read`, `webmcp:write`) and 60–3600 s TTL clamp
 * - `Cache-Control: no-store` on every response, token never echoed
 * - legacy static `agentApiKey` exchange (client id absent or `webmcp-legacy`)
 *
 * ### Security:
 * - Server-only module (`*.server.ts`), registered as a plugin `public` route.
 * - Only the issued `access_token` is returned on success; both endpoints are
 *   client-authenticated, and revoke is bound to the client id **and** tenant.
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { ApiKey, DatabaseId, IDBAdapter } from "@databases/db-interface";
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from "@src/databases/auth/api-keys";
import { invalidateApiKeyAuth } from "@src/databases/auth/credential-auth-cache";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { nowISODateString, toISOString } from "@utils/date";
import { logger } from "@utils/logger";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import {
  WEBMCP_LEGACY_CLIENT_ID,
  WEBMCP_OAUTH_SCOPES,
  WEBMCP_PLUGIN_ID,
  type WebMcpOAuthClient,
  type WebMcpOAuthScope,
  getConfiguredStaticAgentApiKey,
  isWebMcpOAuthScope,
  legacyAgentApiKeyMatches,
  verifyWebMcpOAuthClient,
  webmcpTokenName,
  webmcpTokenOwnerId,
} from "./oauth-clients.server";

/** Default access-token lifetime when `expires_in` is absent or malformed. */
const DEFAULT_TOKEN_TTL_SECONDS = 900;

/** Lower clamp bound for `expires_in`. */
const MIN_TOKEN_TTL_SECONDS = 60;

/** Upper clamp bound for `expires_in`. */
const MAX_TOKEN_TTL_SECONDS = 3600;

/** Defensive bound for attacker-supplied credentials in the request body. */
const MAX_CREDENTIAL_LENGTH = 512;

/** A base64url SHA-256 digest (43 characters, unpadded). */
const API_KEY_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  pragma: "no-cache",
} as const;

type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_scope"
  | "unsupported_grant_type"
  | "access_denied"
  | "server_error";

type OAuthBody = Record<string, string>;

interface TokenSuccessBody {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
}

interface ResolvedTokenClient {
  allowedScopes: WebMcpOAuthScope[];
  clientId: string;
  tenantId: DatabaseId | null;
}

/** JSON response carrying the mandatory no-store headers. */
function oauthJson(body: TokenSuccessBody | Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

/** OAuth 2.1 error envelope (RFC 6749 §5.2). */
function oauthError(code: OAuthErrorCode, description: string, status: number): Response {
  return oauthJson({ error: code, error_description: description }, status);
}

/** 200 with an empty body — RFC 7009 says nothing about token existence. */
function noContentOk(): Response {
  return new Response(null, { status: 200, headers: NO_STORE_HEADERS });
}

/** Read a form-urlencoded or JSON body into a flat string map. */
async function readOAuthBody(request: Request): Promise<OAuthBody | null> {
  const contentType =
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (contentType === "application/x-www-form-urlencoded") {
    const form = await request.formData();
    const body: OAuthBody = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") body[key] = value;
    }
    return body;
  }

  if (contentType === "application/json") {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const body: OAuthBody = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") body[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) body[key] = String(value);
    }
    return body;
  }

  return null;
}

/** Request-scoped tenant (null in single-tenant mode / unscoped requests). */
function resolveRequestTenant(event: RequestEvent): DatabaseId | null {
  const tenantId = event.locals.tenantId;
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : null;
}

/** Request-scoped adapter, falling back to the process adapter in direct calls. */
async function resolveDb(event: RequestEvent): Promise<IDBAdapter | null> {
  const local = event.locals.dbAdapter;
  if (local) return local;
  const { getDb } = await import("@src/databases/db");
  return getDb();
}

/** Clamp `expires_in` to the 60–3600 s window (default 900). */
export function clampTokenTtlSeconds(raw: string | undefined): number {
  const text = raw?.trim() ?? "";
  if (!/^\d+$/.test(text)) return DEFAULT_TOKEN_TTL_SECONDS;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TOKEN_TTL_SECONDS;
  return Math.min(MAX_TOKEN_TTL_SECONDS, Math.max(MIN_TOKEN_TTL_SECONDS, parsed));
}

/**
 * Resolve the scope set to grant.
 *
 * Omitting `scope` grants the client's full allowlist (OAuth default-scope
 * behaviour). Any requested value outside the client's allowlist is rejected
 * outright rather than silently narrowed.
 */
export function resolveTokenScopes(
  rawScope: string | undefined,
  allowedScopes: readonly WebMcpOAuthScope[],
): WebMcpOAuthScope[] | null {
  const requested = (rawScope ?? "").split(/\s+/).filter(Boolean);
  if (requested.length === 0) {
    return allowedScopes.length > 0 ? [...allowedScopes] : null;
  }

  const allowed = new Set(allowedScopes);
  const scopes: WebMcpOAuthScope[] = [];
  for (const scope of requested) {
    if (!isWebMcpOAuthScope(scope) || !allowed.has(scope)) return null;
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  return scopes;
}

/**
 * Authenticate the client from the request body.
 *
 * Legacy path: `client_id` absent or `webmcp-legacy` exchanges the configured
 * static `agentApiKey` (still supported, tokens are preferred). The legacy
 * client is bound to the request tenant.
 */
async function resolveTokenClient(
  db: IDBAdapter,
  event: RequestEvent,
  clientId: string,
  clientSecret: string,
): Promise<ResolvedTokenClient | null> {
  if (clientId.length === 0 || clientId === WEBMCP_LEGACY_CLIENT_ID) {
    const tenantId = resolveRequestTenant(event);
    if (!tenantId && isMultiTenantEnabled()) return null;
    const staticKey = await getConfiguredStaticAgentApiKey(db, tenantId);
    if (!legacyAgentApiKeyMatches(clientSecret, staticKey)) return null;
    return {
      allowedScopes: [...WEBMCP_OAUTH_SCOPES],
      clientId: WEBMCP_LEGACY_CLIENT_ID,
      tenantId,
    };
  }

  const client: WebMcpOAuthClient | null = await verifyWebMcpOAuthClient(
    db,
    clientId,
    clientSecret,
  );
  if (!client) return null;

  return {
    allowedScopes:
      client.allowedScopes.length > 0 ? client.allowedScopes : [...WEBMCP_OAUTH_SCOPES],
    clientId: client.clientId,
    tenantId: client.tenantId,
  };
}

/**
 * Mint a scoped API key for an authenticated client.
 *
 * The token is a normal `sck_…` API key, so the existing Bearer pipeline,
 * tenant binding, expiry check, revocation flag, and API-key auth cache all
 * apply without changes.
 */
async function issueAccessToken(
  db: IDBAdapter,
  client: ResolvedTokenClient,
  scopes: WebMcpOAuthScope[],
  expiresInSeconds: number,
): Promise<{ success: true; accessToken: string } | { success: false; message: string }> {
  const { full, prefix, hash } = generateApiKey();
  const created = await db.auth.createApiKey(
    {
      name: webmcpTokenName(client.clientId),
      hash,
      prefix,
      userId: webmcpTokenOwnerId(client.clientId),
      permissions: [],
      scopes,
      expiresAt: toISOString(Date.now() + expiresInSeconds * 1000),
      tenantId: client.tenantId,
      revoked: false,
      usageCount: 0,
      createdAt: nowISODateString(),
    },
    { tenantId: client.tenantId },
  );

  if (!created.success || !created.data) {
    return { success: false, message: created.success ? "Token creation failed" : created.message };
  }
  return { success: true, accessToken: full };
}

/** True when `apiKey` was issued by exactly this client in the same tenant. */
function isClientOwnedToken(apiKey: ApiKey, client: ResolvedTokenClient): boolean {
  if (String(apiKey.userId ?? "") !== webmcpTokenOwnerId(client.clientId)) return false;
  return String(apiKey.tenantId ?? "") === String(client.tenantId ?? "");
}

/**
 * `POST /api/webmcp/oauth/token`
 *
 * Params: `grant_type=client_credentials`, `client_id`, `client_secret`,
 * optional `scope`, optional `expires_in`.
 */
export async function handleWebMcpTokenRequest(event: RequestEvent): Promise<Response> {
  const license = await checkExtensionLicense("plugin", WEBMCP_PLUGIN_ID);
  if (!license.active) {
    return oauthError("access_denied", "An active WebMCP license is required to issue tokens", 403);
  }

  let body: OAuthBody | null;
  try {
    body = await readOAuthBody(event.request);
  } catch (err) {
    logger.debug(
      `[WebMCP] Malformed token request body: ${err instanceof Error ? err.message : String(err)}`,
    );
    return oauthError("invalid_request", "Malformed request body", 400);
  }
  if (!body) {
    return oauthError(
      "invalid_request",
      "Expected application/x-www-form-urlencoded or application/json",
      400,
    );
  }

  if (body.grant_type !== "client_credentials") {
    return oauthError(
      "unsupported_grant_type",
      'Only the "client_credentials" grant type is supported',
      400,
    );
  }

  const clientId = body.client_id?.trim() ?? "";
  const clientSecret = body.client_secret ?? "";
  if (
    clientSecret.length === 0 ||
    clientSecret.length > MAX_CREDENTIAL_LENGTH ||
    clientId.length > MAX_CREDENTIAL_LENGTH
  ) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }

  const db = await resolveDb(event);
  if (!db) return oauthError("server_error", "Database unavailable", 503);

  let client: ResolvedTokenClient | null;
  try {
    client = await resolveTokenClient(db, event, clientId, clientSecret);
  } catch (err) {
    logger.error("[WebMCP] Token client verification failed", { error: err });
    return oauthError("server_error", "Token issuance unavailable", 503);
  }
  if (!client) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }

  const scopes = resolveTokenScopes(body.scope, client.allowedScopes);
  if (!scopes) {
    return oauthError("invalid_scope", "Requested scope is not allowed for this client", 400);
  }

  const expiresInSeconds = clampTokenTtlSeconds(body.expires_in);

  let issued: Awaited<ReturnType<typeof issueAccessToken>>;
  try {
    issued = await issueAccessToken(db, client, scopes, expiresInSeconds);
  } catch (err) {
    logger.error("[WebMCP] Token issuance failed", { error: err });
    return oauthError("server_error", "Token issuance unavailable", 503);
  }
  if (!issued.success) {
    logger.error(`[WebMCP] Token creation rejected: ${issued.message}`);
    return oauthError("server_error", "Token issuance failed", 503);
  }

  logger.info(
    `[WebMCP] Issued ${expiresInSeconds}s token for client "${client.clientId}" (scopes: ${scopes.join(" ")})`,
  );

  return oauthJson(
    {
      access_token: issued.accessToken,
      expires_in: expiresInSeconds,
      scope: scopes.join(" "),
      token_type: "Bearer",
    },
    200,
  );
}

/**
 * `POST /api/webmcp/oauth/revoke`
 *
 * Params: `client_id`, `client_secret`, and either `token` or `token_hash`.
 * Only tokens owned by the authenticated client in its tenant are revoked.
 */
export async function handleWebMcpRevokeRequest(event: RequestEvent): Promise<Response> {
  const license = await checkExtensionLicense("plugin", WEBMCP_PLUGIN_ID);
  if (!license.active) {
    return oauthError(
      "access_denied",
      "An active WebMCP license is required to revoke tokens",
      403,
    );
  }

  let body: OAuthBody | null;
  try {
    body = await readOAuthBody(event.request);
  } catch (err) {
    logger.debug(
      `[WebMCP] Malformed revoke request body: ${err instanceof Error ? err.message : String(err)}`,
    );
    return oauthError("invalid_request", "Malformed request body", 400);
  }
  if (!body) {
    return oauthError(
      "invalid_request",
      "Expected application/x-www-form-urlencoded or application/json",
      400,
    );
  }

  const clientId = body.client_id?.trim() ?? "";
  const clientSecret = body.client_secret ?? "";
  if (
    clientSecret.length === 0 ||
    clientSecret.length > MAX_CREDENTIAL_LENGTH ||
    clientId.length > MAX_CREDENTIAL_LENGTH
  ) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }

  const db = await resolveDb(event);
  if (!db) return oauthError("server_error", "Database unavailable", 503);

  let client: ResolvedTokenClient | null;
  try {
    client = await resolveTokenClient(db, event, clientId, clientSecret);
  } catch (err) {
    logger.error("[WebMCP] Revoke client verification failed", { error: err });
    return oauthError("server_error", "Revocation unavailable", 503);
  }
  if (!client) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }

  // RFC 7009: an unsupported/unknown token is not an error. Resolve the hash
  // only when the presented value has a valid shape, then revoke if (and only
  // if) the row is owned by this client in this tenant.
  const rawToken = body.token?.trim() ?? "";
  const rawHash = body.token_hash?.trim() ?? "";
  let tokenHash = "";
  if (rawToken.length > 0 && isValidApiKeyFormat(rawToken)) {
    tokenHash = hashApiKey(rawToken);
  } else if (API_KEY_HASH_PATTERN.test(rawHash)) {
    tokenHash = rawHash;
  }

  if (tokenHash.length === 0) return noContentOk();

  try {
    const lookup = await db.auth.getApiKey(tokenHash, { tenantId: client.tenantId });
    const apiKey = lookup.success ? lookup.data : null;
    if (!apiKey || !isClientOwnedToken(apiKey, client)) {
      // Unknown, already revoked, or another client's token — indistinguishable.
      return noContentOk();
    }

    const revoked = await db.auth.revokeApiKey(apiKey._id, { tenantId: client.tenantId });
    if (!revoked.success) {
      logger.warn(`[WebMCP] Revoke failed for token ${String(apiKey._id)}: ${revoked.message}`);
      return noContentOk();
    }
    await invalidateApiKeyAuth(String(apiKey._id), client.tenantId, tokenHash);
    logger.info(`[WebMCP] Revoked token ${String(apiKey._id)} for client "${client.clientId}"`);
  } catch (err) {
    logger.error("[WebMCP] Token revocation failed", { error: err });
    return oauthError("server_error", "Revocation unavailable", 503);
  }

  return noContentOk();
}
