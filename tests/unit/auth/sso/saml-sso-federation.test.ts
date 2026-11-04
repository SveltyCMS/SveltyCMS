/**
 * @file tests/unit/auth/sso/saml-sso-federation.test.ts
 * @description Unit tests for SAML 2.0 Enterprise SSO Federation and Public Provider discovery.
 *
 * ### Features:
 * - SAML configuration detection via isSamlConfigured
 * - Automatic discovery and registration of SAML SSO provider in getPublicSsoProviders
 * - Tenant-scoped ACS and Login endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSamlConfigured } from "@src/databases/auth/saml-auth";
import { getPublicSsoProviders } from "@src/databases/auth/sso-session";

describe("SAML 2.0 Enterprise SSO Federation", () => {
  const originalEntryPoint = process.env.SAML_ENTRY_POINT;

  beforeEach(() => {
    delete process.env.SAML_ENTRY_POINT;
  });

  afterEach(() => {
    if (originalEntryPoint) {
      process.env.SAML_ENTRY_POINT = originalEntryPoint;
    } else {
      delete process.env.SAML_ENTRY_POINT;
    }
  });

  it("detects when SAML is not configured", () => {
    expect(isSamlConfigured()).toBe(false);
    const providers = getPublicSsoProviders();
    expect(providers.some((p) => p.id === "saml")).toBe(false);
  });

  it("registers SAML provider when SAML_ENTRY_POINT is active", () => {
    process.env.SAML_ENTRY_POINT = "https://idp.okta.com/app/sveltycms/sso/saml";

    expect(isSamlConfigured()).toBe(true);

    const providers = getPublicSsoProviders("tenant-corp");
    const samlProvider = providers.find((p) => p.id === "saml");

    expect(samlProvider).toBeDefined();
    expect(samlProvider?.name).toBe("Enterprise SSO (SAML)");
    expect(samlProvider?.icon).toBe("mdi:shield-account-outline");
    expect(samlProvider?.authUrl).toContain("/api/auth/saml/login?tenant=tenant-corp");
  });
});
