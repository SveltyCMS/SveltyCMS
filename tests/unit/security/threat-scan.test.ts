/**
 * @file tests/unit/security/threat-scan.test.ts
 * @description
 * Linear ReDoS-safe threat scanner coverage: WAF inspect, payload threat
 * levels, honeypot prefixes, scanner UA tokens, and pathological inputs.
 */

import { describe, it, expect } from "vitest";
import {
  decodeIfEncoded,
  inspectRequest,
  isAiOrScannerBot,
  isCleanRequestSurface,
  isHoneypotPath,
  scanPayload,
  scanUrl,
  scanUserAgent,
  splitRequestUrl,
} from "@src/services/security/threat-scan";

describe("threat-scan linear WAF", () => {
  it("treats ordinary collection URLs as a clean surface", () => {
    expect(isCleanRequestSurface("/api/collections/posts")).toBe(true);
    expect(isCleanRequestSurface("?limit=10")).toBe(true);
    expect(isCleanRequestSurface("/api/collections/posts?limit=10")).toBe(true);
    expect(isCleanRequestSurface("id=1; DROP TABLE x")).toBe(false);
    expect(isCleanRequestSurface("/api/files/../../etc/passwd")).toBe(false);
  });

  it("allows clean collection reads", () => {
    const result = inspectRequest("/api/user/profile", "locale=en&page=1", {
      host: "localhost:5173",
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks path traversal (raw and encoded)", () => {
    const raw = inspectRequest("/api/files/../../etc/passwd", "", {});
    expect(raw.blocked).toBe(true);
    expect(raw.threatType).toBe("PATH_TRAVERSAL");

    const encoded = inspectRequest("/api/files", "file=%2e%2e%2fconfig.json", {});
    expect(encoded.blocked).toBe(true);
    expect(encoded.threatType).toBe("PATH_TRAVERSAL");
  });

  it("blocks prototype pollution, XSS, SQLi, and header splitting", () => {
    expect(inspectRequest("/api/update", "__proto__[isAdmin]=true", {}).threatType).toBe(
      "PROTOTYPE_POLLUTION",
    );
    expect(inspectRequest("/api/search", "q=<script>alert(1)</script>", {}).threatType).toBe("XSS");
    expect(inspectRequest("/api/user", "avatar=javascript:alert(1)", {}).threatType).toBe("XSS");
    expect(
      inspectRequest("/api/content", "id=1%20UNION%20SELECT%20*%20FROM%20users", {}).threatType,
    ).toBe("SQLI");
    expect(
      inspectRequest("/api/content", "id=1; DROP TABLE collection_posts;", {}).threatType,
    ).toBe("SQLI");
    expect(
      inspectRequest("/api/headers", "", {
        "x-custom-header": "test\r\nSet-Cookie: session=evil",
      }).threatType,
    ).toBe("HEADER_SPLITTING");
  });

  it("returns quickly on pathological ReDoS bait", () => {
    const bait = `${"select ".repeat(400)}${"a".repeat(4000)} from ${"b".repeat(4000)} where`;
    const start = performance.now();
    inspectRequest("/api/search", `q=${bait}`, {});
    scanPayload(bait);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(25);
  });
});

describe("threat-scan payload / UA / URL", () => {
  it("flags quote-bearing payloads as critical SQLi (AuthGuard semantics)", () => {
    expect(scanPayload("O'Brien")).toBe("critical");
    expect(scanPayload("'; DROP TABLE users; --")).toBe("critical");
  });

  it("flags XSS and traversal at high", () => {
    expect(scanPayload("<script>alert(1)</script>")).toBe("high");
    expect(scanPayload("../../etc/passwd")).toBe("high");
  });

  it("allows clean ASCII URLs without decoding", () => {
    expect(decodeIfEncoded("/api/collections/posts?limit=10")).toBe(
      "/api/collections/posts?limit=10",
    );
    expect(scanPayload("/api/collections/posts?limit=10")).toBe("none");
  });

  it("detects scanner UAs and credential query keys", () => {
    expect(scanUserAgent("sqlmap/1.7")).toBe("high");
    expect(scanUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("none");
    expect(scanUrl("/api/users?password=secret")).toBe("high");
    expect(scanUrl("/api/collections?limit=10")).toBe("none");
  });

  it("classifies honeypot paths and AI/scanner bots", () => {
    expect(isHoneypotPath("/wp-admin")).toBe(true);
    expect(isHoneypotPath("/.git/HEAD")).toBe(true);
    expect(isHoneypotPath("/api/collections")).toBe(false);
    expect(isAiOrScannerBot("sqlmap/1.7")).toBe(true);
    expect(isAiOrScannerBot("Mozilla/5.0")).toBe(false);
  });

  it("splits request URLs without new URL()", () => {
    expect(splitRequestUrl("http://localhost/api/collections/posts?limit=10")).toEqual({
      pathname: "/api/collections/posts",
      search: "?limit=10",
    });
    expect(splitRequestUrl("http://localhost/api/files/../../etc/passwd").pathname).toBe(
      "/api/files/../../etc/passwd",
    );
  });
});
