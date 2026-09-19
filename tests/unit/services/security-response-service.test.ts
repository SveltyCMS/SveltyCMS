/**
 * @file tests/unit/services/security-response-service.test.ts
 * @description Unit tests for the Security Response Service
 *
 * Tests:
 * - XSS Pattern Detection
 * - SQL Injection Detection
 * - Path Traversal Detection
 * - Rate Limiting
 * - IP Blacklisting
 * - Request Analysis
 * - Response Handling
 */

// Mock database to avoid $app/environment issues
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    settings: {
      get: vi.fn().mockResolvedValue({}),
    },
    collection: { getModel: vi.fn() },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({
    settings: {
      get: vi.fn().mockResolvedValue({}),
    },
    collection: { getModel: vi.fn() },
    isConnected: vi.fn().mockReturnValue(true),
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
  dbInitPromise: Promise.resolve(),
}));

// Spy on the scan helpers (call-through) so scan counts can be asserted.
vi.mock("@src/services/security/threat-scan", { spy: true });

import { securityResponseService } from "@src/services/security/response-service";
import * as threatScan from "@src/services/security/threat-scan";

describe("SecurityResponseService", () => {
  // Helper to create a mock Request object that looks like a web Request
  const createMockRequest = (
    url: string,
    method = "GET",
    headers: Record<string, string> = {},
    body = "",
  ): Request => {
    const requestUrl = new URL(`http://localhost${url}`);
    return {
      url: requestUrl.toString(),
      method,
      headers: new Headers(headers),
      clone: () => ({
        text: async () => body,
      }),
    } as unknown as Request; // Cast to Request type
  };

  describe("XSS Pattern Detection", () => {
    test("checkValue should detect script tags in raw strings", async () => {
      // Access private method via any cast for testing
      const checkValue = (securityResponseService as any).checkValue.bind(securityResponseService);
      expect(checkValue("<script>alert(1)</script>")).toBe("high");
      expect(checkValue("javascript:alert(1)")).toBe("high");
      expect(checkValue("<img src=x onerror=alert(1)>")).toBe("high");
    });

    test("should detect simple script tags and return high status", async () => {
      const mockRequest = createMockRequest("/?q=<script>alert(1)</script>");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect script tags with attributes and return high status", async () => {
      const mockRequest = createMockRequest(
        '/?q=<script src="http://example.com/xss.js"></script>',
      );
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect script tags with whitespace in closing tag before the > and return high status", async () => {
      const mockRequest = createMockRequest("/?q=<script>alert(1)</script >");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect script tags with newline in closing tag before the > and return high status", async () => {
      const mockRequest = createMockRequest("/?q=<script>alert(1)</script\n>");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect script tags with invalid characters in closing tag before the > and return high status", async () => {
      const mockRequest = createMockRequest("/?q=<script>alert(1)</script foo>");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect javascript: protocol and return high status", async () => {
      const mockRequest = createMockRequest('/?q=<a href="javascript:alert(1)">');
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should detect onload attributes and return high status", async () => {
      const mockRequest = createMockRequest("/?q=<body onload=alert(1)>");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
    });

    test("should not have a false positive on regular text and return allow status", async () => {
      const mockRequest = createMockRequest("/?q=this is a test with script and other things");
      const status = await securityResponseService.analyzeRequest(mockRequest, "127.0.0.1");
      expect(status.level).toBe("none");
      expect(status.action).toBe("allow");
    });
  });

  describe("Scan reuse (one surface/UA pass per request)", () => {
    const isCleanSpy = vi.mocked(threatScan.isCleanRequestSurface);
    const scanUserAgentSpy = vi.mocked(threatScan.scanUserAgent);
    const MOZILLA_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

    beforeEach(() => {
      vi.clearAllMocks();
      // Production-like: the rate limiter is live, so the /api/ fast allow
      // cannot fire and the scans must be shared with analyzePayload().
      // Private field access mirrors the existing `as any` accessor style.
      (securityResponseService as any)._skipRateLimitMemo = false;
    });

    afterEach(() => {
      (securityResponseService as any)._skipRateLimitMemo = undefined;
    });

    test("clean /api/ GET stays allowed and scans once", async () => {
      const mockRequest = createMockRequest("/api/test?id=1", "GET", {
        "user-agent": MOZILLA_UA,
      });
      const status = await securityResponseService.analyzeRequest(mockRequest, "10.9.0.1");

      expect(status).toEqual({ level: "none", action: "allow" });
      // One pass over pathname + search, one UA scan — not doubled by the
      // unreachable fast-allow branch.
      expect(isCleanSpy).toHaveBeenCalledTimes(2);
      expect(scanUserAgentSpy).toHaveBeenCalledTimes(1);
    });

    test("suspicious UA is still denied and the UA scan runs once", async () => {
      const mockRequest = createMockRequest("/api/test", "GET", { "user-agent": "sqlmap/1.7" });
      const status = await securityResponseService.analyzeRequest(mockRequest, "10.9.0.2");

      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
      expect(isCleanSpy).toHaveBeenCalledTimes(2);
      expect(scanUserAgentSpy).toHaveBeenCalledTimes(1);
    });

    test("non-clean surface is still denied and the surface scans once", async () => {
      const mockRequest = createMockRequest("/?q=<script>alert(1)</script>", "GET", {
        "user-agent": MOZILLA_UA,
      });
      const status = await securityResponseService.analyzeRequest(mockRequest, "10.9.0.3");

      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
      expect(isCleanSpy).toHaveBeenCalledTimes(2);
      expect(scanUserAgentSpy).toHaveBeenCalledTimes(1);
    });

    test("denied write keeps its verdict and adds no surface scans", async () => {
      const body = JSON.stringify({ name: "<img src=x onerror=alert(1)>" });
      const mockRequest = new Request("http://localhost/api/collections", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(body.length),
          "user-agent": MOZILLA_UA,
        },
        body,
      });
      const status = await securityResponseService.analyzeRequest(mockRequest, "10.9.0.4");

      expect(status.level).toBe("high");
      expect(status.action).toBe("block");
      expect(status.reason).toContain("Suspicious payload detected");
      // Mutations never take the surface fast path; only the UA scan runs.
      expect(isCleanSpy).toHaveBeenCalledTimes(0);
      expect(scanUserAgentSpy).toHaveBeenCalledTimes(1);
    });
  });
});
