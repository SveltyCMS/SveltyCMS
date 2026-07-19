/**
 * @file tests/unit/utils/client-csrf.test.ts
 * @description Unit tests for clientJsonHeaders CSRF builder.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clientJsonHeaders } from "../../../src/utils/security/client-csrf";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

describe("clientJsonHeaders", () => {
  let cookieValue = "";

  beforeEach(() => {
    cookieValue = "";
    stubDocumentCookie(
      () => cookieValue,
      (v) => {
        cookieValue = v;
      },
    );
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it("always sets Content-Type", () => {
    expect(clientJsonHeaders(null)["Content-Type"]).toBe("application/json");
  });

  it("uses explicit csrfToken when provided", () => {
    const h = clientJsonHeaders("explicit-token");
    expect(h["X-CSRF-Token"]).toBe("explicit-token");
  });

  it("reads plain csrf_token cookie", () => {
    cookieValue = "csrf_token=cookie-tok; other=1";
    expect(clientJsonHeaders()["X-CSRF-Token"]).toBe("cookie-tok");
  });

  it("prefers __Host-csrf_token", () => {
    cookieValue = "__Host-csrf_token=host-tok; csrf_token=plain";
    expect(clientJsonHeaders()["X-CSRF-Token"]).toBe("host-tok");
  });
});
