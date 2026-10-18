/**
 * @file src/databases/auth/saml-auth.ts
 * @description Core SAML 2.0 / Enterprise SSO Integration using @node-saml/node-saml.
 *
 * Features:
 * - Lightweight SAML SP implementation — no separate database needed.
 * - IdP Connection Management stored in CMS settings (explicit fields or raw metadata XML).
 * - SSO Authentication logic (ACS parsing) with cookie-bound InResponseTo validation.
 * - JIT provisioning configuration handling.
 */

import { SAML } from "@node-saml/node-saml";
import type { Document as XmlDomDocument, Element as XmlDomElement } from "@xmldom/xmldom";
import { DOMParser } from "@xmldom/xmldom";
import { X509Certificate } from "node:crypto";
import { getPrivateSettingSync, setPrivateSetting } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { raise, rethrow } from "@utils/error-handling";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { json } from "@sveltejs/kit";
import { dateToISODateString } from "@utils/date";
import { getSessionCookieName, isSecureCookieContext } from "./constants";

// ─── Types ──────────────────────────────────────────────────────────

interface SAMLConnectionConfig {
  tenant: string;
  product: string;
  entryPoint: string; // IdP SSO URL
  cert: string; // IdP X.509 public certificate
  issuer?: string;
  audience?: string;
  wantAssertionsSigned?: boolean;
  redirectUrl?: string;
}

/** Result of SP-initiated SSO URL generation — the ID is bound to the ACS cookie. */
export interface SAMLAuthUrl {
  url: string;
  requestId: string;
}

/** Values extracted from an IdP `EntityDescriptor`/`IDPSSODescriptor` document. */
export interface ParsedSAMLMetadata {
  entryPoint: string;
  cert: string;
  issuer?: string;
  audience?: string;
}

const SAML_BINDING_REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const SAML_BINDING_POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
const MAX_METADATA_LENGTH = 512 * 1024;

// ─── SAML Instance Cache ─────────────────────────────────────────────

/** Per tenant+product SAML instances — tenants must never share an IdP. */
const samlCache = new Map<string, { saml: SAML; config: SAMLConnectionConfig }>();

function samlCacheKey(tenant?: string | null, product?: string | null): string {
  return `${tenant ?? "sveltycms"}:${product ?? "sveltycms"}`;
}

/** Reads a private setting for the tenant (undefined = global). */
function readPrivateSetting(key: string, tenant?: string | null): string | undefined {
  return (getPrivateSettingSync as any)(key, tenant ?? undefined) as string | undefined;
}

/** Reads the tenant's IdP configuration from private settings. */
function getSAMLConfig(tenant?: string | null, product?: string | null): SAMLConnectionConfig {
  const storedEntryPoint =
    readPrivateSetting("SAML_ENTRY_POINT", tenant) || "https://idp.example.com/sso";
  const storedCert = readPrivateSetting("SAML_IDP_CERT", tenant) || "-----BEGIN CERTIFICATE-----";
  const externalUrl =
    getPrivateSettingSync("HOST_PROD") ||
    (getPrivateSettingSync as any)("HOST_DEV") ||
    "http://localhost:5173";

  const configuredIssuer =
    readPrivateSetting("SAML_ISSUER", tenant) || readPrivateSetting("SAML_SP_ENTITY_ID", tenant);
  const configuredAudience =
    readPrivateSetting("SAML_AUDIENCE", tenant) || readPrivateSetting("SAML_SP_ENTITY_ID", tenant);

  return {
    tenant: tenant || "sveltycms",
    product: product || "sveltycms",
    entryPoint: storedEntryPoint,
    cert: storedCert,
    issuer: configuredIssuer || "sveltycms",
    audience: configuredAudience,
    wantAssertionsSigned: true,
    redirectUrl: `${externalUrl}/api/auth/saml/acs`,
  };
}

/**
 * Builds the node-saml constructor options.
 *
 * `generateUniqueId` is a supported node-saml option that lets the caller pin
 * the AuthnRequest ID. node-saml 5.1.0's `getAuthorizeUrlAsync` and
 * `getAuthorizeMessageAsync` do not return the generated ID, so this hook is
 * the only supported way to learn it for cookie-bound InResponseTo checks.
 */
function buildSAMLOptions(
  config: SAMLConnectionConfig,
  generateUniqueId?: () => string,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    issuer: config.issuer,
    callbackUrl: config.redirectUrl,
    entryPoint: config.entryPoint,
    idpCert: config.cert,
    wantAssertionsSigned: config.wantAssertionsSigned,
    signatureAlgorithm: "sha256",
  };
  // Only send an audience when explicitly configured — existing deployments
  // rely on node-saml's default behaviour.
  if (config.audience) options.audience = config.audience;
  if (generateUniqueId) options.generateUniqueId = generateUniqueId;
  return options;
}

/**
 * Creates or retrieves a cached SAML instance configured from CMS settings.
 * Cache is keyed by tenant+product so two tenants never share an IdP.
 */
function getSAML(tenant?: string | null, product?: string | null): SAML {
  const key = samlCacheKey(tenant, product);
  const cached = samlCache.get(key);
  if (cached) return cached.saml;

  const config = getSAMLConfig(tenant, product);
  const saml = new SAML(buildSAMLOptions(config) as any);
  samlCache.set(key, { saml, config });
  return saml;
}

// ─── XML helpers ─────────────────────────────────────────────────────

function localName(node: XmlDomDocument | XmlDomElement): string {
  return (node as XmlDomElement).localName || node.nodeName.split(":").pop() || "";
}

/** Returns every descendant element whose local name matches (namespace-agnostic). */
function findElements(root: XmlDomDocument | XmlDomElement, name: string): XmlDomElement[] {
  const nodes = (root as XmlDomDocument).getElementsByTagName("*");
  const matches: XmlDomElement[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes.item(index);
    if (node && localName(node) === name) matches.push(node);
  }
  return matches;
}

/**
 * Parses XML while refusing DTD/entity declarations (XXE / entity-expansion)
 * and reporting well-formedness errors as a 400 instead of logging them.
 */
function parseXmlDocument(xml: string, label: string): XmlDomDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    raise(400, `${label} must not contain DOCTYPE or ENTITY declarations`, "SAML_XML_UNSAFE");
  }

  let parseError: string | null = null;
  let document: XmlDomDocument;
  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning" && parseError === null) parseError = message;
      },
    }).parseFromString(xml, "text/xml");
  } catch (err) {
    rethrow(err);
    logger.debug(`Failed to parse ${label}`, err);
    raise(400, `${label} is not well-formed XML`, "SAML_XML_INVALID");
  }

  if (parseError || !document.documentElement) {
    logger.debug(`Invalid ${label}: ${parseError ?? "missing document element"}`);
    raise(400, `${label} is not well-formed XML`, "SAML_XML_INVALID");
  }
  return document;
}

/** Re-wraps base64 certificate material as a canonical PEM block. */
function normalizeCertificatePem(raw: string): string {
  const compact = raw
    .replace(/-----BEGIN CERTIFICATE-----/gi, "")
    .replace(/-----END CERTIFICATE-----/gi, "")
    .replace(/\s+/g, "");

  // Some IdPs omit base64 padding in metadata — restore it before validating.
  const base64 = compact.padEnd(compact.length + ((4 - (compact.length % 4)) % 4), "=");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    raise(400, "SAML IdP certificate is not valid base64", "SAML_CERT_INVALID");
  }

  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

/** Validates the IdP signing certificate with node:crypto's X509 parser. */
function assertCertificateValid(pem: string): void {
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch (err) {
    rethrow(err);
    logger.debug("SAML IdP certificate could not be parsed", err);
    raise(400, "SAML IdP certificate is not a valid X.509 certificate", "SAML_CERT_INVALID");
  }

  const expiresAt = certificate.validToDate;
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
    raise(400, "SAML IdP certificate has expired", "SAML_CERT_EXPIRED");
  }
}

function assertEntryPoint(entryPoint: string): void {
  let protocol: string;
  try {
    protocol = new URL(entryPoint).protocol;
  } catch (err) {
    rethrow(err);
    raise(400, "SAML metadata has an invalid SingleSignOnService URL", "SAML_METADATA_INVALID");
  }
  if (protocol !== "http:" && protocol !== "https:") {
    raise(400, "SAML metadata SingleSignOnService must use HTTP(S)", "SAML_METADATA_INVALID");
  }
}

/**
 * Extracts the IdP SSO endpoint, signing certificate, entity ID, and optional
 * audience from an IdP metadata document.
 */
export function parseIdPMetadata(rawMetadata: string): ParsedSAMLMetadata {
  if (!rawMetadata || typeof rawMetadata !== "string" || !rawMetadata.trim()) {
    raise(400, "SAML metadata is empty", "SAML_METADATA_INVALID");
  }
  if (rawMetadata.length > MAX_METADATA_LENGTH) {
    raise(400, "SAML metadata is too large", "SAML_METADATA_INVALID");
  }

  const document = parseXmlDocument(rawMetadata, "SAML metadata");
  const root = document.documentElement;
  if (!root) raise(400, "SAML metadata has no document element", "SAML_METADATA_INVALID");

  const descriptors: XmlDomElement[] = [];
  if (localName(root) === "EntityDescriptor") descriptors.push(root);
  for (const descriptor of findElements(document, "EntityDescriptor")) {
    if (!descriptors.includes(descriptor)) descriptors.push(descriptor);
  }

  let entityDescriptor: XmlDomElement | null = null;
  let idpDescriptor: XmlDomElement | null = null;
  for (const descriptor of descriptors) {
    const candidate = findElements(descriptor, "IDPSSODescriptor")[0];
    if (candidate) {
      entityDescriptor = descriptor;
      idpDescriptor = candidate;
      break;
    }
  }

  if (!entityDescriptor || !idpDescriptor) {
    raise(400, "SAML metadata does not contain an IDPSSODescriptor", "SAML_METADATA_INVALID");
  }

  const ssoServices = findElements(idpDescriptor, "SingleSignOnService");
  const locationFor = (binding: string): string =>
    ssoServices
      .find((service) => service.getAttribute("Binding") === binding)
      ?.getAttribute("Location")
      ?.trim() ?? "";

  const entryPoint = locationFor(SAML_BINDING_REDIRECT) || locationFor(SAML_BINDING_POST);
  if (!entryPoint) {
    raise(
      400,
      "SAML metadata has no SingleSignOnService with HTTP-Redirect or HTTP-POST binding",
      "SAML_METADATA_INVALID",
    );
  }
  assertEntryPoint(entryPoint);

  const keyDescriptors = findElements(idpDescriptor, "KeyDescriptor");
  const signingKeys = keyDescriptors.filter(
    (descriptor) => (descriptor.getAttribute("use") || "signing") === "signing",
  );
  const keyCandidates = signingKeys.length > 0 ? signingKeys : keyDescriptors;

  let rawCertificate = "";
  for (const keyDescriptor of keyCandidates) {
    const value = findElements(keyDescriptor, "X509Certificate")[0]?.textContent?.trim();
    if (value) {
      rawCertificate = value;
      break;
    }
  }
  if (!rawCertificate) {
    raise(400, "SAML metadata has no IdP signing certificate", "SAML_CERT_INVALID");
  }

  const cert = normalizeCertificatePem(rawCertificate);
  assertCertificateValid(cert);

  const issuer = entityDescriptor.getAttribute("entityID")?.trim() || undefined;
  const audience =
    findElements(document, "Audience")
      .map((element) => element.textContent?.trim())
      .find((value): value is string => Boolean(value)) || undefined;

  return { entryPoint, cert, issuer, audience };
}

/**
 * Reads the `InResponseTo` attribute from a base64-encoded SAMLResponse.
 * node-saml 5.1.0's `validatePostResponseAsync` does not accept a caller
 * supplied request ID, so the ACS handler performs this stateless check
 * against the `saml_request_id` cookie before delegating signature validation.
 */
function extractInResponseTo(samlResponse: string): string | null {
  if (!samlResponse) return null;
  const xml = Buffer.from(samlResponse, "base64").toString("utf8");
  if (!xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;

  let parseError: string | null = null;
  let document: XmlDomDocument;
  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning" && parseError === null) parseError = message;
      },
    }).parseFromString(xml, "text/xml");
  } catch (err) {
    rethrow(err);
    logger.debug("SAMLResponse XML could not be parsed", err);
    return null;
  }

  if (parseError) return null;
  const root = document.documentElement;
  if (!root || localName(root) !== "Response") return null;
  return root.getAttribute("InResponseTo")?.trim() || null;
}

function assertInResponseTo(samlResponse: string, requestId: string): void {
  const inResponseTo = extractInResponseTo(samlResponse);
  if (!inResponseTo || inResponseTo !== requestId) {
    logger.error("SAML Authentication Failed: InResponseTo request ID mismatch");
    raise(403, "SAML InResponseTo mismatch", "SAML_IN_RESPONSE_TO_MISMATCH");
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates the SAML IdP authorization URL (SP-initiated SSO) and the
 * AuthnRequest ID that must be bound to the ACS callback.
 */
export async function generateSAMLAuthUrl(
  tenant?: string | null,
  product?: string | null,
  state?: string,
): Promise<SAMLAuthUrl> {
  const config = getSAMLConfig(tenant, product);
  const requestId = globalThis.crypto.randomUUID();

  // node-saml 5.1.0 does not return the ID it generates from
  // getAuthorizeUrlAsync/getAuthorizeMessageAsync. Pinning it through the
  // supported `generateUniqueId` constructor option keeps the URL and cookie
  // in sync without inventing an unsupported property.
  const saml = new SAML(buildSAMLOptions(config, () => requestId) as any);
  const relayState = state || "default";
  const url = await saml.getAuthorizeUrlAsync(relayState, undefined, {});
  return { url, requestId };
}

/**
 * Processes a SAML authentication response from the IdP.
 * Handles JIT provisioning and session creation.
 */
export async function processSAMLResponse(
  samlResponse: string,
  relayState: string,
  tenantId?: string | null,
  requestId?: string,
) {
  // Defence in depth for direct callers — the ACS route already returns a 403
  // before reaching this function when the cookie does not match.
  if (requestId) assertInResponseTo(samlResponse, requestId);

  const saml = getSAML(tenantId);

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

  // JIT Provisioning — bind every lookup/write to the tenant that initiated
  // the flow. `tenantId: null` is only used when no tenant is known at all.
  const authAdapter = dbAdapter!.auth;
  const scopedTenant = tenantId ? (tenantId as DatabaseId) : null;
  const findResult = await authAdapter.getUserByEmail({
    email,
    tenantId: scopedTenant,
  });

  let user = findResult.success ? findResult.data : null;

  if (!user && getPrivateSettingSync("SAML_JIT_PROVISIONING", tenantId ?? undefined)) {
    const newUserResult = await authAdapter.createUser({
      email,
      username: email.split("@")[0],
      firstName,
      lastName,
      role: "user",
      lastAuthMethod: "saml",
      ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
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
    ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
  });

  if (!sessionResult.success) throw new Error("Failed to create SSO session");

  return { user, session: sessionResult.data };
}

/**
 * ACS Endpoint Handler for SAML.
 */
export async function handleSAMLACS(request: Request, cookies?: any, tenantId?: string | null) {
  const formData = await request.formData();
  const rawSAMLResponse = formData.get("SAMLResponse");
  const rawRelayState = formData.get("RelayState");
  const SAMLResponse = typeof rawSAMLResponse === "string" ? rawSAMLResponse : "";
  const RelayState = typeof rawRelayState === "string" ? rawRelayState : "";

  // Validate state to prevent CSRF attacks — a missing cookie must also be
  // rejected (fail closed), not treated as an empty state that skips the check.
  const stateCookie = cookies?.get("saml_state");
  if (!stateCookie || stateCookie !== RelayState) {
    logger.error("SAML Authentication Failed: CSRF State mismatch");
    return json({ success: false, message: "CSRF State mismatch" }, { status: 403 });
  }

  // Read and consume both one-time cookies. A response is only accepted when
  // its InResponseTo matches the ID generated for this browser's login flow.
  const requestIdCookie = cookies?.get("saml_request_id");
  if (cookies) {
    cookies.delete("saml_state", { path: "/" });
    cookies.delete("saml_request_id", { path: "/" });
  }

  if (!SAMLResponse) {
    logger.error("SAML Authentication Failed: missing SAMLResponse");
    return json({ success: false, message: "Missing SAMLResponse" }, { status: 400 });
  }

  const inResponseTo = extractInResponseTo(SAMLResponse);
  if (!requestIdCookie || !inResponseTo || inResponseTo !== requestIdCookie) {
    logger.error("SAML Authentication Failed: InResponseTo request ID mismatch");
    return json({ success: false, message: "SAML InResponseTo mismatch" }, { status: 403 });
  }

  try {
    const { user, session } = await processSAMLResponse(
      SAMLResponse,
      RelayState,
      tenantId,
      requestIdCookie,
    );

    // Set Session Cookie — mirror the canonical cookie policy (see
    // handle-authentication.ts): __Host-/__Secure- prefix and Secure flag in
    // secure contexts via the constants.ts helpers.
    let isSecure = false;
    try {
      const requestUrl = new URL(request.url);
      isSecure = isSecureCookieContext(requestUrl.protocol, requestUrl.hostname);
    } catch {
      // Malformed/missing request URL (e.g. unit-test mocks) — plain cookie name
    }
    const cookieName = getSessionCookieName(isSecure);
    const response = json({ success: true, user });
    response.headers.append(
      "Set-Cookie",
      `${cookieName}=${session._id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${isSecure ? "; Secure" : ""}`,
    );

    return response;
  } catch (err: unknown) {
    rethrow(err);
    logger.error("SAML Authentication Failed", err);
    const status = (err as { status?: unknown })?.status;
    return json(
      {
        success: false,
        message: err instanceof Error ? err.message : "SAML authentication failed",
      },
      { status: typeof status === "number" ? status : 401 },
    );
  }
}

/**
 * Public wrapper for ACS Handler (Expected by router).
 */
export async function handleSAMLResponse(event: any, tenantId?: string | null) {
  return handleSAMLACS(event.request, event.cookies, tenantId);
}

/**
 * Returns the non-secret SAML connection configuration for an admin view.
 */
export function getSAMLConnectionConfig(tenant?: string | null, product?: string | null) {
  const effectiveTenant = tenant || "sveltycms";
  const effectiveProduct = product || "sveltycms";
  return {
    tenant: effectiveTenant,
    product: effectiveProduct,
    issuer:
      readPrivateSetting("SAML_ISSUER", tenant) ||
      readPrivateSetting("SAML_SP_ENTITY_ID", tenant) ||
      "sveltycms",
    audience:
      readPrivateSetting("SAML_AUDIENCE", tenant) ||
      readPrivateSetting("SAML_SP_ENTITY_ID", tenant),
    entryPoint: readPrivateSetting("SAML_ENTRY_POINT", tenant),
    hasCert: Boolean(readPrivateSetting("SAML_IDP_CERT", tenant)),
    wantAssertionsSigned: true,
  };
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
  issuer?: string;
  audience?: string;
}): Promise<{ id: string; tenant: string; product: string }> {
  const tenant = params.tenant || "sveltycms";
  const product = params.product || "sveltycms";

  let entryPoint = params.entryPoint;
  let cert = params.cert;
  let issuer = params.issuer;
  let audience = params.audience;

  // Raw IdP metadata is parsed first so malformed/unsafe XML is always
  // rejected, while explicit fields still take precedence when both are sent.
  if (params.rawMetadata) {
    const metadata = parseIdPMetadata(params.rawMetadata);
    entryPoint = entryPoint || metadata.entryPoint;
    cert = cert || metadata.cert;
    issuer = issuer || metadata.issuer;
    audience = audience || metadata.audience;
  }

  if (!entryPoint || !cert) {
    raise(400, "SAML entryPoint and cert are required", "SAML_CONFIG_INVALID");
  }

  try {
    await setPrivateSetting("SAML_ENTRY_POINT", entryPoint, tenant);
    await setPrivateSetting("SAML_IDP_CERT", cert, tenant);
    if (issuer) await setPrivateSetting("SAML_ISSUER", issuer, tenant);
    if (audience) await setPrivateSetting("SAML_AUDIENCE", audience, tenant);
  } catch (err) {
    logger.error("SAML configuration persistence failed", err);
    raise(
      501,
      "SAML configuration persistence is unavailable",
      "SAML_CONFIG_PERSISTENCE_UNAVAILABLE",
    );
  }

  // Reset the cached instance for this tenant/product so the next request
  // re-reads the persisted IdP configuration.
  samlCache.delete(samlCacheKey(tenant, product));

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
  samlCache.clear();
}
