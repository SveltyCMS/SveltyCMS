/**
 * @file tests/unit/scripts/verify-prod-build-backdoor.test.ts
 * @description Unit tests for the build gates: testing-API backdoor markers,
 * the client-bundle secret scanner (key list built from `ALL_FORBIDDEN_KEYS`),
 * the harness-config requirement, and the deploy sourcemap gate.
 *
 * No build output is required — every scan helper accepts an explicit directory,
 * so the tests use temp dirs and never touch `build/` or `config/`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_FORBIDDEN_KEYS } from "../../../scripts/security/scan-secret-misuse";
import {
  SECRET_LITERAL_RE,
  buildSecretLiteralRe,
  clientSecretScan,
  collectFiles,
  findSecretLeaks,
  findSourcemaps,
  getMode,
  inspectChunk,
  isDeployStrict,
  readHarnessSecrets,
  sourcemapGateFails,
} from "../../../scripts/security/verify-prod-build-backdoor";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "svelty-backdoor-"));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(dir: string, relativePath: string, content: string): string {
  const full = join(dir, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe("inspectChunk", () => {
  it("flags the real testing handler body", () => {
    const verdict = inspectChunk(
      'throw new AppError("Unauthorized: Testing endpoints are disabled", 401)',
    );
    expect(verdict).toEqual({ full: true, stub: false });
  });

  it("flags the noop stub injected by testBackdoorStripperPlugin", () => {
    const verdict = inspectChunk(
      'export const POST=()=>new Response("Not Found",{status:404});export const SVELTY_TEST_BACKDOOR_STRIPPED=true;',
    );
    expect(verdict).toEqual({ full: false, stub: true });
  });

  it("does not treat the NAMESPACE_CONFIG name alone as the full handler", () => {
    const verdict = inspectChunk(
      'testing:{handler:"testing",fn:"handleTestingRoutes"};export const SVELTY_TEST_BACKDOOR_STRIPPED=true;',
    );
    expect(verdict).toEqual({ full: false, stub: true });
  });

  it("returns no markers for unrelated chunks", () => {
    expect(inspectChunk("export const foo = 1")).toEqual({ full: false, stub: false });
  });
});

describe("getMode", () => {
  it("defaults to the deploy gate and honours --mode=bench", () => {
    expect(getMode([])).toBe("deploy");
    expect(getMode(["--mode=deploy"])).toBe("deploy");
    expect(getMode(["--mode=bench"])).toBe("bench");
  });
});

describe("buildSecretLiteralRe", () => {
  it("escapes regex metacharacters in key names", () => {
    const re = buildSecretLiteralRe(["A+B", "C.D"]);
    expect(re.test('A+B: "some-value"')).toBe(true);
    expect(re.test('C.D="some-value"')).toBe(true);
    expect(re.test("AXB: 'some-value'")).toBe(false);
  });

  it("requires a value-shaped literal, not a bare key mention", () => {
    const re = buildSecretLiteralRe(["SMTP_PASS"]);
    expect(re.test('SMTP_PASS:"abc12345"')).toBe(true);
    expect(re.test('{key:"SMTP_PASS",label:"SMTP"}')).toBe(false);
    expect(re.test('SMTP_PASS:"short"')).toBe(false);
  });

  it("covers every ALL_FORBIDDEN_KEYS entry", () => {
    for (const key of ALL_FORBIDDEN_KEYS) {
      expect(SECRET_LITERAL_RE.test(`${key}:"value-1234"`), `uncovered key: ${key}`).toBe(true);
    }
  });

  it("covers keys the old hand-written list missed", () => {
    expect(SECRET_LITERAL_RE.test('SMTP_PASS:"smtp-secret-value"')).toBe(true);
    expect(SECRET_LITERAL_RE.test("CF_API_TOKEN: 'cf-token-value'")).toBe(true);
  });
});

describe("readHarnessSecrets", () => {
  it("reports a missing harness config instead of pretending it is empty", () => {
    expect(readHarnessSecrets(join(makeTempDir(), "absent.ts"))).toEqual({
      secrets: [],
      present: false,
    });
  });

  it("extracts secret values but skips non-secret bootstrap keys", () => {
    const dir = makeTempDir();
    const configPath = writeFixture(
      dir,
      "private.test.ts",
      [
        "export const privateEnv = {",
        '  DB_NAME: "e2e_auth_test",',
        '  JWT_SECRET_KEY: "Integration-Test-JWT-Secret-Key-2026",',
        '  SMTP_PASS: "smtp-pass-value",',
        "};",
      ].join("\n"),
    );

    const { secrets, present } = readHarnessSecrets(configPath);
    expect(present).toBe(true);
    expect(secrets.map((s) => s.key).sort()).toEqual(["JWT_SECRET_KEY", "SMTP_PASS"]);
  });
});

describe("findSecretLeaks", () => {
  it("scans .js, .html and .map client artifacts for harness values", () => {
    const dir = makeTempDir();
    const value = "harness-secret-value";
    writeFixture(dir, "_app/immutable/chunks/a.js", `const x={TEST_API_SECRET:"${value}"};`);
    writeFixture(dir, "index.html", `<script>window.s={TEST_API_SECRET:"${value}"}</script>`);
    writeFixture(
      dir,
      "_app/immutable/chunks/a.js.map",
      JSON.stringify({ version: 3, sourcesContent: [`TEST_API_SECRET:"${value}"`] }),
    );
    writeFixture(dir, "clean.js", "export const ok = 1;");

    const files = collectFiles(dir, [".js", ".html", ".json", ".map"]);
    const leaks = findSecretLeaks(files, [{ key: "TEST_API_SECRET", value }], dir);
    expect(leaks.map((l) => l.file).sort()).toEqual([
      "_app/immutable/chunks/a.js",
      "_app/immutable/chunks/a.js.map",
      "index.html",
    ]);
    expect(leaks[0].what).toContain("TEST_API_SECRET");
  });

  it("flags an inlined secret literal even without a harness config", () => {
    const dir = makeTempDir();
    writeFixture(dir, "chunk.js", 'const cfg={CF_API_TOKEN:"cf-token-value"};');

    const leaks = findSecretLeaks(collectFiles(dir, [".js"]), [], dir);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].what).toContain("CF_API_TOKEN");
  });
});

describe("findSourcemaps", () => {
  it("finds nested client sourcemaps and ignores other extensions", () => {
    const dir = makeTempDir();
    writeFixture(dir, "_app/immutable/chunks/a.js", "export const a = 1;");
    writeFixture(dir, "_app/immutable/chunks/a.js.map", "{}");
    writeFixture(dir, "deep/nested/b.js.map", "{}");

    const jsFiles = collectFiles(dir, [".js"]).map((f) => f.replace(dir, "").replace(/\\/g, "/"));
    expect(jsFiles).toEqual(["/_app/immutable/chunks/a.js"]);
    expect(findSourcemaps(dir)).toHaveLength(2);
  });

  it("returns an empty list when the client build has no maps", () => {
    expect(findSourcemaps(join(makeTempDir(), "missing"))).toEqual([]);
  });
});

describe("clientSecretScan", () => {
  const absent = { secrets: [], present: false };

  it("fails the deploy gate when the harness config is absent", () => {
    const result = clientSecretScan([], absent, "deploy");
    expect(result.error).toContain("config/private.test.ts is missing");
    expect(result.warning).toBeNull();
  });

  it("only warns outside deploy mode so a dev build is not blocked", () => {
    const result = clientSecretScan([], absent, "bench");
    expect(result.error).toBeNull();
    expect(result.warning).toContain("key-name literals only");
  });

  it("passes silently once the harness config is present and the bundle is clean", () => {
    const dir = makeTempDir();
    writeFixture(dir, "chunk.js", "export const ok = 1;");
    const result = clientSecretScan(
      collectFiles(dir, [".js"]),
      { secrets: [{ key: "JWT_SECRET_KEY", value: "some-secret-value" }], present: true },
      "deploy",
      dir,
    );
    expect(result).toEqual({ leaks: [], error: null, warning: null });
  });
});

describe("sourcemapGateFails", () => {
  it("fails any deploy artifact that ships .map files", () => {
    expect(sourcemapGateFails(1, "deploy", {})).toBe(true);
    expect(sourcemapGateFails(375, "deploy", {})).toBe(true);
  });

  it("fails bench builds on CI/production but allows local benchmark builds", () => {
    expect(sourcemapGateFails(1, "bench", {})).toBe(false);
    expect(sourcemapGateFails(1, "bench", { CI: "true" })).toBe(true);
    expect(sourcemapGateFails(1, "bench", { NODE_ENV: "production" })).toBe(true);
  });

  it("passes when the artifact carries no maps", () => {
    expect(sourcemapGateFails(0, "deploy", { CI: "true" })).toBe(false);
  });
});

describe("isDeployStrict", () => {
  it("is strict for the deploy gate in any environment", () => {
    expect(isDeployStrict("deploy", {})).toBe(true);
    expect(isDeployStrict("deploy", { CI: "false" })).toBe(true);
  });

  it("is strict for bench builds on CI or in production", () => {
    expect(isDeployStrict("bench", {})).toBe(false);
    expect(isDeployStrict("bench", { CI: "true" })).toBe(true);
    expect(isDeployStrict("bench", { NODE_ENV: "production" })).toBe(true);
  });
});
