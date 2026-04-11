/**
 * @file tests/unit/api/security.test.ts
 * @description Unit tests for unified security API endpoints, focusing on stats and reporting.
 */
/**
 * @file tests/unit/api/security.test.ts
 */

import type {} from "vitest";

const vi = (globalThis as any).vi;

// 2. Import handlers and services dynamically AFTER mocks
const { GET: getStats } = await import("@src/routes/api/security/stats/+server");
const { POST: postCspReport } = await import("@src/routes/api/security/csp-report/+server");

// Import services for verification in tests - dynamic for mocking
const { metricsService: testMetricsService } = await import("@src/services/metrics-service");
const { securityResponseService: testSecurityService } =
  await import("@src/services/security-response-service");

describe("Security API Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock behaviors for this test file
    (testMetricsService.getReport as any).mockReturnValue({
      security: {
        rateLimitViolations: 5,
        cspViolations: 10,
        authFailures: 2,
      },
    });

    (testSecurityService.getSecurityStats as any).mockResolvedValue({
      activeIncidents: 10,
      totalIncidentsLast24h: 50,
      threatDistribution: { low: 5, medium: 2, high: 2, critical: 1 },
    });

    (testSecurityService.getActiveIncidents as any).mockResolvedValue([]);
  });

  describe("GET /api/security/stats", () => {
    it("should return security stats for authorized admin", async () => {
      const event = {
        locals: {
          user: { _id: "admin1", role: "admin" },
        },
      } as any;

      const response = await getStats(event);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.overallStatus).toBeDefined();
      expect(data.activeIncidents).toBeDefined();
    });

    it("should reject unauthorized access", async () => {
      const event = {
        locals: {
          user: { _id: "user1", role: "user" },
        },
      } as any;

      const response = await getStats(event);
      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/security/csp-report", () => {
    it("should record CSP violation with tenant context", async () => {
      const report = {
        "csp-report": {
          "document-uri": "http://localhost/page",
          "violated-directive": "script-src",
          "original-policy": "script-src 'self'",
          "blocked-uri": "http://evil.com/malicious.js",
          disposition: "enforce",
        },
      };

      const event = {
        request: {
          headers: {
            get: (name: string) => (name === "content-type" ? "application/csp-report" : null),
          },
          json: vi.fn().mockResolvedValue(report),
        },
        locals: { tenantId: "tenant1" },
        getClientAddress: () => "127.0.0.1",
      } as any;

      const response = await postCspReport(event);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("received");

      // Verify it tracked the violation
      expect(testMetricsService.incrementCSPViolations).toHaveBeenCalledWith("tenant1");
    });

    it("should ignore false positives", async () => {
      (testMetricsService.incrementCSPViolations as any).mockClear();

      const report = {
        "csp-report": {
          "document-uri": "http://localhost/page",
          "violated-directive": "script-src",
          "original-policy": "script-src 'self'",
          "blocked-uri": "chrome-extension://mgijgjocnepluclmbiolglitmbebeonv/script.js",
          disposition: "enforce",
        },
      };

      const event = {
        request: {
          headers: {
            get: (name: string) => (name === "content-type" ? "application/csp-report" : null),
          },
          json: vi.fn().mockResolvedValue(report),
        },
        getClientAddress: () => "127.0.0.1",
        locals: { tenantId: "tenant1" },
      } as any;

      const response = await postCspReport(event);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("ignored");
      expect(testMetricsService.incrementCSPViolations).not.toHaveBeenCalled();
    });
  });
});
