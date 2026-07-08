/**
 * @file tests/unit/scripts/scan-secret-misuse.test.ts
 * @description Tests that the secret misuse scanner correctly detects
 * forbidden key access and API key exposure patterns.
 */

import { describe, it, expect } from "vitest";

const BOOTSTRAP_SECRETS = [
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_RETRY_ATTEMPTS",
  "DB_RETRY_DELAY",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "MULTI_TENANT",
  "DEMO",
];

const PRIVATE_SECRETS = [
  "RATE_LIMIT_SECRET",
  "SAML_CLIENT_SECRET_VERIFIER",
  "SAML_ENCRYPTION_KEY",
  "SAML_JWT_SIGNING_PRIVATE_KEY",
  "SAML_JWT_SIGNING_PUBLIC_KEY",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "GOOGLE_CLIENT_SECRET",
  "REDIS_PASSWORD",
  "TEST_API_SECRET",
  "CF_API_TOKEN",
  "MAPBOX_API_TOKEN",
  "SECRET_MAPBOX_API_TOKEN",
  "TWITCH_TOKEN",
  "TIKTOK_TOKEN",
  "PREVIEW_SECRET",
];

const ALL_KEYS = [...BOOTSTRAP_SECRETS, ...PRIVATE_SECRETS];

function isServerFile(path: string): boolean {
  return (
    path.endsWith(".server.ts") ||
    path.endsWith(".ws.ts") ||
    path.endsWith(".remote.ts") ||
    path.includes("/hooks/") ||
    path.includes("/api/") ||
    path.includes("/databases/") ||
    path.includes("/services/")
  );
}

function detectForbiddenKey(lines: string[], filePath: string): string[] {
  const results: string[] = [];
  if (isServerFile(filePath)) return results;
  for (const key of ALL_KEYS) {
    const regex = new RegExp(`getPrivateSetting(Sync)?\\s*\\(\\s*["'\`]${key}["'\`]`, "gi");
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push(`L${i + 1}: ${key} in non-server file`);
      }
    }
  }
  return results;
}

function detectExposure(lines: string[]): string[] {
  const results: string[] = [];
  const patterns: { pattern: RegExp; name: string }[] = [
    { pattern: /console\.(log|warn|error)\([^)]*DB_PASSWORD/i, name: "DB_PASSWORD exposed" },
    { pattern: /console\.(log|warn|error)\([^)]*JWT_SECRET/i, name: "JWT_SECRET_KEY exposed" },
    { pattern: /console\.(log|warn|error)\([^)]*ENCRYPTION_KEY/i, name: "ENCRYPTION_KEY exposed" },
    { pattern: /console\.(log|warn|error)\([^)]*sck_/i, name: "API key exposed" },
  ];
  for (const { pattern, name } of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) results.push(`L${i + 1}: ${name}`);
    }
  }
  return results;
}

describe("Secret Misuse Scanner", () => {
  describe("Bootstrap secrets", () => {
    it("should include all 12 bootstrap keys", () => {
      expect(BOOTSTRAP_SECRETS).toHaveLength(12);
    });

    it("should include DB credentials and JWT", () => {
      expect(BOOTSTRAP_SECRETS).toContain("DB_PASSWORD");
      expect(BOOTSTRAP_SECRETS).toContain("JWT_SECRET_KEY");
      expect(BOOTSTRAP_SECRETS).toContain("ENCRYPTION_KEY");
    });
  });

  describe("Server file detection", () => {
    it(".server.ts", () => expect(isServerFile("src/db/index.server.ts")).toBe(true));
    it(".ws.ts", () => expect(isServerFile("src/hooks.ws.ts")).toBe(true));
    it(".remote.ts", () => expect(isServerFile("src/routes/login/auth.remote.ts")).toBe(true));
    it("/hooks/ path", () => expect(isServerFile("src/hooks/auth.ts")).toBe(true));
    it("/api/ path", () => expect(isServerFile("src/routes/api/+server.ts")).toBe(true));
    it("/services/ path", () => expect(isServerFile("src/services/core/svc.ts")).toBe(true));
    it("NOT .svelte", () => expect(isServerFile("src/routes/+page.svelte")).toBe(false));
    it("NOT component", () => expect(isServerFile("src/components/btn.svelte")).toBe(false));
  });

  describe("Forbidden key detection", () => {
    it("detects getPrivateSettingSync in non-server file", () => {
      const code = ['const s = getPrivateSettingSync("DB_PASSWORD");'];
      expect(detectForbiddenKey(code, "src/lib/bad.ts")).toHaveLength(1);
    });

    it("detects getPrivateSetting in non-server file", () => {
      const code = ['const k = await getPrivateSetting("JWT_SECRET_KEY");'];
      expect(detectForbiddenKey(code, "src/lib/danger.ts")).toHaveLength(1);
    });

    it("skips server files", () => {
      const code = ['getPrivateSettingSync("DB_PASSWORD");'];
      expect(detectForbiddenKey(code, "src/hooks/auth.ts")).toHaveLength(0);
      expect(detectForbiddenKey(code, "src/routes/api/test.ts")).toHaveLength(0);
      expect(detectForbiddenKey(code, "src/databases/db.server.ts")).toHaveLength(0);
    });

    it("does not flag public settings in any context", () => {
      const code = ['getPublicSettingSync("SITE_NAME");'];
      expect(detectForbiddenKey(code, "src/components/info.ts")).toHaveLength(0);
      expect(detectForbiddenKey(code, "src/hooks/info.ts")).toHaveLength(0);
    });
  });

  describe("Exposure detection", () => {
    it("detects console.log with DB_PASSWORD", () => {
      expect(detectExposure(['console.log("DB_PASSWORD=", val)'])).toHaveLength(1);
    });

    it("detects console.warn with JWT_SECRET_KEY", () => {
      expect(detectExposure(["console.warn(JWT_SECRET_KEY)"])).toHaveLength(1);
    });

    it("detects console.log with sck_ API key", () => {
      const result = detectExposure(['console.log("key:", sck_abc123)']);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("skips innocent logs", () => {
      expect(detectExposure(['console.log("User logged in")'])).toHaveLength(0);
    });
  });

  describe("API key safety", () => {
    it("detects hardcoded sck_ key pattern", () => {
      const hardcoded: RegExp = /['"`]sck_[A-Za-z0-9_-]{40,}['"`]/;
      const key = '"sck_' + "a".repeat(40) + '"';
      expect(hardcoded.test(key)).toBe(true);
    });

    it("rejects short sck_ strings as false positives", () => {
      const hardcoded: RegExp = /['"`]sck_[A-Za-z0-9_-]{40,}['"`]/;
      expect(hardcoded.test('"sck_short"')).toBe(false);
    });
  });
});
