/**
 * @file tests/unit/scripts/scan-security-risk.test.ts
 * @description Unit tests for the GLOBAL security risk scanner — DB injection
 * classes (all 4 adapters), command injection, dynamic code execution, path
 * traversal, SSRF, XSS sinks, and SvelteKit config risks.
 */

import { describe, it, expect } from "vitest";
import { scanDbRisk, scanGlobalRisk, scanSvelteKitRisk } from "../../../scripts/scan-security-risk";

describe("scanDbRisk — SQL value interpolation (SQLi class)", () => {
  it("flags interpolated values inside quoted SQL strings", () => {
    const violations = scanDbRisk(
      "test.ts",
      ["const sql = `SELECT * FROM users WHERE email = '${userEmail}'`;"].join("\n"),
    );
    expect(
      violations.some((v) => v.category === "sql-value-interpolation" && v.severity === "error"),
    ).toBe(true);
  });

  it("flags SQL built by string concatenation", () => {
    const violations = scanDbRisk(
      "test.ts",
      ['const sql = "SELECT * FROM users WHERE id = \'" + userId + "\'";'].join("\n"),
    );
    expect(
      violations.some((v) => v.category === "sql-concat-interpolation" && v.severity === "error"),
    ).toBe(true);
  });

  it("does NOT flag bound parameters or tagged templates", () => {
    const violations = scanDbRisk(
      "test.ts",
      [
        'const row = client.prepare("SELECT data FROM content_nodes WHERE _id = ? LIMIT 1").get(id);',
        "const rows = sql`SELECT * FROM users WHERE id = ${id}`;",
      ].join("\n"),
    );
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("allows validated identifiers in guarded files (FTS5 content='${collection}')", () => {
    const content = [
      "assertSafeSqlIdentifier(collection, 'collection');",
      "const sql = `CREATE VIRTUAL TABLE IF NOT EXISTS \"${collection}_fts\" USING fts5(content='${collection}');`;",
    ].join("\n");
    const violations = scanDbRisk("guard.ts", content);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("does not flag LLM prompts or log messages", () => {
    const violations = scanDbRisk(
      "ai.ts",
      [
        "const prompt = `",
        "  Extract ${limit} relevant tags from this content.",
        "  Avoid these existing tags: ${existingTags.join(', ') || 'none'}.",
        "`;",
        "logger.debug(`transaction unavailable for ${action}, falling back`);",
      ].join("\n"),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("scanDbRisk — MongoDB server-side JS execution (RCE class)", () => {
  it("flags $where", () => {
    const violations = scanDbRisk("mongo.ts", 'const q = { $where: "this.x === 1" };');
    expect(
      violations.some((v) => v.category === "mongodb-js-execution" && v.severity === "error"),
    ).toBe(true);
  });

  it("flags $function / $accumulator", () => {
    const v1 = scanDbRisk(
      "mongo.ts",
      'const q = { $expr: { $function: { body: "function(){}" } } };',
    );
    const v2 = scanDbRisk("mongo.ts", 'const q = { $accumulator: { init: "function(){}" } };');
    expect(v1.some((v) => v.category === "mongodb-js-execution")).toBe(true);
    expect(v2.some((v) => v.category === "mongodb-js-execution")).toBe(true);
  });
});

describe("scanDbRisk — regex interpolation", () => {
  it("flags unescaped interpolation into RegExp", () => {
    const violations = scanDbRisk("parse.ts", 'const r = new RegExp(`^${col}$`, "i");');
    expect(violations.some((v) => v.category === "regex-interpolation")).toBe(true);
  });

  it("skips patterns escaped with the \\$& idiom", () => {
    const content = [
      'const escaped = pattern.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");',
      'return new RegExp(`^${escaped}$`, "i").test(input);',
    ].join("\n");
    const violations = scanDbRisk("escaped.ts", content);
    expect(violations.some((v) => v.category === "regex-interpolation")).toBe(false);
  });
});

describe("scanGlobalRisk — command injection", () => {
  it("flags shell command interpolation", () => {
    const violations = scanGlobalRisk("setup.ts", "exec(`npm install ${packageName}`);");
    expect(violations.some((v) => v.category === "shell-interpolation")).toBe(true);
  });

  it("does NOT flag execFile with an args array or dot-methods", () => {
    expect(
      scanGlobalRisk("setup.ts", 'execFile(pm, ["add", packageName]);').some(
        (v) => v.category === "shell-interpolation",
      ),
    ).toBe(false);
    expect(
      scanGlobalRisk("db.ts", 'this.sqlite.exec(`DROP TABLE IF EXISTS "${t}"`);').some(
        (v) => v.category === "shell-interpolation",
      ),
    ).toBe(false);
  });

  it("flags spawn with shell:true", () => {
    const violations = scanGlobalRisk("x.ts", "spawn(cmd, { shell: true });");
    expect(violations.some((v) => v.category === "shell-enabled")).toBe(true);
  });
});

describe("scanGlobalRisk — dynamic code execution", () => {
  it("flags eval and new Function", () => {
    expect(
      scanGlobalRisk("x.ts", "eval(userCode);").some(
        (v) => v.category === "dynamic-code-execution",
      ),
    ).toBe(true);
    expect(
      scanGlobalRisk("x.ts", "new Function('return ' + input)();").some(
        (v) => v.category === "dynamic-code-execution",
      ),
    ).toBe(true);
  });

  it("allows the bun:sqlite dynamic-import workaround", () => {
    const violations = scanGlobalRisk(
      "adapter.ts",
      "new Function('return import(\"bun:sqlite\")')();",
    );
    expect(violations.some((v) => v.category === "dynamic-code-execution")).toBe(false);
  });
});

describe("scanGlobalRisk — path traversal / SSRF / XSS", () => {
  it("flags fs calls with member-access path interpolation", () => {
    const violations = scanGlobalRisk("x.ts", 'fs.readFile(`${req.files.path}`, "utf8");');
    expect(violations.some((v) => v.category === "path-interpolation")).toBe(true);
  });

  it("passes internally derived paths and guarded files", () => {
    expect(scanGlobalRisk("x.ts", "fs.writeFile(`${rotated}.gz`, data);")).toHaveLength(0);
    expect(
      scanGlobalRisk(
        "guard.ts",
        'fs.readFile(`${entry.path}`, "utf8");\nconst resolvePath = (p) => path.resolve(base, p);',
      ),
    ).toHaveLength(0);
  });

  it("flags request-derived fetch URLs, passes configured endpoints", () => {
    expect(
      scanGlobalRisk("services/x.ts", "fetch(`${request.url}/api`);").some(
        (v) => v.category === "ssrf-fetch",
      ),
    ).toBe(true);
    expect(scanGlobalRisk("services/x.ts", "fetch(`${ollamaUrl}/api/embeddings`);")).toHaveLength(
      0,
    );
  });

  it("flags DOM XSS sinks", () => {
    const violations = scanGlobalRisk("comp.svelte", "el.innerHTML = userHtml;");
    expect(violations.some((v) => v.category === "xss-sink")).toBe(true);
  });
});

describe("scanSvelteKitRisk — config risks", () => {
  it("flags disabled CSRF origin check", () => {
    const violations = scanSvelteKitRisk("svelte.config.js", "csrf: { checkOrigin: false },");
    expect(
      violations.some((v) => v.category === "sveltekit-csrf-disabled" && v.severity === "error"),
    ).toBe(true);
  });

  it("flags non-httpOnly cookies", () => {
    const violations = scanSvelteKitRisk(
      "hook.ts",
      'cookies.set("session", id, { httpOnly: false, secure: true });',
    );
    expect(
      violations.some((v) => v.category === "cookie-not-httponly" && v.severity === "error"),
    ).toBe(true);
  });

  it("accepts secure session cookies", () => {
    const violations = scanSvelteKitRisk(
      "hook.ts",
      'cookies.set("session", id, { httpOnly: true, secure: true, sameSite: "strict" });',
    );
    expect(violations).toHaveLength(0);
  });
});
