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

  it("flags unguarded fetch(url) on remote-upload server paths (SSRF class)", () => {
    const vulnerable = [
      'const remoteUrls = JSON.parse(formData.get("remoteUrls") as string);',
      "const response = await fetch(url);",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/(app)/mediagallery/+page.server.ts", vulnerable).some(
        (v) => v.category === "ssrf-unguarded-fetch" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes remote upload when egress guard / saveRemoteMedia is present", () => {
    const fixed = [
      'import { validateEgressUrl, safeFetch } from "@src/utils/egress-guard";',
      'const remoteUrls = JSON.parse(formData.get("remoteUrls") as string);',
      "await mediaService.saveRemoteMedia(url, userId, access);",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/(app)/mediagallery/+page.server.ts", fixed).some(
        (v) => v.category === "ssrf-unguarded-fetch",
      ),
    ).toBe(false);
  });

  it("flags update-user-attributes without stripPrivilegedUserFields", () => {
    const vulnerable = [
      "export async function handleUpdateUserAttributesRoute(event) {",
      "  const body = await event.request.json();",
      "  await cms.auth.updateUserAttributes(id, body);",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/api/[...path]/handlers/auth.ts", vulnerable).some(
        (v) => v.category === "privilege-field-write" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags PUT /user/:id that passes request.json into updateUserAttributes without policy", () => {
    const vulnerable = [
      "export async function handleUserSpecificRoutes(event) {",
      "  const data = await request.json();",
      "  await cms.auth.updateUserAttributes(userId, data, { tenantId });",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/api/[...path]/handlers/auth.ts", vulnerable).some(
        (v) => v.category === "privilege-field-write" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes update-user-attributes when sanitizeClientUserAttributePatch is used", () => {
    const fixed = [
      'import { sanitizeClientUserAttributePatch } from "@utils/security/user-attribute-policy";',
      "export async function handleUpdateUserAttributesRoute(event) {",
      "  const body = await event.request.json();",
      "  const data = sanitizeClientUserAttributePatch(body, { isAdmin: false });",
      "  await cms.auth.updateUserAttributes(id, data, { allowPrivilegeEscalation: false });",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/api/[...path]/handlers/auth.ts", fixed).some(
        (v) => v.category === "privilege-field-write",
      ),
    ).toBe(false);
  });

  it("flags adapter updateUserAttributes without fail-closed escalation strip", () => {
    const vulnerable = [
      "async updateUserAttributes(userId, userData, options) {",
      "  await this.UserModel.findOneAndUpdate(filter, userData);",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("databases/mongodb/auth-user.ts", vulnerable).some(
        (v) => v.category === "privilege-adapter-unguarded" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes adapter when stripPrivilegeEscalationFields is present", () => {
    const fixed = [
      "if (!options.allowPrivilegeEscalation) stripPrivilegeEscalationFields(data);",
      "async updateUserAttributes(userId, userData, options) {",
      "  await this.UserModel.findOneAndUpdate(filter, userData);",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("databases/mongodb/auth-user.ts", fixed).some(
        (v) => v.category === "privilege-adapter-unguarded",
      ),
    ).toBe(false);
  });

  it("flags classifyRequest bootstrap-public without setupApiLocked", () => {
    const vulnerable = [
      "export function classifyRequest(pathname, locals) {",
      "  const isBootstrap = isBootstrapRoute(pathname);",
      "  return { isPublic: isStatic || isBootstrap || isPublicRoute(pathname) };",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("utils/hook-utils.ts", vulnerable).some(
        (v) => v.category === "setup-api-public-after-install" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes classifyRequest when setupApiLocked uses isSetupComplete", () => {
    const fixed = [
      "export function classifyRequest(pathname, locals) {",
      "  const isBootstrap = isBootstrapRoute(pathname);",
      "  const setupApiLocked = pathname.startsWith('/api/setup') && isSetupComplete();",
      "  return { isPublic: isStatic || (isBootstrap && !setupApiLocked) };",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("utils/hook-utils.ts", fixed).some(
        (v) => v.category === "setup-api-public-after-install",
      ),
    ).toBe(false);
  });

  it("flags setup complete without isSetupComplete gate (admin takeover class)", () => {
    const vulnerable = [
      "export async function handleCompleteSetup(event) {",
      "  await setupAuth.createUserAndSession({ role: 'admin', isAdmin: true });",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/api/[...path]/handlers/setup.ts", vulnerable).some(
        (v) => v.category === "setup-complete-unguarded" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes setup complete when isSetupComplete is checked", () => {
    const fixed = [
      "export async function handleCompleteSetup(event) {",
      "  if (isSetupComplete()) throw new Error('done');",
      "  await setupAuth.createUserAndSession({ role: 'admin', isAdmin: true });",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/api/[...path]/handlers/setup.ts", fixed).some(
        (v) => v.category === "setup-complete-unguarded",
      ),
    ).toBe(false);
  });

  it("flags remoteUpload without saveRemoteMedia (SSRF class)", () => {
    const vulnerable = [
      "remoteUpload: async ({ request, locals }) => {",
      '  const remoteUrls = JSON.parse(formData.get("remoteUrls") as string);',
      "  const response = await fetch(url);",
      "  requirePagePermission(locals, 'media:write');",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/(app)/mediagallery/+page.server.ts", vulnerable).some(
        (v) => v.category === "ssrf-remote-upload-unguarded" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags remoteUpload without media:write action permission", () => {
    const vulnerable = [
      "remoteUpload: async ({ request, locals }) => {",
      '  const remoteUrls = JSON.parse(formData.get("remoteUrls") as string);',
      "  await mediaService.saveRemoteMedia(url, userId, access);",
      "}",
    ].join("\n");
    expect(
      scanGlobalRisk("routes/(app)/mediagallery/+page.server.ts", vulnerable).some(
        (v) => v.category === "media-action-missing-write-permission" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes remoteUpload with saveRemoteMedia + media:write", () => {
    const fixed = [
      "remoteUpload: async ({ request, locals }) => {",
      "  requirePagePermission(locals, 'media:write');",
      '  const remoteUrls = JSON.parse(formData.get("remoteUrls") as string);',
      "  await mediaService.saveRemoteMedia(url, userId, access);",
      "}",
    ].join("\n");
    const v = scanGlobalRisk("routes/(app)/mediagallery/+page.server.ts", fixed);
    expect(v.some((x) => x.category === "ssrf-remote-upload-unguarded")).toBe(false);
    expect(v.some((x) => x.category === "media-action-missing-write-permission")).toBe(false);
  });

  it("flags media-service SVG stream without always-sanitize guards", () => {
    const vulnerable = [
      "export function sanitizeSvg(svg) { return svg; }",
      "if (file.size < 5 * 1024 * 1024) { /* sanitize */ }",
      "else { const stream = file.stream(); }",
    ].join("\n");
    expect(
      scanGlobalRisk("utils/media/media-service.server.ts", vulnerable).some(
        (v) => v.category === "svg-stream-bypass" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes media-service when MAX_SVG_BYTES / bufferAndSanitizeSvg present", () => {
    const fixed = [
      "export const MAX_SVG_BYTES = 5 * 1024 * 1024;",
      "async function bufferAndSanitizeSvg(file) { return Buffer.from(sanitizeSvg('')); }",
      "export function sanitizeSvg(svg) { return svg; }",
      "const stream = file.stream(); // non-SVG only — SVG always sanitized",
    ].join("\n");
    expect(
      scanGlobalRisk("utils/media/media-service.server.ts", fixed).some(
        (v) => v.category === "svg-stream-bypass",
      ),
    ).toBe(false);
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
