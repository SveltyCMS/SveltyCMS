/**
 * @file tests/unit/auth/sso/saml.test.ts
 * @description SAML Authentication Service Unit Tests
 *
 * Tests:
 * - should generate the SAML authorize URL and bind the AuthnRequest ID
 * - should create SAML connections from explicit fields or raw IdP metadata
 * - should reject malformed/unsafe metadata and invalid certificates
 * - should process SAML responses and enforce InResponseTo
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// ============================================================================
// 1. Vitest Mock Registrations (Static / Hoisted)
// ============================================================================

const samlMockState = vi.hoisted(() => ({
  lastOptions: null as Record<string, unknown> | null,
  lastValidateContainer: null as Record<string, string> | null,
  authorizeUrl: "https://idp.example.com/sso?SAMLRequest=...",
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getUserByEmail: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "user123", email: "user@test.com" },
      }),
      createUser: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "new-user", email: "user@test.com" },
      }),
      createSession: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "session123" },
      }),
    },
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => {
    if (key === "DB_TYPE") return "postgresql";
    if (key === "SAML_ENTRY_POINT") return "https://idp.example.com/sso";
    if (key === "SAML_IDP_CERT")
      return "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----";
    return undefined;
  },
  setPrivateSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@node-saml/node-saml", () => ({
  SAML: vi.fn(function (this: any, options: Record<string, unknown>) {
    samlMockState.lastOptions = options;
    this.getAuthorizeUrlAsync = vi.fn(async () => samlMockState.authorizeUrl);
    this.getAuthorizeMessageAsync = vi.fn(async () => ({ SAMLRequest: "..." }));
    this.validatePostResponseAsync = vi.fn(async (container: Record<string, string>) => {
      samlMockState.lastValidateContainer = container;
      return {
        profile: {
          nameID: "user@test.com",
          attributes: {
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@test.com",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Test",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
          },
        },
      };
    });
  }),
}));

/**
 * Self-signed test certificate (CN=test-idp.example.com, valid until 2126).
 * Used only to exercise X.509 parsing — it is not a secret.
 */
const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIUKS23LfPoVaVg8QiyDrJ+FkBshjUwDQYJKoZIhvcNAQEL
BQAwHzEdMBsGA1UEAwwUdGVzdC1pZHAuZXhhbXBsZS5jb20wIBcNMjYxMDE4MTkw
MDM3WhgPMjEyNjA5MjQxOTAwMzdaMB8xHTAbBgNVBAMMFHRlc3QtaWRwLmV4YW1w
bGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyx0EyvqXgIKJ
PuUOEKRVoG4UKlW+wa9/FI2sgpLHPt5xSVlHQMtbUsg95osaXpiKYep2LctXdVuZ
WO7IlOfU6bBqTyNxbuO6vF39lal0FWPN7HvbEYSTE6b6Wl2XfZy/HboiAwh5Z9j3
VHTGJedA/Wr0OmMCr3uHXx/zFT6bU2Df/Iq6p2AOPzOAQoHPIuNdnhiQEaEKP19+
xky4T40QwNfqHCm2Rf0IWcMhVlO1z3Wc4zYbygu+/WdIe/L0gCZKo7SCHhZST6Bm
i7vix4foY0or5oDVN4cgFVdU7MBZuH2Xa999o1cSnnoJiSsxDP+dAP7zvvLDLvQu
+sQH6zXCfwIDAQABo1MwUTAdBgNVHQ4EFgQUdZrRjd+M2b9d67tRbSqiL1gBGvsw
HwYDVR0jBBgwFoAUdZrRjd+M2b9d67tRbSqiL1gBGvswDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAQEAaLpE5ajDx+BR0EHnPAlK/W8Nwadg019/pxP+
c6r9SFo2wyH4CgpKVeTriph9gyGtB7P+fn/99/lPm2SEdnWxgmOwB+V8sV3X0wY7
KlbUiyBsdjF03JTvB0rCyIsnvs3x2ysP9d4FwV10mFeW0UXErU5Zzb/sf2iyy74n
vtQIPrlaAlhdXFBJjV1ULyfzAD9SMpvbHnBHkyRkSvDfPv3YIa0IjqdPhW/+F9gw
PMKzF5gRSL7ZkbgQHT/76CQJNe2Z6m2iqucalGSMWQvblyfRqylePwreGXBgH+aB
XM1IMUKz9qrF8nKYOlUG8EDHXQQDWT/eiAltQucjNlgupWARtw==
-----END CERTIFICATE-----`;

const TEST_CERT_BODY = TEST_CERT_PEM.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(
  /\s+/g,
  "",
);

function encodeSAMLResponse(inResponseTo?: string): string {
  const attribute = inResponseTo ? ` InResponseTo="${inResponseTo}"` : "";
  return Buffer.from(
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"${attribute}></samlp:Response>`,
  ).toString("base64");
}

describe("SAML Authentication Service", () => {
  let samlModule: any;
  let dbModule: any;
  let settingsModule: any;

  beforeAll(async () => {
    // Dynamic import to allow mocks to be registered first
    samlModule = await import("@src/databases/auth/saml-auth");
    dbModule = await import("@src/databases/db");
    settingsModule = await import("@src/services/core/settings-service");
    // Reset cache from any previous test runs
    samlModule._resetSAMLCache();
  });

  it("should generate a SAML redirect URL and pin the request ID", async () => {
    const result = await samlModule.generateSAMLAuthUrl("acme-corp", "sveltycms");

    expect(result.url).toBe("https://idp.example.com/sso?SAMLRequest=...");
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/i);

    const generateUniqueId = samlMockState.lastOptions?.generateUniqueId;
    expect(generateUniqueId).toBeTypeOf("function");
    expect((generateUniqueId as () => string)()).toBe(result.requestId);
  });

  it("should create SAML connections via admin controller", async () => {
    const mockPayload = {
      tenant: "t1",
      product: "p1",
      entryPoint: "https://idp.corp.com/sso",
      cert: "-----BEGIN CERTIFICATE-----\nREAL\n-----END CERTIFICATE-----",
    };
    const result = await samlModule.createSAMLConnection(mockPayload);
    expect(result.id).toBe("conn_t1_p1");
    expect(result.tenant).toBe("t1");
    expect(result.product).toBe("p1");
  });

  it("should parse raw IdP metadata into entryPoint, cert, issuer, and audience", async () => {
    const setPrivateSetting = vi.mocked(settingsModule.setPrivateSetting);
    setPrivateSetting.mockClear();

    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
  <md:EntityDescriptor entityID="https://idp.example.com/metadata">
    <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
      <md:KeyDescriptor use="signing">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
          <ds:X509Data><ds:X509Certificate>${TEST_CERT_BODY}</ds:X509Certificate></ds:X509Data>
        </ds:KeyInfo>
      </md:KeyDescriptor>
      <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso/post" />
      <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso/redirect" />
      <md:Extensions><Audience>sveltycms-sp</Audience></md:Extensions>
    </md:IDPSSODescriptor>
  </md:EntityDescriptor>
</md:EntitiesDescriptor>`;

    const result = await samlModule.createSAMLConnection({
      tenant: "t2",
      product: "p2",
      rawMetadata: metadata,
    });

    expect(result.id).toBe("conn_t2_p2");
    expect(setPrivateSetting).toHaveBeenCalledWith(
      "SAML_ENTRY_POINT",
      "https://idp.example.com/sso/redirect",
      "t2",
    );
    expect(setPrivateSetting).toHaveBeenCalledWith("SAML_IDP_CERT", TEST_CERT_PEM, "t2");
    expect(setPrivateSetting).toHaveBeenCalledWith(
      "SAML_ISSUER",
      "https://idp.example.com/metadata",
      "t2",
    );
    expect(setPrivateSetting).toHaveBeenCalledWith("SAML_AUDIENCE", "sveltycms-sp", "t2");
  });

  it("should reject malformed IdP metadata with 400", async () => {
    await expect(
      samlModule.createSAMLConnection({ tenant: "t3", rawMetadata: "<md:EntityDescriptor" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("should reject DOCTYPE/entity metadata with 400", async () => {
    const unsafe = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="&xxe;"/>`;
    await expect(
      samlModule.createSAMLConnection({ tenant: "t3", rawMetadata: unsafe }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("should process SAML response and extract email from profile", async () => {
    const result = await samlModule.processSAMLResponse(encodeSAMLResponse(), "valid-state");
    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
  });

  it("should bind the user lookup, provisioning, and session to the initiating tenant", async () => {
    const getUserByEmail = vi.mocked(dbModule.dbAdapter.auth.getUserByEmail);
    const createSession = vi.mocked(dbModule.dbAdapter.auth.createSession);
    getUserByEmail.mockClear();
    createSession.mockClear();

    await samlModule.processSAMLResponse(encodeSAMLResponse(), "valid-state", "tenant-x");

    expect(getUserByEmail).toHaveBeenCalledWith({
      email: "user@test.com",
      tenantId: "tenant-x",
    });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-x" }));
  });

  it("should accept a response whose InResponseTo matches the request ID", async () => {
    const samlResponse = encodeSAMLResponse("request-123");

    const result = await samlModule.processSAMLResponse(
      samlResponse,
      "valid-state",
      undefined,
      "request-123",
    );

    expect(result.user).toBeDefined();
    expect(samlMockState.lastValidateContainer).toEqual({
      SAMLResponse: samlResponse,
      RelayState: "valid-state",
    });
  });

  it("should reject a response whose InResponseTo does not match the request ID", async () => {
    await expect(
      samlModule.processSAMLResponse(
        encodeSAMLResponse("attacker-request"),
        "valid-state",
        undefined,
        "expected-request",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should reject a response with no InResponseTo when a request ID is expected", async () => {
    await expect(
      samlModule.processSAMLResponse(
        encodeSAMLResponse(),
        "valid-state",
        undefined,
        "expected-request",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
