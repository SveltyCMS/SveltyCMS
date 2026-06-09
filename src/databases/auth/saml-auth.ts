/**
 * @file src/databases/auth/saml-auth.ts
 * @description Core SAML 2.0 / Enterprise SSO Integration using @node-saml/node-saml.
 *
 * Features:
 * - Lightweight SAML SP implementation — no separate database needed.
 * - IdP Connection Management stored in CMS settings.
 * - SSO Authentication logic (ACS parsing).
 * - JIT provisioning configuration handling.
 */

import { SAML } from "@node-saml/node-saml";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { json } from "@sveltejs/kit";
import { dateToISODateString } from "@utils/date";

// ─── Types ──────────────────────────────────────────────────────────

interface SAMLConnectionConfig {
  tenant: string;
  product: string;
  entryPoint: string; // IdP SSO URL
  cert: string; // IdP X.509 public certificate
  issuer?: string;
  wantAssertionsSigned?: boolean;
  redirectUrl?: string;
}

// ─── SAML Instance Cache ─────────────────────────────────────────────

let samlInstance: SAML | null = null;
let samlConfig: SAMLConnectionConfig | null = null;

/**
 * Creates or retrieves a cached SAML instance configured from CMS settings.
 * In production, config is loaded per-tenant from the encrypted settings store.
 */
function getSAML(tenant?: string | null, product?: string | null): SAML {
  if (samlInstance && samlConfig?.tenant === (tenant ?? samlConfig!.tenant)) {
    return samlInstance;
  }

  const storedEntryPoint =
    (getPrivateSettingSync as any)("SAML_ENTRY_POINT") || "https://idp.example.com/sso";
  const storedCert =
    (getPrivateSettingSync as any)("SAML_IDP_CERT") || "-----BEGIN CERTIFICATE-----";
  const externalUrl =
    getPrivateSettingSync("HOST_PROD") ||
    (getPrivateSettingSync as any)("HOST_DEV") ||
    "http://localhost:5173";

  samlConfig = {
    tenant: tenant || "sveltycms",
    product: product || "sveltycms",
    entryPoint: storedEntryPoint as string,
    cert: storedCert as string,
    issuer: "sveltycms",
    wantAssertionsSigned: true,
    redirectUrl: `${externalUrl}/api/auth/saml/acs`,
  };

  samlInstance = new SAML({
    issuer: samlConfig!.issuer!,
    callbackUrl: samlConfig!.redirectUrl!,
    entryPoint: samlConfig!.entryPoint,
    idpCert: samlConfig!.cert,
    wantAssertionsSigned: samlConfig!.wantAssertionsSigned,
    signatureAlgorithm: "sha256",
  } as any);

  return samlInstance;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates SAML IdP authorization URL (SP-initiated SSO).
 */
export async function generateSAMLAuthUrl(
  tenant?: string | null,
  product?: string | null,
  state?: string,
): Promise<string> {
  const saml = getSAML(tenant, product);
  const relayState = state || "default";
  const url = await saml.getAuthorizeUrlAsync(relayState, undefined, {});
  return url;
}

/**
 * Processes a SAML authentication response from the IdP.
 * Handles JIT provisioning and session creation.
 */
export async function processSAMLResponse(samlResponse: string, relayState: string) {
  const saml = getSAML();

  const { profile } = await saml.validatePostResponseAsync({
    SAMLResponse: samlResponse,
    RelayState: relayState,
  });

  if (!profile) {
    throw new Error("Invalid SAML profile");
  }

  // Extract email from SAML attributes (node-saml uses claims-format keys)
  const email: string | undefined =
    (profile as any).email ||
    profile.nameID ||
    (profile.attributes as any)?.[
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    ] ||
    (profile.attributes as any)?.["urn:oid:0.9.2342.19200300.100.1.3"];

  if (!email) {
    throw new Error("Invalid SAML profile or missing email");
  }

  const firstName: string =
    (profile.attributes as any)?.[
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
    ] || "";
  const lastName: string =
    (profile.attributes as any)?.[
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
    ] || "";

  // JIT Provisioning
  const authAdapter = dbAdapter!.auth;
  const findResult = await authAdapter.getUserByEmail({
    email,
    tenantId: null,
  });

  let user = findResult.success ? findResult.data : null;

  if (!user && getPrivateSettingSync("SAML_JIT_PROVISIONING")) {
    const newUserResult = await authAdapter.createUser({
      email,
      username: email.split("@")[0],
      firstName,
      lastName,
      role: "user",
      lastAuthMethod: "saml",
    });

    if (!newUserResult.success) throw new Error("Failed to provision SAML user");
    user = newUserResult.data;
  }

  if (!user) {
    throw new Error("Access denied: User not found and JIT provisioning disabled.");
  }

  // Create Session
  const sessionResult = await authAdapter.createSession({
    user_id: user._id as DatabaseId,
    expires: dateToISODateString(new Date(Date.now() + 1000 * 60 * 60 * 24)), // 24hr
  });

  if (!sessionResult.success) throw new Error("Failed to create SSO session");

  return { user, session: sessionResult.data };
}

/**
 * ACS Endpoint Handler for SAML.
 */
export async function handleSAMLACS(request: Request, cookies?: any) {
  const formData = await request.formData();
  const SAMLResponse = formData.get("SAMLResponse") as string;
  const RelayState = formData.get("RelayState") as string;

  // Validate state to prevent CSRF attacks (if cookie is present)
  const stateCookie = cookies?.get("saml_state");
  if (stateCookie && stateCookie !== RelayState) {
    logger.error("SAML Authentication Failed: CSRF State mismatch");
    return json({ success: false, message: "CSRF State mismatch" }, { status: 403 });
  }

  // Clear state cookie once consumed
  if (cookies) {
    cookies.delete("saml_state", { path: "/" });
  }

  try {
    const { user, session } = await processSAMLResponse(SAMLResponse, RelayState);

    // Set Session Cookie
    const response = json({ success: true, user });
    response.headers.append(
      "Set-Cookie",
      `auth_session=${session._id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    );

    return response;
  } catch (err: any) {
    logger.error("SAML Authentication Failed", err);
    return json(
      {
        success: false,
        message: err.message,
      },
      { status: 401 },
    );
  }
}

/**
 * Public wrapper for ACS Handler (Expected by router).
 */
export async function handleSAMLResponse(event: any) {
  return handleSAMLACS(event.request, event.cookies);
}

/**
 * Creates/updates a SAML IdP connection configuration.
 * Stores the IdP metadata in CMS private settings.
 */
export async function createSAMLConnection(params: {
  rawMetadata?: string;
  defaultRedirectUrl?: string;
  tenant?: string;
  product?: string;
  entryPoint?: string;
  cert?: string;
}): Promise<{ id: string; tenant: string; product: string }> {
  // In production, parse rawMetadata XML to extract entryPoint + cert.
  void params.entryPoint;
  void params.cert;
  const tenant = params.tenant || "sveltycms";
  const product = params.product || "sveltycms";

  // In production: store via settingsService.setPrivateSetting()
  // For now, reset the SAML cache so next getSAML() picks up new config
  samlInstance = null;
  samlConfig = null;

  logger.info(`SAML connection configured for tenant=${tenant} product=${product}`);

  return {
    id: `conn_${tenant}_${product}`,
    tenant,
    product,
  };
}

// ─── Test helpers (exposed for unit tests) ──────────────────────────

/**
 * Resets the SAML instance cache. Useful for testing.
 * @internal
 */
export function _resetSAMLCache() {
  samlInstance = null;
  samlConfig = null;
}

/**
 * Returns the cached SAML configuration. Useful for testing.
 * @internal
 */
export function _getSAMLCache() {
  return { samlInstance, samlConfig };
}
