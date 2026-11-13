/**
 * @file tests/unit/scripts/scan-secret-misuse.test.ts
 * @description Fixtures for the secret misuse scanner: forbidden key access,
 * exposure patterns, comment handling, multi-line splits and hardcoded
 * credential comparisons.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_FORBIDDEN_KEYS,
  isServerFile,
  scanSource,
} from "../../../scripts/security/scan-secret-misuse";

/** Scan a fixture as a client-side source file (never allowlisted). */
const scan = (source: string, path = "src/lib/fixture.ts") => scanSource(source, path);

const messages = (source: string, path?: string) => scan(source, path).map((f) => f.message);

const repeat = (char: string, length: number) => char.repeat(length);

describe("ALL_FORBIDDEN_KEYS", () => {
  it("exports the canonical secret env/key names", () => {
    for (const key of [
      "DB_PASSWORD",
      "JWT_SECRET_KEY",
      "ENCRYPTION_KEY",
      "SMTP_PASS",
      "SMTP_PASSWORD",
      "REDIS_PASSWORD",
      "SAML_CLIENT_SECRET_VERIFIER",
      "GOOGLE_CLIENT_SECRET",
      "CF_API_TOKEN",
      "CLOUDFLARE_API_TOKEN",
      "AWS_SECRET_ACCESS_KEY",
      "S3_SECRET_ACCESS_KEY",
      "R2_SECRET_ACCESS_KEY",
    ]) {
      expect(ALL_FORBIDDEN_KEYS).toContain(key);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(ALL_FORBIDDEN_KEYS).size).toBe(ALL_FORBIDDEN_KEYS.length);
  });
});

describe("isServerFile", () => {
  it("accepts server-only module suffixes", () => {
    expect(isServerFile("src/db/index.server.ts")).toBe(true);
    expect(isServerFile("src/hooks.ws.ts")).toBe(true);
    expect(isServerFile("src/routes/login/auth.remote.ts")).toBe(true);
  });

  it("accepts server-only path segments", () => {
    expect(isServerFile("src/hooks/auth.ts")).toBe(true);
    expect(isServerFile("src/routes/api/+server.ts")).toBe(true);
    expect(isServerFile("src/databases/db.ts")).toBe(true);
  });

  it("rejects client components and pages", () => {
    expect(isServerFile("src/routes/+page.svelte")).toBe(false);
    expect(isServerFile("src/components/btn.svelte")).toBe(false);
  });
});

describe("forbidden key access", () => {
  it("flags getPrivateSettingSync in a non-server file", () => {
    const found = scan('const s = getPrivateSettingSync("DB_PASSWORD");', "src/lib/bad.ts");
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("DB_PASSWORD");
  });

  it("flags the async getPrivateSetting in a non-server file", () => {
    const found = scan('const k = await getPrivateSetting("JWT_SECRET_KEY");', "src/lib/bad.ts");
    expect(found).toHaveLength(1);
  });

  it("skips server files", () => {
    expect(messages('getPrivateSettingSync("DB_PASSWORD");', "src/hooks/auth.ts")).toEqual([]);
  });

  it("does not flag public settings", () => {
    expect(messages('getPublicSettingSync("SITE_NAME");', "src/components/info.ts")).toEqual([]);
  });
});

describe("exposure patterns", () => {
  it("flags console.log of DB_PASSWORD", () => {
    expect(messages('console.log("DB_PASSWORD=", val);')).toHaveLength(1);
  });

  it("flags a hardcoded sck_ key", () => {
    expect(messages(`const k = "sck_${repeat("a", 40)}";`).length).toBeGreaterThanOrEqual(1);
  });

  it("ignores innocent logs", () => {
    expect(messages('console.log("User logged in");')).toEqual([]);
  });
});

describe("comment handling", () => {
  it("still reports a token inside an https:// URL", () => {
    const source = `const u = "https://x.example.com/cb?access_token=ghp_${repeat("a", 36)}";`;
    expect(messages(source).some((m) => m.includes("GitHub Token (classic)"))).toBe(true);
  });

  it("does not report a clean https:// URL", () => {
    expect(scan('const u = "https://example.com/api/v1/health";')).toEqual([]);
  });

  it("skips a match inside a trailing line comment", () => {
    expect(scan(`const port = 5432; // ghp_${repeat("a", 36)}`)).toEqual([]);
  });

  it("skips a match inside a block comment", () => {
    expect(scan(`/* legacy: ghp_${repeat("a", 36)} */`)).toEqual([]);
  });
});

describe("multi-line secrets", () => {
  it("reports a PEM header split across a concatenation", () => {
    const source = [
      'const pem = "-----BEGIN RSA " +',
      '  "PRIVATE KEY-----\\nMIIEowIBAAKCAQEA";',
    ].join("\n");
    const found = scan(source);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(1);
    expect(found[0].message).toContain("Private Key Block");
  });

  it("still reports a single-line PEM header", () => {
    expect(messages('const pem = "-----BEGIN PRIVATE KEY-----";')).toHaveLength(1);
  });

  it("reports a Stripe key split across a concatenation", () => {
    const source = 'const k = "sk_live_" + "0123456789abcdefghijklmn";';
    const found = scan(source);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("Stripe Live Secret");
  });
});

describe("hardcoded credential comparisons", () => {
  it("flags the postfix comparison", () => {
    expect(messages('if (password === "hunter2") {')).toHaveLength(1);
  });

  it("flags the Yoda comparison", () => {
    expect(messages('if ("hunter2" === password) {')).toHaveLength(1);
  });

  it("flags .includes with a literal", () => {
    expect(messages('if (token.includes("hardcoded-secret")) {')).toHaveLength(1);
  });

  it("accepts a hash-algorithm prefix check", () => {
    expect(scan('if (!password.startsWith("$argon2")) {')).toEqual([]);
  });

  it("accepts a typeof guard", () => {
    expect(scan('if (typeof password === "string") {')).toEqual([]);
  });
});

describe("credential shapes", () => {
  it("flags a DB connection string with embedded credentials", () => {
    expect(messages('const db = "postgres://admin:s3cretPass@db.internal:5432/cms";')).toContain(
      "Hardcoded DB Connection String detected",
    );
  });

  it("ignores a DB URL built from template interpolation", () => {
    expect(scan("const url = `mongodb://${user}:${encoded}@${host}:${port}`;")).toEqual([]);
  });

  it("flags a SendGrid key", () => {
    const key = `SG.${repeat("a", 22)}.${repeat("b", 43)}`;
    expect(messages(`const key = "${key}";`)).toContain("Hardcoded SendGrid API Key detected");
  });

  it("flags a Resend key", () => {
    expect(messages(`const key = "re_${repeat("a", 24)}";`)).toContain(
      "Hardcoded Resend API Key detected",
    );
  });

  it("flags an npm token", () => {
    expect(messages(`const key = "npm_${repeat("a", 36)}";`)).toContain(
      "Hardcoded npm Token detected",
    );
  });
});
