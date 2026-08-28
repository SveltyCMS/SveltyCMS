/**
 * @file tests/unit/security/handle-waf-guard.test.ts
 * @description
 * Unit tests for WafGuard security middleware.
 *
 * Verifies detection and blocking of path traversal, prototype pollution, XSS payloads,
 * SQL injection attempts, and header splitting patterns.
 */

import { describe, it, expect } from "vitest";
import { WafGuard } from "@src/hooks/handle-waf-guard";

describe("WafGuard (Layer 0 WAF Middleware)", () => {
  const waf = new WafGuard();

  it("passes clean requests without blocking", () => {
    const result = waf.inspectRequest("/api/user/profile", "locale=en&page=1", {
      host: "localhost:5173",
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks path traversal attacks in URL and query strings", () => {
    const res1 = waf.inspectRequest("/api/files/../../etc/passwd", "", {});
    expect(res1.blocked).toBe(true);
    expect(res1.threatType).toBe("PATH_TRAVERSAL");

    const res2 = waf.inspectRequest("/api/files", "file=%2e%2e%2fconfig.json", {});
    expect(res2.blocked).toBe(true);
    expect(res2.threatType).toBe("PATH_TRAVERSAL");
  });

  it("blocks prototype pollution payload keys", () => {
    const res = waf.inspectRequest("/api/update", "__proto__[isAdmin]=true", {});
    expect(res.blocked).toBe(true);
    expect(res.threatType).toBe("PROTOTYPE_POLLUTION");
  });

  it("blocks XSS script injection payloads", () => {
    const res1 = waf.inspectRequest("/api/search", "q=<script>alert(1)</script>", {});
    expect(res1.blocked).toBe(true);
    expect(res1.threatType).toBe("XSS");

    const res2 = waf.inspectRequest("/api/user", "avatar=javascript:alert(1)", {});
    expect(res2.blocked).toBe(true);
    expect(res2.threatType).toBe("XSS");
  });

  it("blocks SQL injection payloads", () => {
    const res1 = waf.inspectRequest("/api/content", "id=1%20UNION%20SELECT%20*%20FROM%20users", {});
    expect(res1.blocked).toBe(true);
    expect(res1.threatType).toBe("SQLI");

    const res2 = waf.inspectRequest("/api/content", "id=1; DROP TABLE collection_posts;", {});
    expect(res2.blocked).toBe(true);
    expect(res2.threatType).toBe("SQLI");
  });

  it("blocks header splitting attempts", () => {
    const res = waf.inspectRequest("/api/headers", "", {
      "x-custom-header": "test\r\nSet-Cookie: session=evil",
    });
    expect(res.blocked).toBe(true);
    expect(res.threatType).toBe("HEADER_SPLITTING");
  });

  it("memoizes scan results on event.locals to ensure WAF runs only once per request", () => {
    const mockEvent: any = {
      url: new URL("http://localhost:5173/api/collections/posts"),
      request: { headers: new Headers({ host: "localhost:5173" }) },
      locals: {},
    };

    const first = waf.inspectEvent(mockEvent);
    expect(first.blocked).toBe(false);
    expect(mockEvent.locals.__wafCheck).toBe(first);

    // Subsequent calls return exact same object reference from locals
    const second = waf.inspectEvent(mockEvent);
    expect(second).toBe(first);
  });

  it("executes automated payload fuzzing with 100% WAF resilience", async () => {
    const { runFuzzAudit } = await import("../../../scripts/security/fuzzer");
    const result = runFuzzAudit();
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.blockedByWaf).toBeGreaterThan(0);
    expect(result.passed).toBe(result.iterations);
  });
});
