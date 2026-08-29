/**
 * @file tests/unit/utils/theme-merge.test.ts
 * @description Regression tests for the CSS style-injection guard in
 * resolveLoginBranding (sanitizeCss) — scriptable CSS payloads are blocked,
 * harmless custom CSS passes through.
 */

import { describe, it, expect } from "vitest";
import { resolveLoginBranding, type TenantAdminThemeConfig } from "@src/utils/theme-merge";

function branded(customCss: string): TenantAdminThemeConfig {
  return {
    name: "test",
    features: { brandedLogin: true },
    customCss,
  };
}

describe("resolveLoginBranding — CSS style-injection guard", () => {
  it("blocks javascript: in url()", () => {
    const out = resolveLoginBranding(branded("body{background:url(javascript:alert(1))}"), "X");
    expect(out.customCss).toBeUndefined();
  });

  it("blocks vbscript: in url()", () => {
    const out = resolveLoginBranding(branded("body{background:url(vbscript:msgbox(1))}"), "X");
    expect(out.customCss).toBeUndefined();
  });

  it("blocks data:image/svg+xml and data:text/html", () => {
    expect(
      resolveLoginBranding(branded("body{background:url(data:image/svg+xml;base64,PHN2Zz4=)}"), "X")
        .customCss,
    ).toBeUndefined();
    expect(
      resolveLoginBranding(branded("body{background:url(data:text/html;base64,PHNjcmlwdD4=)}"), "X")
        .customCss,
    ).toBeUndefined();
  });

  it("blocks IE expression()", () => {
    expect(
      resolveLoginBranding(branded("body{width:expression(alert(1))}"), "X").customCss,
    ).toBeUndefined();
  });

  it("keeps harmless custom CSS", () => {
    const css = "body{background:#fff;color:#333} .btn{color:red}";
    expect(resolveLoginBranding(branded(css), "X").customCss).toBe(css);
  });

  it("keeps harmless data: URI fonts (not image/svg or text/html)", () => {
    const css = "@font-face{src:url(data:font/woff2;base64,d09GMg==) format('woff2')}";
    expect(resolveLoginBranding(branded(css), "X").customCss).toBe(css);
  });
});
