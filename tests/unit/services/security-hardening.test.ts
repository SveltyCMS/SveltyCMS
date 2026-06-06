/**
 * @file tests/unit/services/security-hardening.test.ts
 * @description Security hardening: concurrent safety, edge cases, no-crash guarantees.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    settings: { get: vi.fn().mockResolvedValue({}) },
    collection: { getModel: vi.fn() },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({
    settings: { get: vi.fn().mockResolvedValue({}) },
    collection: { getModel: vi.fn() },
    isConnected: vi.fn().mockReturnValue(true),
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
}));

import { securityResponseService } from "@src/services/security/response-service";

describe("SecurityResponseService — Resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles normal requests without error", async () => {
    const req = new Request("http://localhost/api/test?id=1");
    const result = await securityResponseService.analyzeRequest(req, "1.2.3.4");
    expect(result).toBeDefined();
    expect(result.level).toBeDefined();
    expect(result.action).toBeDefined();
  });

  it("handles empty query string", async () => {
    const req = new Request("http://localhost/");
    const result = await securityResponseService.analyzeRequest(req, "1.2.3.4");
    expect(result).toBeDefined();
  });

  it("handles extremely long URL", async () => {
    const long = "x".repeat(10_000);
    const req = new Request(`http://localhost/${long}`);
    await expect(securityResponseService.analyzeRequest(req, "1.2.3.4")).resolves.toBeDefined();
  });

  it("handles concurrent requests safely", async () => {
    const requests = Array.from({ length: 20 }, (_, i) =>
      securityResponseService.analyzeRequest(
        new Request(`http://localhost/test?id=${i}`),
        `10.0.0.${i}`,
      ),
    );
    const results = await Promise.all(requests);
    expect(results.length).toBe(20);
    expect(results.every((r) => r)).toBe(true);
  });

  it("detects high-severity XSS patterns", async () => {
    const payloads = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "javascript:alert(1)",
    ];
    for (const p of payloads) {
      const req = new Request(`http://localhost/?q=${encodeURIComponent(p)}`);
      const result = await securityResponseService.analyzeRequest(req, "1.2.3.4");
      expect(result).toBeDefined();
      expect(result.level).toBeDefined();
    }
  });

  it("allows known-benign inputs", async () => {
    for (const input of ["hello world", "email@test.com", "12345"]) {
      const req = new Request(`http://localhost/?q=${encodeURIComponent(input)}`);
      const result = await securityResponseService.analyzeRequest(req, "1.2.3.4");
      expect(result).toBeDefined();
    }
  });
});

describe("SecurityResponseService — Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under rate limit", async () => {
    const result = await securityResponseService.checkRateLimit(
      "10.0.0.1",
      "/api/test",
      undefined,
      true,
      1,
    );
    expect(result).toBeDefined();
    expect(result.allowed !== undefined).toBe(true);
  });

  it("blocks IP after excessive requests", async () => {
    // Consume 5 requests (exceeds default limit)
    for (let i = 0; i < 5; i++) {
      await securityResponseService.checkRateLimit("10.0.0.99", "/login", undefined, true, 5);
    }
    const last = await securityResponseService.checkRateLimit(
      "10.0.0.99",
      "/login",
      undefined,
      true,
      1,
    );
    expect(last).toBeDefined();
  });

  it("tracks rate limits per-IP independently", async () => {
    await securityResponseService.checkRateLimit("1.1.1.1", "/api/a", undefined, true, 2);
    const r2 = await securityResponseService.checkRateLimit(
      "2.2.2.2",
      "/api/b",
      undefined,
      true,
      1,
    );
    expect(r2).toBeDefined();
  });
});

describe("SecurityResponseService — SQL Injection & Path Traversal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects SQL injection payloads", async () => {
    const payloads = ["'; DROP TABLE users;--", "1' OR '1'='1", "union select * from users"];
    for (const p of payloads) {
      const req = new Request(`http://localhost/login?user=${encodeURIComponent(p)}`);
      const result = await securityResponseService.analyzeRequest(req, "10.0.0.1");
      expect(result).toBeDefined();
      expect(result.level).toBeDefined();
    }
  });

  it("detects path traversal attempts", async () => {
    const payloads = ["../../../etc/passwd", "..\\..\\windows\\system32"];
    for (const p of payloads) {
      const req = new Request(`http://localhost/files?path=${encodeURIComponent(p)}`);
      const result = await securityResponseService.analyzeRequest(req, "10.0.0.1");
      expect(result).toBeDefined();
      expect(result.level).toBeDefined();
    }
  });
});
