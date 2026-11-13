/**
 * @file tests/unit/scripts/scan-security-risk.test.ts
 * @description Unit tests for the GLOBAL security risk scanner — DB injection
 * classes (all 4 adapters), command injection, dynamic code execution, path
 * traversal, SSRF, XSS sinks, and SvelteKit config risks.
 */

import { describe, it, expect } from "vitest";
import {
  scanDbRisk,
  scanGlobalRisk,
  scanSvelteKitRisk,
  scanAstRisk,
  scanAstSqlRisk,
  isSuppressed,
} from "../../../scripts/security/scan-security-risk";

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

  it("flags the legacy bun:sqlite new Function idiom (workaround removed)", () => {
    // The former `new Function('return import("bun:sqlite")')()` workaround was
    // replaced by a plain dynamic import — the sink is now banned categorically.
    const violations = scanGlobalRisk(
      "adapter.ts",
      "new Function('return import(\"bun:sqlite\")')();",
    );
    expect(violations.some((v) => v.category === "dynamic-code-execution")).toBe(true);
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

  it("does not flag a dispatcher that only names update-user-attributes and parses JSON", () => {
    // Shape of src/routes/api/[...path]/+server.ts: imports the auth handler,
    // parses a bounded JSON body, and matches the action string in an allowlist
    // — but never calls updateUserAttributes itself (false-positive guard).
    const dispatcher = [
      'import * as authHandler from "./handlers/auth";',
      "async function readBoundedApiBody(event: RequestEvent) {",
      "  return (await event.request.json()) as Record<string, unknown>;",
      "}",
      "function isSelfServiceAction(action: string) {",
      '  return action === "update-user-attributes" || action === "save-avatar";',
      "}",
      "export async function POST(event: RequestEvent) {",
      "  const body = await readBoundedApiBody(event);",
      "  return authHandler.handleAuthRoutes(event, body);",
      "}",
    ].join("\n");
    const violations = scanGlobalRisk("routes/api/[...path]/+server.ts", dispatcher);
    expect(violations.some((v) => v.category === "privilege-field-write")).toBe(false);
  });

  it("still flags a handler that calls updateUserAttributes with request JSON and no policy", () => {
    const handler = [
      "export async function PUT(event: RequestEvent) {",
      "  const userId = event.params.userId;",
      "  return successResponse(",
      "    event,",
      "    await cms.auth.updateUserAttributes(userId, await event.request.json()),",
      "  );",
      "}",
    ].join("\n");
    const violations = scanGlobalRisk("routes/api/[...path]/handlers/auth.ts", handler);
    expect(
      violations.some((v) => v.category === "privilege-field-write" && v.severity === "error"),
    ).toBe(true);
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

describe("scanGlobalRisk — code fragmentation detection", () => {
  it("flags ad-hoc admin checks in application files", () => {
    const vulnerable = 'if (user.role === "admin") { doAdminAction(); }';
    const violations = scanGlobalRisk("routes/api/custom-route.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "admin-role-fragmentation" && v.severity === "error"),
    ).toBe(true);
  });

  it("passes canonical isAdmin(user) checks", () => {
    const fixed = "if (isAdmin(user)) { doAdminAction(); }";
    const violations = scanGlobalRisk("routes/api/custom-route.ts", fixed);
    expect(violations.some((v) => v.category === "admin-role-fragmentation")).toBe(false);
  });

  it("flags ad-hoc session cookie deletions", () => {
    const vulnerable = 'cookies.delete("auth_sessions");';
    const violations = scanGlobalRisk("routes/api/logout-helper.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "cookie-clear-fragmentation" && v.severity === "error"),
    ).toBe(true);
  });

  it("passes canonical clearAllSessionCookies calls", () => {
    const fixed = "clearAllSessionCookies(cookies);";
    const violations = scanGlobalRisk("routes/api/logout-helper.ts", fixed);
    expect(violations.some((v) => v.category === "cookie-clear-fragmentation")).toBe(false);
  });

  it("flags ad-hoc collection path construction", () => {
    const vulnerable = "const node = { path: `/collection/${name}` };";
    const violations = scanGlobalRisk("services/custom-tree.ts", vulnerable);
    expect(
      violations.some(
        (v) => v.category === "collection-path-fragmentation" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes canonical getSchemaPath / getNodePath calls", () => {
    const fixed = "const node = { path: getSchemaPath(schema) };";
    const violations = scanGlobalRisk("services/custom-tree.ts", fixed);
    expect(violations.some((v) => v.category === "collection-path-fragmentation")).toBe(false);
  });

  it("flags raw x-forwarded-for header lookup in server code", () => {
    const vulnerable = 'const clientIp = event.request.headers.get("x-forwarded-for");';
    const violations = scanGlobalRisk("routes/api/[...path]/handlers/custom.ts", vulnerable);
    expect(
      violations.some(
        (v) => v.category === "ip-spoofing-x-forwarded-for" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes canonical getClientIp calls", () => {
    const fixed = "const clientIp = getClientIp(event);";
    const violations = scanGlobalRisk("routes/api/[...path]/handlers/custom.ts", fixed);
    expect(violations.some((v) => v.category === "ip-spoofing-x-forwarded-for")).toBe(false);
  });

  it("flags blocking redis.keys() calls", () => {
    const vulnerable = 'const keys = await redis.keys("svelty:sec:*");';
    const violations = scanGlobalRisk("routes/api/[...path]/handlers/custom.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "blocking-redis-keys" && v.severity === "error"),
    ).toBe(true);
  });

  it("passes scanIterator usage", () => {
    const fixed = 'for await (const key of redis.scanIterator({ MATCH: "svelty:sec:*" })) {}';
    const violations = scanGlobalRisk("routes/api/[...path]/handlers/custom.ts", fixed);
    expect(violations.some((v) => v.category === "blocking-redis-keys")).toBe(false);
  });
});

describe("scanAstRisk — AST batch size upper bound check", () => {
  it("flags unbounded batch action block in API handler", () => {
    const vulnerable = [
      "export async function handle(event) {",
      '  if (action === "batch") {',
      "    for (const id of body.ids) {",
      "      await deleteItem(id);",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const violations = scanAstRisk("src/routes/api/custom/handler.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "batch-size-unbounded" && v.severity === "error"),
    ).toBe(true);
  });

  it("passes batch action block with upper bound check", () => {
    const fixed = [
      "export async function handle(event) {",
      '  if (action === "batch") {',
      "    const MAX_BATCH_SIZE = 100;",
      '    if (ids.length > MAX_BATCH_SIZE) throw new AppError("Too large", 400);',
      "    await deleteMany(ids);",
      "  }",
      "}",
    ].join("\n");
    const violations = scanAstRisk("src/routes/api/custom/handler.ts", fixed);
    expect(violations.some((v) => v.category === "batch-size-unbounded")).toBe(false);
  });
});

describe("scanGlobalRisk — loopback prefix, tenant spoofing, and bare NODE_ENV guards", () => {
  it("flags startsWith('localhost') or startsWith('127.0.0.1') without port separator", () => {
    const vulnerable =
      'if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;';
    const violations = scanGlobalRisk("hooks/handle-system-state.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "loopback-prefix-bypass" && v.severity === "error"),
    ).toBe(true);
  });

  it("passes exact or port-delimited loopback checks", () => {
    const fixed = 'if (host === "localhost" || host.startsWith("localhost:")) return true;';
    const violations = scanGlobalRisk("hooks/handle-system-state.ts", fixed);
    expect(violations.some((v) => v.category === "loopback-prefix-bypass")).toBe(false);
  });

  it("flags raw x-tenant-id header reads outside request-tenant.ts", () => {
    const vulnerable = 'const tenantId = event.request.headers.get("x-tenant-id");';
    const violations = scanGlobalRisk("hooks/handle-redirects.ts", vulnerable);
    expect(
      violations.some(
        (v) => v.category === "tenant-spoofing-x-tenant-id" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes resolveRequestTenant usage and allows request-tenant.ts implementation", () => {
    const fixed = "const tenantId = resolveRequestTenant(event.request, false);";
    expect(
      scanGlobalRisk("hooks/handle-redirects.ts", fixed).some(
        (v) => v.category === "tenant-spoofing-x-tenant-id",
      ),
    ).toBe(false);
    expect(
      scanGlobalRisk(
        "hooks/request-tenant.ts",
        'const tenantId = request.headers.get("x-tenant-id");',
      ).some((v) => v.category === "tenant-spoofing-x-tenant-id"),
    ).toBe(false);
  });

  it("flags bare process.env.NODE_ENV === 'test' in security hooks", () => {
    const vulnerable =
      'const IS_TEST = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";';
    const violations = scanGlobalRisk("hooks/handle-authentication.ts", vulnerable);
    expect(
      violations.some((v) => v.category === "test-mode-bare-node-env" && v.severity === "error"),
    ).toBe(true);
  });
});

describe("scanAstSqlRisk — multi-line SQL statements", () => {
  it("flags a template whose SQL verb is on a different line from the interpolation", () => {
    const vulnerable = [
      "const queryText = `",
      "  SELECT * FROM users",
      "  WHERE email = '${email}'",
      "`;",
    ].join("\n");
    const violations = scanAstSqlRisk("src/databases/sqlite/adapter.ts", vulnerable);
    expect(
      violations.some(
        (v) => v.category === "sql-template-value-interpolation" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags cross-line concatenation of a value into SQL", () => {
    const vulnerable = [
      "const queryText =",
      '  "SELECT * FROM users WHERE id = \'" +',
      "  userId +",
      '  "\'";',
    ].join("\n");
    const violations = scanAstSqlRisk("src/databases/sqlite/adapter.ts", vulnerable);
    expect(violations.some((v) => v.category === "sql-template-value-interpolation")).toBe(true);
  });

  it("passes bound parameters, tagged templates and validated identifiers", () => {
    const fixed = [
      "const rows = sql`SELECT * FROM users WHERE id = ${id}`;",
      'const row = stmt.get("SELECT * FROM users WHERE id = ?", id);',
      "assertSafeSqlIdentifier(collection, 'collection');",
      "const ddl = `",
      '  CREATE VIRTUAL TABLE "${collection}_fts"',
      "`;",
    ].join("\n");
    expect(scanAstSqlRisk("src/databases/sqlite/adapter.ts", fixed)).toHaveLength(0);
  });
});

describe("scanGlobalRisk — SSRF without a variable-name allowlist", () => {
  it("flags fetch(target) from a destructured request body", () => {
    const vulnerable = [
      "export const POST = async ({ request }) => {",
      "  const { target } = await request.json();",
      "  return fetch(target);",
      "};",
    ].join("\n");
    expect(
      scanGlobalRisk("src/routes/api/import/+server.ts", vulnerable).some(
        (v) => v.category === "ssrf-unguarded-fetch" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags event.fetch(link) where link is a search param", () => {
    const vulnerable = [
      "const link = url.searchParams.get('src');",
      "const response = await event.fetch(link);",
    ].join("\n");
    expect(
      scanGlobalRisk("src/routes/api/import/+server.ts", vulnerable).some(
        (v) => v.category === "ssrf-unguarded-fetch",
      ),
    ).toBe(true);
  });

  it("passes guarded, relative and configured targets", () => {
    const guarded = [
      'import { validateEgressUrl, safeFetch } from "@utils/egress-guard";',
      "const { target } = await request.json();",
      "await validateEgressUrl(target);",
      "await fetch(target);",
    ].join("\n");
    expect(
      scanGlobalRisk("src/routes/api/import/+server.ts", guarded).some(
        (v) => v.category === "ssrf-unguarded-fetch",
      ),
    ).toBe(false);
    const configured = [
      "const { id } = await request.json();",
      'const PLUGIN_API = "/api/plugins";',
      "await fetch(PLUGIN_API);",
      'const GITHUB_URL = "https://api.github.com/repos";',
      "await fetch(GITHUB_URL);",
    ].join("\n");
    expect(
      scanGlobalRisk("src/services/version-service.ts", configured).some(
        (v) => v.category === "ssrf-unguarded-fetch",
      ),
    ).toBe(false);
  });

  it("honours the per-line ssrf-allow escape hatch", () => {
    const allowed = [
      "const { target } = await request.json();",
      "// ssrf-allow: admin-configured connector endpoint, host allowlisted",
      "const response = await fetch(target);",
    ].join("\n");
    expect(
      scanGlobalRisk("src/routes/api/import/+server.ts", allowed).some(
        (v) => v.category === "ssrf-unguarded-fetch",
      ),
    ).toBe(false);
  });
});

describe("scanAstRisk — prototype pollution", () => {
  it("flags Object.assign(target, requestBody)", () => {
    const vulnerable = [
      "export async function POST({ request }) {",
      "  const payload = await request.json();",
      "  return Object.assign({}, payload);",
      "}",
    ].join("\n");
    expect(
      scanAstRisk("src/services/settings-writer.ts", vulnerable).some(
        (v) => v.category === "prototype-pollution-request-merge" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags a spread merge of a request-derived identifier", () => {
    const vulnerable = [
      "export async function POST({ request }) {",
      "  const body = await request.json();",
      "  const merged = { ...DEFAULT_SETTINGS, ...body };",
      "  return merged;",
      "}",
    ].join("\n");
    expect(
      scanAstRisk("src/services/settings-writer.ts", vulnerable).some(
        (v) => v.category === "prototype-pollution-request-merge",
      ),
    ).toBe(true);
  });

  it("passes merges that strip prototype keys and config-only merges", () => {
    const guarded = [
      "export async function POST({ request }) {",
      "  const payload = await request.json();",
      '  if (Object.hasOwn(payload, "__proto__")) delete payload["__proto__"];',
      "  return Object.assign({}, payload);",
      "}",
    ].join("\n");
    expect(
      scanAstRisk("src/services/settings-writer.ts", guarded).some(
        (v) => v.category === "prototype-pollution-request-merge",
      ),
    ).toBe(false);
    const configMerge = "const merged = deepMerge(DEFAULT_THEME_FEATURES, tenantConfig.features);";
    expect(
      scanAstRisk("src/utils/theme-merge.ts", configMerge).some(
        (v) => v.category === "prototype-pollution-request-merge",
      ),
    ).toBe(false);
  });
});

describe("scanAstRisk — timing-unsafe secret comparison", () => {
  it("flags `===` between secret identifiers", () => {
    const vulnerable = [
      "export function valid(testSecret) {",
      "  const masterSecret = resolveMasterSecret();",
      "  return testSecret === masterSecret;",
      "}",
    ].join("\n");
    expect(
      scanAstRisk("src/hooks/handle-test-isolation.ts", vulnerable).some(
        (v) => v.category === "timing-unsafe-comparison" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("flags `.includes(` on a token", () => {
    const vulnerable = "if (providedToken.includes(csrfSecret)) { allow(); }";
    expect(
      scanAstRisk("src/utils/security/check.ts", vulnerable).some(
        (v) => v.category === "timing-unsafe-comparison",
      ),
    ).toBe(true);
  });

  it("passes timingSafeEqual, content-hash identity and sentinel constants", () => {
    const guarded = [
      'import { timingSafeEqual } from "node:crypto";',
      "export function valid(testSecret, masterSecret) {",
      "  return timingSafeEqual(Buffer.from(testSecret), Buffer.from(masterSecret));",
      "}",
    ].join("\n");
    expect(
      scanAstRisk("src/hooks/handle-test-isolation.ts", guarded).some(
        (v) => v.category === "timing-unsafe-comparison",
      ),
    ).toBe(false);
    const hashIdentity = "if (hashedToken !== token) { legacyLookup(); }";
    expect(
      scanAstRisk("src/databases/mongodb/auth-token.ts", hashIdentity).some(
        (v) => v.category === "timing-unsafe-comparison",
      ),
    ).toBe(false);
    const sentinel = "if (secret === SSO_SECRET_MASK) { keep(); }";
    expect(
      scanAstRisk("src/routes/api/handlers/sso.ts", sentinel).some(
        (v) => v.category === "timing-unsafe-comparison",
      ),
    ).toBe(false);
  });
});

describe("scanAstRisk — insecure randomness in security contexts", () => {
  it("flags Math.random() on an auth/token path", () => {
    const vulnerable = "const resetCode = Math.floor(Math.random() * 1000000);";
    expect(
      scanAstRisk("src/utils/security/password-reset.ts", vulnerable).some(
        (v) => v.category === "insecure-randomness" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes Math.random() jitter outside security paths", () => {
    const jitter = "const delay = base + Math.random() * 200;";
    expect(
      scanAstRisk("src/utils/retry-dynamic-import.ts", jitter).some(
        (v) => v.category === "insecure-randomness",
      ),
    ).toBe(false);
  });
});

describe("scanAstRisk — open redirect", () => {
  it("flags redirect(3xx, search-param target) without same-origin validation", () => {
    const vulnerable = [
      "export const GET = async ({ url, locals }) => {",
      "  const target = url.searchParams.get('next');",
      "  throw redirect(302, target);",
      "};",
    ].join("\n");
    expect(
      scanAstRisk("src/routes/api/redirect/+server.ts", vulnerable).some(
        (v) => v.category === "open-redirect" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes targets validated with a same-origin check", () => {
    const guarded = [
      "export const GET = async ({ url, locals }) => {",
      "  const target = url.searchParams.get('next');",
      '  if (!target || !target.startsWith("/")) throw error(400);',
      "  throw redirect(302, target);",
      "};",
    ].join("\n");
    expect(
      scanAstRisk("src/routes/api/redirect/+server.ts", guarded).some(
        (v) => v.category === "open-redirect",
      ),
    ).toBe(false);
  });
});

describe("scanAstRisk — missing auth guard on route modules", () => {
  it("flags a route module that reads request input without a guard", () => {
    const vulnerable = [
      "export const POST = async ({ request }) => {",
      "  const body = await request.json();",
      "  return json(body);",
      "};",
    ].join("\n");
    expect(
      scanAstRisk("src/routes/api/custom/+server.ts", vulnerable).some(
        (v) => v.category === "missing-auth-guard" && v.severity === "error",
      ),
    ).toBe(true);
  });

  it("passes guarded, exempt and explicitly public routes", () => {
    const guarded = [
      "export const POST = async ({ request, locals }) => {",
      "  const user = getAuthenticatedUser(locals);",
      "  const body = await request.json();",
      "  return json({ user, body });",
      "};",
    ].join("\n");
    expect(
      scanAstRisk("src/routes/api/custom/+server.ts", guarded).some(
        (v) => v.category === "missing-auth-guard",
      ),
    ).toBe(false);
    const declared = [
      "// public-endpoint: preview token is verified by previewService.validateToken",
      "export const GET = async ({ url }) => {",
      "  const token = url.searchParams.get('preview_token');",
      "  return json({ token });",
      "};",
    ].join("\n");
    expect(
      scanAstRisk("src/routes/api/preview/+server.ts", declared).some(
        (v) => v.category === "missing-auth-guard",
      ),
    ).toBe(false);
    expect(
      scanAstRisk("src/routes/login/+page.server.ts", declared).some(
        (v) => v.category === "missing-auth-guard",
      ),
    ).toBe(false);
  });
});

describe("isSuppressed — rule-scoped suppressions", () => {
  const lines = [
    "// slop:suppress",
    "eval(userInput);",
    "// slop:suppress dynamic-code-execution",
    "eval(userInput);",
    "// slop:suppress open-redirect",
    "eval(userInput);",
    "// slop:suppress — prose reason, not a rule id",
    "eval(userInput);",
    "eval(userInput);",
  ];

  it("suppresses only the offending line or the line above it", () => {
    expect(isSuppressed(lines, 1, "dynamic-code-execution")).toBe(true);
    expect(isSuppressed(lines, 3, "dynamic-code-execution")).toBe(true);
    expect(isSuppressed(lines, 8, "dynamic-code-execution")).toBe(false);
  });

  it("respects a named rule id and treats prose as an unscoped marker", () => {
    expect(isSuppressed(lines, 5, "dynamic-code-execution")).toBe(false);
    expect(isSuppressed(lines, 5, "open-redirect")).toBe(true);
    expect(isSuppressed(lines, 7, "dynamic-code-execution")).toBe(true);
  });

  it("does not suppress across a whole file", () => {
    const marker = ["// slop:suppress", "const a = 1;", "eval(userInput);"];
    expect(isSuppressed(marker, 2, "dynamic-code-execution")).toBe(false);
  });
});
