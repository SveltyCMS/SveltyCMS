/**
 * @file tests/unit/auth/saml-slo.test.ts
 * @description SAML 2.0 IdP-initiated login (ACS) and Single Logout (SLO).
 *
 * WHY: until now the ACS only accepted a response bound to a login this browser
 * started (`saml_state` + `saml_request_id` cookies), so an IdP-initiated login
 * was always rejected, and there was no SLO endpoint at all — an IdP could not
 * terminate a CMS session. Both flows are fail-closed: the unsolicited ACS path
 * needs `SAML_ALLOW_IDP_INITIATED`, and an IdP LogoutRequest that fails
 * signature validation destroys nothing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  samlOptions: [] as Record<string, unknown>[],
  deleteSession: vi.fn(async () => ({ success: true })),
  invalidateSessionCache: vi.fn(),
  createSession: vi.fn(async () => ({ success: true, data: { _id: "sess-saml-acs" } })),
  getUserByEmail: vi.fn(async () => ({
    success: true,
    data: { _id: "user-1", email: "user@test.com" },
  })),
  createUser: vi.fn(async () => ({ success: true, data: { _id: "new-user" } })),
  validatePostResponseAsync: vi.fn(),
  validatePostRequestAsync: vi.fn(),
  getLogoutUrlAsync: vi.fn(async () => "https://idp.example.com/slo?SAMLRequest=..."),
  logoutUrl: "https://idp.example.com/slo?SAMLRequest=...",
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => mocks.settings.get(key),
  setPrivateSetting: vi.fn(async () => undefined),
  getUntypedSetting: vi.fn(async () => undefined),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getUserByEmail: mocks.getUserByEmail,
      createUser: mocks.createUser,
      createSession: mocks.createSession,
    },
  },
  getDb: () => ({ auth: { deleteSession: mocks.deleteSession } }),
}));

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: mocks.invalidateSessionCache,
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
}));

vi.mock("@node-saml/node-saml", () => ({
  SAML: vi.fn(function (this: any, options: Record<string, unknown>) {
    mocks.samlOptions.push(options);
    this.validatePostResponseAsync = mocks.validatePostResponseAsync;
    this.validatePostRequestAsync = mocks.validatePostRequestAsync;
    this.validateRedirectAsync = vi.fn(async () => ({
      profile: { nameID: "user@test.com" },
      loggedOut: true,
    }));
    this.getLogoutUrlAsync = mocks.getLogoutUrlAsync;
    this.getLogoutResponseUrlAsync = vi.fn(
      async () => "https://idp.example.com/slo?SAMLResponse=...",
    );
  }),
}));

import {
  buildSAMLLogoutRequestUrl,
  handleSAMLACS,
  handleSAMLLogoutRequest,
  handleSAMLSLO,
  _resetSAMLCache,
} from "@src/databases/auth/saml-auth";
import { getSsoSessionMetadata, setSsoSessionMetadata } from "@src/databases/auth/sso-session";

const IDP_ENTRY_POINT = "https://idp.example.com/sso";
const IDP_CERT = "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----";

function encodeSAMLResponse(inResponseTo?: string): string {
  const attribute = inResponseTo ? ` InResponseTo="${inResponseTo}"` : "";
  return Buffer.from(
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"${attribute}></samlp:Response>`,
  ).toString("base64");
}

function encodeLogoutRequest(): string {
  return Buffer.from(
    '<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_logout-1" Version="2.0">' +
      '<saml:NameID xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">user@test.com</saml:NameID>' +
      "</samlp:LogoutRequest>",
  ).toString("base64");
}

function acsRequest(relayState: string, samlResponse: string): Request {
  const form = new FormData();
  form.set("SAMLResponse", samlResponse);
  form.set("RelayState", relayState);
  return new Request("http://localhost/api/auth/saml/acs", { method: "POST", body: form });
}

function anonymousCookies() {
  return { get: vi.fn(() => null), delete: vi.fn() };
}

describe("SAML IdP-initiated login (ACS)", () => {
  beforeEach(() => {
    mocks.settings.clear();
    mocks.settings.set("SAML_ENTRY_POINT", IDP_ENTRY_POINT);
    mocks.settings.set("SAML_IDP_CERT", IDP_CERT);
    mocks.createSession.mockClear();
    mocks.deleteSession.mockClear();
    mocks.invalidateSessionCache.mockClear();
    mocks.validatePostResponseAsync.mockReset();
    mocks.validatePostResponseAsync.mockResolvedValue({
      profile: {
        nameID: "user@test.com",
        attributes: {
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@test.com",
        },
      },
      loggedOut: false,
    });
    _resetSAMLCache();
  });

  it("accepts an unsolicited SAMLResponse when SAML_ALLOW_IDP_INITIATED is on", async () => {
    mocks.settings.set("SAML_ALLOW_IDP_INITIATED", true);

    const response = await handleSAMLACS(
      acsRequest("", encodeSAMLResponse()),
      anonymousCookies(),
      "tenant-idp",
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mocks.validatePostResponseAsync).toHaveBeenCalledWith({
      SAMLResponse: expect.any(String),
      RelayState: "",
    });
    expect(mocks.createSession).toHaveBeenCalled();
  });

  it("honours the `samlAllowIdpInitiated` alias", async () => {
    mocks.settings.set("samlAllowIdpInitiated", "true");

    const response = await handleSAMLACS(
      acsRequest("", encodeSAMLResponse()),
      anonymousCookies(),
      "tenant-alias",
    );

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it("rejects an unsolicited SAMLResponse when the setting is off (fail closed)", async () => {
    const response = await handleSAMLACS(
      acsRequest("", encodeSAMLResponse()),
      anonymousCookies(),
      "tenant-off",
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("CSRF State mismatch");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects an unsolicited response that carries an InResponseTo", async () => {
    mocks.settings.set("SAML_ALLOW_IDP_INITIATED", true);

    const response = await handleSAMLACS(
      acsRequest("", encodeSAMLResponse("some-other-flow")),
      anonymousCookies(),
      "tenant-replayed",
    );

    expect(response.status).toBe(403);
    expect((await response.json()).message).toContain("InResponseTo");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("keeps rejecting a response whose state cookie belongs to another flow", async () => {
    mocks.settings.set("SAML_ALLOW_IDP_INITIATED", true);
    const cookies = {
      get: vi.fn((name: string) =>
        name === "saml_state" ? "victim-state" : name === "saml_request_id" ? "req-1" : null,
      ),
      delete: vi.fn(),
    };

    const response = await handleSAMLACS(
      acsRequest("attacker-state", encodeSAMLResponse("req-1")),
      cookies,
      "tenant-csrf",
    );

    expect(response.status).toBe(403);
    expect((await response.json()).message).toContain("CSRF State mismatch");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("SAML Single Logout", () => {
  beforeEach(() => {
    mocks.settings.clear();
    mocks.settings.set("SAML_ENTRY_POINT", IDP_ENTRY_POINT);
    mocks.settings.set("SAML_IDP_CERT", IDP_CERT);
    mocks.deleteSession.mockClear();
    mocks.invalidateSessionCache.mockClear();
    mocks.validatePostRequestAsync.mockReset();
    _resetSAMLCache();
  });

  it("rejects a LogoutRequest whose signature does not verify and destroys nothing", async () => {
    mocks.validatePostRequestAsync.mockRejectedValueOnce(
      new Error("Invalid signature on documentElement"),
    );
    await setSsoSessionMetadata("sess-bad-sig", {
      provider: "saml",
      createdAt: new Date().toISOString(),
      samlNameId: "bad-sig@test.com",
    });

    const result = await handleSAMLLogoutRequest({
      samlRequest: encodeLogoutRequest(),
      tenantId: "tenant-bad-sig",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("rejected");
    expect(result.terminatedSessionIds).toEqual([]);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.invalidateSessionCache).not.toHaveBeenCalled();
    expect(await getSsoSessionMetadata("sess-bad-sig")).toBeTruthy();
  });

  it("deletes the CMS session row AND the SSO metadata on a valid LogoutRequest", async () => {
    await setSsoSessionMetadata("sess-slo-ok", {
      provider: "saml",
      createdAt: new Date().toISOString(),
      samlNameId: "slo-ok@test.com",
      samlSessionIndex: "session-index-1",
    });
    mocks.validatePostRequestAsync.mockResolvedValueOnce({
      profile: { ID: "_logout-1", nameID: "slo-ok@test.com", sessionIndex: "session-index-1" },
      loggedOut: true,
    });

    const result = await handleSAMLLogoutRequest({
      samlRequest: encodeLogoutRequest(),
      relayState: "relay-1",
      tenantId: "tenant-slo",
    });

    expect(result.success).toBe(true);
    expect(result.terminatedSessionIds).toEqual(["sess-slo-ok"]);
    // Session row destroyed through the adapter (not a process-local set) …
    expect(mocks.deleteSession).toHaveBeenCalledWith("sess-slo-ok", {
      tenantId: "tenant-slo",
    });
    // … and the per-node session cache invalidated with it.
    expect(mocks.invalidateSessionCache).toHaveBeenCalledWith("sess-slo-ok", "tenant-slo");
    // Metadata is gone too, so a later lookup cannot resurrect the session.
    expect(await getSsoSessionMetadata("sess-slo-ok")).toBeFalsy();
    // The IdP gets an answer: unsigned HTTP-POST binding without an SP key.
    expect(result.formPost?.url).toBe(IDP_ENTRY_POINT);
    expect(result.formPost?.samlResponse).toBeTypeOf("string");
  });

  it("handles a LogoutRequest without any SessionIndex without throwing", async () => {
    await setSsoSessionMetadata("sess-no-index", {
      provider: "saml",
      createdAt: new Date().toISOString(),
      samlNameId: "no-index@test.com",
    });
    mocks.validatePostRequestAsync.mockResolvedValueOnce({
      profile: { ID: "_logout-2", nameID: "no-index@test.com" },
      loggedOut: true,
    });

    const result = await handleSAMLLogoutRequest({
      samlRequest: encodeLogoutRequest(),
      tenantId: "tenant-no-index",
    });

    expect(result.success).toBe(true);
    expect(result.terminatedSessionIds).toContain("sess-no-index");
    expect(mocks.deleteSession).toHaveBeenCalledWith("sess-no-index", {
      tenantId: "tenant-no-index",
    });
    expect(await getSsoSessionMetadata("sess-no-index")).toBeFalsy();
  });

  it("matches by NameID when the request has a SessionIndex the session never stored", async () => {
    await setSsoSessionMetadata("sess-unknown-index", {
      provider: "saml",
      createdAt: new Date().toISOString(),
      samlNameId: "unknown-index@test.com",
    });
    mocks.validatePostRequestAsync.mockResolvedValueOnce({
      profile: {
        ID: "_logout-3",
        nameID: "unknown-index@test.com",
        sessionIndex: "index-from-idp",
      },
      loggedOut: true,
    });

    const result = await handleSAMLLogoutRequest({
      samlRequest: encodeLogoutRequest(),
      tenantId: "tenant-unknown-index",
    });

    expect(result.success).toBe(true);
    expect(result.terminatedSessionIds).toContain("sess-unknown-index");
  });

  it("succeeds without throwing when no session matches the NameID", async () => {
    mocks.validatePostRequestAsync.mockResolvedValueOnce({
      profile: { ID: "_logout-4", nameID: "nobody@test.com" },
      loggedOut: true,
    });

    const result = await handleSAMLLogoutRequest({
      samlRequest: encodeLogoutRequest(),
      tenantId: "tenant-no-session",
    });

    expect(result.success).toBe(true);
    expect(result.terminatedSessionIds).toEqual([]);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("SP-initiated logout sends a LogoutRequest and destroys the local session", async () => {
    await setSsoSessionMetadata("sess-sp", {
      provider: "saml",
      tenantId: "tenant-sp",
      createdAt: new Date().toISOString(),
      samlNameId: "sp@test.com",
      samlSessionIndex: "session-index-sp",
    });

    const result = await buildSAMLLogoutRequestUrl("sess-sp", "tenant-sp", "relay-sp");

    expect(result.url).toBe(mocks.logoutUrl);
    expect(mocks.getLogoutUrlAsync).toHaveBeenCalledWith(
      { nameID: "sp@test.com", sessionIndex: "session-index-sp" },
      "relay-sp",
      {},
    );
    expect(mocks.deleteSession).toHaveBeenCalledWith("sess-sp", { tenantId: "tenant-sp" });
    expect(await getSsoSessionMetadata("sess-sp", "tenant-sp")).toBeFalsy();
  });

  it("serves the SLO route: a POST LogoutRequest answers the IdP with a LogoutResponse", async () => {
    await setSsoSessionMetadata("sess-route", {
      provider: "saml",
      createdAt: new Date().toISOString(),
      samlNameId: "route@test.com",
    });
    mocks.validatePostRequestAsync.mockResolvedValueOnce({
      profile: { ID: "_logout-route", nameID: "route@test.com" },
      loggedOut: true,
    });

    const form = new FormData();
    form.set("SAMLRequest", encodeLogoutRequest());
    form.set("RelayState", "relay-route");
    const request = new Request("http://localhost/api/auth/saml/slo", {
      method: "POST",
      body: form,
    });

    const response = await handleSAMLSLO(request, "tenant-route");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('name="SAMLResponse"');
    expect(html).toContain(IDP_ENTRY_POINT);
    expect(mocks.deleteSession).toHaveBeenCalledWith("sess-route", { tenantId: "tenant-route" });
    expect(await getSsoSessionMetadata("sess-route")).toBeFalsy();
  });

  it("serves the SLO route: a GET without a SAMLRequest is rejected", async () => {
    const response = await handleSAMLSLO(
      new Request("http://localhost/api/auth/saml/slo", { method: "GET" }),
      "tenant-empty",
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("Missing SAMLRequest");
  });

  it("SP-initiated logout reports a non-SAML session instead of throwing", async () => {
    const result = await buildSAMLLogoutRequestUrl("sess-not-saml", "tenant-oidc");

    expect(result.url).toBeUndefined();
    expect(result.message).toContain("not a SAML session");
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
});
