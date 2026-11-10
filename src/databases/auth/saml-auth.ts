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
import { dateToISODateString, nowISODateString } from "@utils/date";
import { getSessionCookieName, isSecureCookieContext } from "./constants";
import {
  findSamlSessions,
  getSsoSessionMetadata,
  SAML_SSO_PROVIDER_ID,
  setSsoSessionMetadata,
  terminateSessionAndMetadata,
} from "./sso-session";

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
  /** IdP Single Logout endpoint (defaults to `entryPoint`). */
  logoutUrl?: string;
  /** SP private key used to sign LogoutRequest/LogoutResponse messages. */
  privateKey?: string;
  /** Our SLO endpoint — the `Destination` an IdP logout message must carry. */
  logoutCallbackUrl?: string;
}

/**
 * node-saml types the logout helpers with a full `Profile`, but a LogoutRequest
 * only carries `ID` (+ NameID/SessionIndex). This alias keeps the calls typed
 * without inventing the rest of a profile.
 */
type SamlLogoutProfile = Parameters<SAML["getLogoutResponseUrlAsync"]>[0];

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

/**
 * True when SAML Enterprise SSO is configured for the tenant.
 */
export function isSamlConfigured(tenant?: string | null): boolean {
  return Boolean(
    readPrivateSetting("SAML_ENTRY_POINT", tenant) ||
    (typeof process !== "undefined" && process.env?.SAML_ENTRY_POINT),
  );
}

const TRUE_SETTING_VALUES = new Set(["1", "true", "yes", "on"]);

/** Reads a boolean private setting. Absent / unparsable values are `false`. */
function readBooleanSetting(key: string, tenant?: string | null): boolean {
  const raw = readPrivateSetting(key, tenant) as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") return TRUE_SETTING_VALUES.has(raw.trim().toLowerCase());
  return false;
}

/**
 * True when an unsolicited (IdP-initiated) `SAMLResponse` may be accepted at the
 * ACS endpoint.
 *
 * Default is **false (fail closed)**: a response that no login in this browser
 * started is not bound to anything, so it must be an explicit opt-in. Both the
 * schema key `SAML_ALLOW_IDP_INITIATED` and the `samlAllowIdpInitiated` alias
 * are honoured so operators can use either spelling.
 */
export function isIdpInitiatedLoginAllowed(tenant?: string | null): boolean {
  return (
    readBooleanSetting("SAML_ALLOW_IDP_INITIATED", tenant) ||
    readBooleanSetting("samlAllowIdpInitiated", tenant)
  );
}

/**
 * Reads the tenant's IdP configuration from private settings.
 */
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
  const configuredLogoutUrl = readPrivateSetting("SAML_LOGOUT_URL", tenant);
  const configuredPrivateKey = readPrivateSetting("SAML_SP_PRIVATE_KEY", tenant);

  return {
    tenant: tenant || "sveltycms",
    product: product || "sveltycms",
    entryPoint: storedEntryPoint,
    cert: storedCert,
    issuer: configuredIssuer || "sveltycms",
    audience: configuredAudience,
    wantAssertionsSigned: true,
    redirectUrl: `${externalUrl}/api/auth/saml/acs`,
    logoutUrl: configuredLogoutUrl || storedEntryPoint,
    logoutCallbackUrl: `${externalUrl}/api/auth/saml/slo`,
    ...(configuredPrivateKey ? { privateKey: configuredPrivateKey } : {}),
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
  if (config.logoutUrl) options.logoutUrl = config.logoutUrl;
  if (config.logoutCallbackUrl) options.logoutCallbackUrl = config.logoutCallbackUrl;
  // Only present when the deployment configured an SP key: node-saml signs
  // LogoutRequest and LogoutResponse messages whenever it sees one.
  if (config.privateKey) options.privateKey = config.privateKey;
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
 * Decodes a base64 SAML message into a DOM, refusing DTD/entity declarations.
 * Returns null (never throws) for input that cannot be read, so callers can
 * treat a malformed message as "no message context".
 */
function decodeSamlXml(base64: string): XmlDomDocument | null {
  if (!base64) return null;
  const xml = Buffer.from(base64, "base64").toString("utf8");
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
    logger.debug("SAML message XML could not be parsed", err);
    return null;
  }

  if (parseError || !document.documentElement) return null;
  return document;
}

/** Root element local name of a base64-encoded SAML message ("" when unreadable). */
function getSAMLRootLocalName(base64: string): string {
  const root = decodeSamlXml(base64)?.documentElement;
  return root ? localName(root) : "";
}

/**
 * Reads the `InResponseTo` attribute from a base64-encoded SAMLResponse.
 * node-saml 5.1.0's `validatePostResponseAsync` does not accept a caller
 * supplied request ID, so the ACS handler performs this stateless check
 * against the `saml_request_id` cookie before delegating signature validation.
 */
function extractInResponseTo(samlResponse: string): string | null {
  const root = decodeSamlXml(samlResponse)?.documentElement;
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
  options: { idpInitiated?: boolean } = {},
) {
  if (options.idpInitiated) {
    // An unsolicited response must not answer a request. A present InResponseTo
    // means the IdP is answering *some* AuthnRequest — never treat that as
    // IdP-initiated, or a captured response could be replayed at will.
    if (extractInResponseTo(samlResponse)) {
      logger.error("SAML Authentication Failed: unsolicited response carries InResponseTo");
      raise(403, "SAML InResponseTo mismatch", "SAML_IN_RESPONSE_TO_MISMATCH");
    }
  } else if (requestId) {
    // Defence in depth for direct callers — the ACS route already returns a 403
    // before reaching this function when the cookie does not match.
    assertInResponseTo(samlResponse, requestId);
  }

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

  // Record the SAML identity so an IdP-initiated LogoutRequest — which carries
  // only NameID + SessionIndex — can find and destroy this session later.
  try {
    await setSsoSessionMetadata(
      String(sessionResult.data._id),
      {
        provider: SAML_SSO_PROVIDER_ID,
        createdAt: nowISODateString(),
        ...(tenantId ? { tenantId } : {}),
        ...(profile.nameID ? { samlNameId: profile.nameID } : {}),
        ...(profile.sessionIndex ? { samlSessionIndex: profile.sessionIndex } : {}),
      },
      tenantId ?? undefined,
    );
  } catch (err) {
    logger.warn("SAML session metadata could not be recorded", err);
  }

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

  const stateCookie = cookies?.get("saml_state");
  const requestIdCookie = cookies?.get("saml_request_id");
  const flowCookiePresent = Boolean(stateCookie) || Boolean(requestIdCookie);
  const spInitiated = Boolean(stateCookie) && stateCookie === RelayState;

  // Read and consume both one-time cookies.
  if (cookies) {
    cookies.delete("saml_state", { path: "/" });
    cookies.delete("saml_request_id", { path: "/" });
  }

  if (!SAMLResponse) {
    logger.error("SAML Authentication Failed: missing SAMLResponse");
    return json({ success: false, message: "Missing SAMLResponse" }, { status: 400 });
  }

  const inResponseTo = extractInResponseTo(SAMLResponse);

  // Decide whether this response answers a login this browser started.
  let idpInitiated = false;
  if (spInitiated) {
    if (!requestIdCookie || !inResponseTo || inResponseTo !== requestIdCookie) {
      logger.error("SAML Authentication Failed: InResponseTo request ID mismatch");
      return json({ success: false, message: "SAML InResponseTo mismatch" }, { status: 403 });
    }
  } else if (flowCookiePresent) {
    // Flow cookies exist but do not bind to this message. Never fall back to the
    // unsolicited path here: that is exactly the replayed-CSRF case the cookies
    // are meant to catch.
    logger.error("SAML Authentication Failed: CSRF State mismatch");
    return json({ success: false, message: "CSRF State mismatch" }, { status: 403 });
  } else if (!isIdpInitiatedLoginAllowed(tenantId)) {
    logger.error(
      "SAML Authentication Failed: no login was started by this browser and IdP-initiated " +
        "login is disabled (set SAML_ALLOW_IDP_INITIATED to enable); CSRF State mismatch",
    );
    return json({ success: false, message: "CSRF State mismatch" }, { status: 403 });
  } else {
    if (inResponseTo) {
      logger.error("SAML Authentication Failed: unsolicited response carries InResponseTo");
      return json({ success: false, message: "SAML InResponseTo mismatch" }, { status: 403 });
    }
    idpInitiated = true;
    logger.info("SAML Authentication: accepting an IdP-initiated (unsolicited) response");
  }

  try {
    const { user, session } = await processSAMLResponse(
      SAMLResponse,
      RelayState,
      tenantId,
      idpInitiated ? undefined : (requestIdCookie as string),
      { idpInitiated },
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

// ─── Single Logout (SLO) ─────────────────────────────────────────────

/** Outcome of an IdP-initiated LogoutRequest. */
export interface SamlSloResult {
  success: boolean;
  message: string;
  /** Session ids whose CMS row *and* SSO metadata were destroyed. */
  terminatedSessionIds: string[];
  relayState: string;
  /** HTTP-Redirect URL carrying a signed LogoutResponse (SP signing key set). */
  redirectUrl?: string;
  /** HTTP-POST fallback: auto-submitting form for the IdP's SLO endpoint. */
  formPost?: { url: string; samlResponse: string };
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds the answer to an IdP LogoutRequest.
 *
 * A signed answer needs an SP private key (`SAML_SP_PRIVATE_KEY`); node-saml
 * then emits it over the HTTP-Redirect binding. Without a key the SP cannot
 * sign, so an unsigned Status=Success response is returned over the HTTP-POST
 * binding instead of no answer at all. IdPs that insist on a signed response
 * will reject that one — the local session is destroyed either way, which is
 * the security-relevant half of logout.
 */
async function buildSAMLLogoutResponse(
  logoutRequest: { ID?: unknown } | null,
  relayState: string,
  tenantId?: string | null,
): Promise<Pick<SamlSloResult, "redirectUrl" | "formPost">> {
  const config = getSAMLConfig(tenantId);
  const destination = config.logoutUrl || config.entryPoint;

  if (config.privateKey) {
    try {
      const url = await getSAML(tenantId).getLogoutResponseUrlAsync(
        (logoutRequest ?? {}) as unknown as SamlLogoutProfile,
        relayState,
        {},
        true,
      );
      if (url) return { redirectUrl: url };
    } catch (err) {
      logger.warn("SAML LogoutResponse could not be signed; sending an unsigned one", err);
    }
  }

  const responseId = `_${globalThis.crypto.randomUUID()}`;
  const inResponseTo = logoutRequest?.ID
    ? ` InResponseTo="${escapeXmlAttribute(String(logoutRequest.ID))}"`
    : "";
  const xml =
    `<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"` +
    ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${responseId}" Version="2.0"` +
    ` IssueInstant="${nowISODateString()}"` +
    ` Destination="${escapeXmlAttribute(destination)}"${inResponseTo}>` +
    `<saml:Issuer>${escapeXmlAttribute(config.issuer || "sveltycms")}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `</samlp:LogoutResponse>`;

  return {
    formPost: {
      url: destination,
      samlResponse: Buffer.from(xml, "utf8").toString("base64"),
    },
  };
}

/**
 * Handles an IdP-initiated LogoutRequest (HTTP-Redirect or HTTP-POST binding).
 *
 * node-saml validates the signature, the issuer and `NotBefore`/`NotOnOrAfter`
 * before this function destroys anything, so a forged or replayed request
 * terminates nothing. Sessions are located by the request's `NameID`
 * (+ `SessionIndex` when present) because the IdP has no access to our session
 * cookie. A request that matches no session still succeeds — logout must be
 * idempotent for an IdP that retries.
 */
export async function handleSAMLLogoutRequest(params: {
  /** Base64 `SAMLRequest` from the HTTP-POST binding. */
  samlRequest?: string;
  /** Raw (still URL-encoded) query string for the HTTP-Redirect binding. */
  rawQuery?: string;
  relayState?: string;
  tenantId?: string | null;
}): Promise<SamlSloResult> {
  const { samlRequest, rawQuery, tenantId } = params;
  const relayState = params.relayState ?? "";
  const saml = getSAML(tenantId);

  let profile: { ID?: string; nameID?: string; sessionIndex?: string } | null = null;
  try {
    if (samlRequest) {
      if (getSAMLRootLocalName(samlRequest) !== "LogoutRequest") {
        return {
          success: false,
          message: "SAMLRequest is not a LogoutRequest",
          terminatedSessionIds: [],
          relayState,
        };
      }
      profile = (
        await saml.validatePostRequestAsync({ SAMLRequest: samlRequest, RelayState: relayState })
      ).profile;
    } else if (rawQuery) {
      profile = (await saml.validateRedirectAsync(rawQuery)).profile;
    } else {
      return {
        success: false,
        message: "Missing SAMLRequest",
        terminatedSessionIds: [],
        relayState,
      };
    }
  } catch (err) {
    logger.error("SAML LogoutRequest rejected", err);
    return {
      success: false,
      message: `SAML LogoutRequest rejected: ${err instanceof Error ? err.message : "invalid message"}`,
      terminatedSessionIds: [],
      relayState,
    };
  }

  const nameId = profile?.nameID ?? "";
  if (!nameId) {
    return {
      success: false,
      message: "SAML LogoutRequest has no NameID",
      terminatedSessionIds: [],
      relayState,
    };
  }

  const terminatedSessionIds: string[] = [];
  for (const target of findSamlSessions(nameId, profile?.sessionIndex)) {
    await terminateSessionAndMetadata(target.sessionId, target.tenantId ?? tenantId);
    terminatedSessionIds.push(target.sessionId);
  }

  logger.info(
    `[SAML SLO] IdP-initiated logout for ${nameId.slice(0, 3)}…: ${terminatedSessionIds.length} session(s) terminated`,
  );

  return {
    success: true,
    message: `IdP-initiated logout processed (${terminatedSessionIds.length} sessions terminated)`,
    terminatedSessionIds,
    relayState,
    ...(await buildSAMLLogoutResponse(profile, relayState, tenantId)),
  };
}

/** HTML auto-submitting form carrying a LogoutResponse (HTTP-POST binding). */
function renderSamlPostForm(
  target: { url: string; samlResponse: string },
  relayState: string,
): string {
  const relayInput = relayState
    ? `<input type="hidden" name="RelayState" value="${escapeXmlAttribute(relayState)}" />`
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Signing out</title></head>
<body onload="document.forms[0].submit()">
<noscript><p>Press the button to finish signing out.</p></noscript>
<form method="post" action="${escapeXmlAttribute(target.url)}">
<input type="hidden" name="SAMLResponse" value="${escapeXmlAttribute(target.samlResponse)}" />
${relayInput}
<noscript><input type="submit" value="Continue" /></noscript>
</form>
<script>document.forms[0].style.display = "none";</script>
</body></html>`;
}

/** Maps an SLO result onto the response the IdP's user-agent receives. */
function samlSloResponse(result: SamlSloResult): Response {
  if (!result.success) {
    return json({ success: false, message: result.message }, { status: 400 });
  }
  if (result.formPost) {
    return new Response(renderSamlPostForm(result.formPost, result.relayState), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (result.redirectUrl) {
    return new Response(null, {
      status: 302,
      headers: { location: result.redirectUrl, "cache-control": "no-store" },
    });
  }
  return json({
    success: true,
    message: result.message,
    terminated: result.terminatedSessionIds.length,
  });
}

/**
 * SLO endpoint.
 *
 * - GET: HTTP-Redirect binding LogoutRequest (or LogoutResponse).
 * - POST: HTTP-POST binding LogoutRequest, or the LogoutResponse that answers
 *   our own SP-initiated LogoutRequest.
 *
 * A message that fails validation terminates nothing and is reported as such.
 */
export async function handleSAMLSLO(request: Request, tenantId?: string | null): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const rawQuery = new URL(request.url).search.replace(/^\?/, "");
    return samlSloResponse(await handleSAMLLogoutRequest({ rawQuery, tenantId }));
  }

  if (method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const samlRequest =
    typeof form.get("SAMLRequest") === "string" ? (form.get("SAMLRequest") as string) : "";
  const samlResponse =
    typeof form.get("SAMLResponse") === "string" ? (form.get("SAMLResponse") as string) : "";
  const relayState =
    typeof form.get("RelayState") === "string" ? (form.get("RelayState") as string) : "";

  // A LogoutResponse answers a LogoutRequest we sent: verify it and report the
  // IdP's status. The local session was already destroyed when we sent it.
  if (samlResponse) {
    if (getSAMLRootLocalName(samlResponse) !== "LogoutResponse") {
      return json(
        { success: false, message: "SAMLResponse is not a LogoutResponse" },
        { status: 400 },
      );
    }
    try {
      await getSAML(tenantId).validatePostResponseAsync({
        SAMLResponse: samlResponse,
        RelayState: relayState,
      });
      return json({ success: true, message: "LogoutResponse accepted" });
    } catch (err) {
      logger.error("SAML LogoutResponse rejected", err);
      return json({ success: false, message: "SAML LogoutResponse rejected" }, { status: 400 });
    }
  }

  return samlSloResponse(await handleSAMLLogoutRequest({ samlRequest, relayState, tenantId }));
}

/**
 * SP-initiated logout: builds a (signed when an SP key is configured)
 * LogoutRequest for the IdP and destroys the local session.
 *
 * Returns no URL for a session that was not created by SAML, so the caller can
 * fall back to the ordinary local logout.
 */
export async function buildSAMLLogoutRequestUrl(
  sessionId: string,
  tenantId?: string | null,
  relayState?: string,
): Promise<{ url?: string; message: string }> {
  const metadata = await getSsoSessionMetadata(sessionId, tenantId ?? undefined);
  if (!metadata || metadata.provider !== SAML_SSO_PROVIDER_ID || !metadata.samlNameId) {
    return { message: "Session is not a SAML session" };
  }

  try {
    const url = await getSAML(tenantId).getLogoutUrlAsync(
      {
        nameID: metadata.samlNameId,
        ...(metadata.samlSessionIndex ? { sessionIndex: metadata.samlSessionIndex } : {}),
      } as unknown as SamlLogoutProfile,
      relayState ?? "",
      {},
    );
    await terminateSessionAndMetadata(sessionId, metadata.tenantId ?? tenantId);
    return { url, message: "Redirecting to the IdP for federated logout" };
  } catch (err) {
    logger.error("SAML LogoutRequest could not be built", err);
    return { message: "SAML LogoutRequest could not be built" };
  }
}

/** Public wrapper for the SLO route (expected by the router). */
export async function handleSAMLSLOEvent(event: { request: Request }, tenantId?: string | null) {
  return handleSAMLSLO(event.request, tenantId);
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
