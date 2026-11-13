#!/usr/bin/env bun
/**
 * @file scripts/security/scan-security-risk.ts
 * @description
 * GLOBAL static security risk scanner for the whole `src/` tree — every
 * vulnerability class that an external database cannot see because it lives
 * in OUR code.
 *
 * ### What it checks (errors)
 * - **SQL value interpolation** (`'${value}'` inside SQL strings) — the
 *   `author__not_in` SQLi class. Values must be bound parameters (`?`, `$1`)
 *   or tagged templates (sql`...`, raw`...`).
 * - **SQL string concatenation** of values into statements.
 * - **Multi-line SQL templates** (AST) — a statement whose verb sits on a
 *   different line from the interpolation no longer escapes the line-based pass
 *   (`sql-template-value-interpolation`).
 * - **MongoDB `$where` / `$function` / `$accumulator`** — server-side JS
 *   execution (RCE class).
 * - **Dynamic code execution** — `eval(` / `new Function(` (RCE sinks).
 * - **Prototype pollution** — `Object.assign`/spread/`deepMerge` of request JSON
 *   without a `__proto__`/`constructor`/`prototype` strip
 *   (`prototype-pollution-request-merge`).
 * - **Timing-unsafe secret comparison** — `===`/`!==`/`.includes`/`.startsWith`
 *   between secret-named identifiers without `timingSafeEqual`
 *   (`timing-unsafe-comparison`).
 * - **Insecure randomness** — `Math.random()` on auth/security/session paths
 *   (`insecure-randomness`).
 * - **Open redirect** — 3xx `redirect()`/`Response.redirect()` to a
 *   request-derived target without a same-origin validation (`open-redirect`).
 * - **Missing auth guard** — route modules reading request input with no
 *   `locals.user`/permission guard (`missing-auth-guard`).
 * - **SvelteKit CSRF protection disabled** (`checkOrigin: false`, `csrf: false`).
 * - **Non-httpOnly cookies** (session tokens must be httpOnly).
 * - **Unguarded SSRF** — `fetch(<identifier|property>)` / `event.fetch(...)` on
 *   server routes without `validateEgressUrl` / `safeFetch` / `saveRemoteMedia`
 *   in the same file (request-derived or unresolved target; per-line
 *   `// ssrf-allow: <reason>` escape hatch).
 * - **Privilege-field API writes** — `updateUserAttributes` / user PUT/PATCH
 *   paths that accept request JSON without `stripPrivilegedUserFields` /
 *   `sanitizeClientUserAttributePatch` / adapter `allowPrivilegeEscalation`.
 * - **Client role assignment** — direct `role`/`isAdmin` assignment from
 *   request body variables without a privilege policy helper.
 * - **SVG stream without sanitization** — large-file streaming of SVG that
 *   skips `sanitizeSvg` / `bufferAndSanitizeSvg` / `MAX_SVG_BYTES`.
 *
 * ### What it checks (warnings)
 * - **Shell command interpolation** (`exec(\`...${...}\`)`) — prefer execFile/spawn
 *   with an args array so input can never reach a shell.
 * - **Path interpolation** into fs calls (`readFile/writeFile/...` with `${`)
 *   — path traversal class; skipped in files with a path-guard helper.
 * - **SSRF** — `fetch(\`...${...}\`)` with an interpolated URL.
 * - **XSS sinks** — `innerHTML=`, `outerHTML=`, `insertAdjacentHTML(`, `document.write(`.
 * - **Regex interpolation** without the `\$&` escape idiom.
 * - **SQL identifier interpolation** without escaping (guard-aware).
 *
 * ### Usage
 *   bun run scripts/scan-security-risk.ts          # scan (warnings tolerated)
 *   bun run scripts/scan-security-risk.ts --strict # exit 1 on any finding
 *
 * ### Suppressions (line-scoped, never file-scoped)
 * `// slop:suppress` (optionally `slop:suppress <rule-id>`) suppresses a finding
 * only on the offending line or the line directly above it. A marker with prose
 * instead of a rule id (the existing `slop:suppress — <reason>` convention) covers
 * its own line pair; it no longer skips the file. `// ssrf-allow: <reason>` is the
 * SSRF-specific escape hatch.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

export interface RiskViolation {
  path: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning";
}

const ROOT = join(import.meta.dirname, "../..");
const STRICT = process.argv.includes("--strict");

// Excluded subtrees: vendored type mirrors and generated code.
const EXCLUDED = [
  /[\\/]src[\\/]types[\\/]/,
  /[\\/]node_modules[\\/]/,
  /[\\/]src[\\/]paraglide[\\/]/,
];

const SQL_VERB =
  /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WHERE|VALUES|SET|JOIN|FROM|INTO)\b/;
// A template literal line that STARTS an SQL statement (uppercase verb after the backtick)
const SQL_STMT_START =
  /`\s*(?:INSERT(?:\s+(?:OR\s+IGNORE|INTO))?|UPDATE|DELETE\s+FROM|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?|CREATE\s+(?:VIRTUAL\s+)?TABLE|ALTER\s+TABLE|DROP\s+TABLE|SELECT|WITH)\b/;
// A DB call receiving a SQL string argument (query/prepare/execute/raw/run/all/get)
const DB_CALL = /\b(?:query|prepare|execute|raw|run|all|get)\s*\(/;
// Parameterized-safe contexts — tagged templates bind interpolations as params.
const TAGGED_TEMPLATE = /(?:^|[^\w.])(?:raw|sql|pool|client|query|db|conn|connection)\s*`/;
// Files that validate identifiers before building SQL (assert/escape helpers) —
// interpolations in them are sanctioned IF the expression is a bare identifier
// that went through the guard (slop-scanner parity).
const IDENTIFIER_GUARD =
  /\b(?:SAFE_IDENTIFIER|SAFE_IDENT|isSafeIdentifier|validateIdentifier|assertSafeIdentifier|assertSafeSqlIdentifier|assertSqlIdentifier|assertIdentifier|assertColumnName|assertSafeColumn|quoteIdentifier|quoteMariaIdentifier|escapeSqlIdentifier|getTableName)\b/;
// Sanctioned identifier/value helpers inside interpolations.
const SAFE_EXPR =
  /(?:sql\.(?:raw|identifier|join|param)\s*\(|\.replace\s*\(|escapeSqlIdentifier\s*\(|quoteIdentifier\s*\(|quoteMariaIdentifier\s*\(|\b(?:esc|escape|escId|escSql|quote)\w*\s*\()/;
// Simple interpolation expressions only — excludes nested templates/parens that
// break line-based matching (e.g. `${columns.map((c) => `new."${c}"`).join(", ")}`).
const SIMPLE_EXPR = /^[A-Za-z0-9_.[\]'" ]+$/;

function stripComments(line: string): string {
  return line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Rule ids accepted by `slop:suppress <rule-id>` — prose is never a rule id. */
const RULE_IDS = new Set([
  "dynamic-code-execution",
  "shell-interpolation",
  "shell-enabled",
  "path-interpolation",
  "ssrf-fetch",
  "ssrf-unguarded-fetch",
  "xss-sink",
  "ip-spoofing-x-forwarded-for",
  "blocking-redis-keys",
  "loopback-prefix-bypass",
  "tenant-spoofing-x-tenant-id",
  "test-mode-bare-node-env",
  "privilege-field-write",
  "privilege-adapter-unguarded",
  "svg-stream-bypass",
  "setup-complete-unguarded",
  "setup-api-public-after-install",
  "ssrf-remote-upload-unguarded",
  "media-action-missing-write-permission",
  "admin-role-fragmentation",
  "cookie-clear-fragmentation",
  "collection-path-fragmentation",
  "legacy-store-fragmentation",
  "sql-value-interpolation",
  "sql-template-value-interpolation",
  "sql-concat-interpolation",
  "sql-identifier-interpolation",
  "mongodb-js-execution",
  "regex-interpolation",
  "sveltekit-csrf-disabled",
  "cookie-not-httponly",
  "batch-size-unbounded",
  "prototype-pollution-request-merge",
  "timing-unsafe-comparison",
  "insecure-randomness",
  "open-redirect",
  "missing-auth-guard",
]);

/** Request input accessors — the taint sources of a SvelteKit request. */
const REQUEST_INPUT =
  /(?:request\.json\s*\(|request\.formData\s*\(|request\.text\s*\(|formData\.get\s*\(|\.formData\s*\(|searchParams\.get\s*\()/;

/**
 * Scoped suppression check: a violation is suppressed only by `slop:suppress`
 * on the offending line or the line immediately above it, optionally narrowed
 * to one or more rule ids (`// slop:suppress ssrf-unguarded-fetch`). A marker
 * with prose instead of a rule id suppresses that line only — never the file.
 */
export function isSuppressed(lines: string[], index: number, category: string): boolean {
  for (const candidate of [index, index - 1]) {
    if (candidate < 0 || candidate >= lines.length) continue;
    const marker = lines[candidate].match(/slop:suppress\b([^\n]*)/);
    if (!marker) continue;
    const ids = marker[1]
      .split(/[\s,]+/)
      .map((token) => token.replace(/[^A-Za-z0-9-]/g, ""))
      .filter((token) => RULE_IDS.has(token));
    if (ids.length === 0 || ids.includes(category)) return true;
  }
  return false;
}

/** Per-line escape hatch (`// ssrf-allow: <reason>`) on this or the previous line. */
function hasLineEscape(lines: string[], index: number, marker: string): boolean {
  const rx = new RegExp(`${marker}\\s*:\\s*\\S`, "i");
  return [index, index - 1].some((i) => i >= 0 && i < lines.length && rx.test(lines[i]));
}

/**
 * Direct seeds: names bound from request.json / formData / searchParams.
 */
function seedRequestDerived(lines: string[]): Set<string> {
  const derived = new Set<string>();
  for (const line of lines) {
    if (!REQUEST_INPUT.test(line)) continue;
    for (const m of line.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([^;\n]*)/g)) {
      for (const part of m[1].split(",")) {
        const name = part
          .split(":")[0]
          .trim()
          .replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(name)) derived.add(name);
      }
    }
    for (const m of line.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g)) {
      derived.add(m[1]);
    }
  }
  return derived;
}

/** Names assigned straight from request input (no local propagation). */
export function collectDirectRequestDerived(content: string): Set<string> {
  return seedRequestDerived(content.split("\n"));
}

/**
 * Identifiers whose value originates from request input (request.json / formData /
 * searchParams), including local value-shaping propagation. Function calls are
 * not followed — `authUrl = generateOAuthUrl(token)` is server-built, not attacker-
 * controlled, so call laundering must not taint the result.
 */
export function collectRequestDerived(content: string): Set<string> {
  const lines = content.split("\n");
  const derived = seedRequestDerived(lines);
  for (let pass = 0; pass < 2; pass++) {
    for (const line of lines) {
      const m = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/);
      if (!m) continue;
      const rhs = m[2];
      if (/[A-Za-z_$][\w$]*\s*\(/.test(rhs)) continue; // value shaping only, never a call
      const words = rhs.split(/[^A-Za-z0-9_$]+/);
      if (words.some((word) => derived.has(word))) derived.add(m[1]);
    }
  }
  return derived;
}

/** Names bound anywhere in the file (declarations, imports, parameters). */
export function collectDeclaredIdentifiers(content: string): Set<string> {
  const names = new Set<string>();
  for (const m of content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of content.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s+from\b/g)) {
    for (const part of m[1].split(",")) {
      const name =
        part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .pop() ?? "";
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const m of content.matchAll(/\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)\b/g)) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of content.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const part of m[1].split(",")) {
      const name = part
        .split(/[:=]/)[0]
        .trim()
        .replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** In-file initializers for a name (`const x = ...`), used to spot `/`-relative targets. */
function initializersOf(lines: string[], name: string): string[] {
  const found: string[] = [];
  const rx = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(.+)$`);
  for (const line of lines) {
    const m = line.match(rx);
    if (m) found.push(m[1]);
  }
  return found;
}

/**
 * Global rules — command injection, dynamic code execution, path traversal,
 * SSRF, XSS sinks, privilege-field writes, SVG stream bypass. Exported for unit tests.
 */
export function scanGlobalRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const lines = content.split("\n");
  const hasPathGuard =
    /\b(?:resolvePath|isPathInside|normalizePath|safeJoin|assertPath|pathInside|resolveUploadPath|sanitizePath|assertFilePath)\b/.test(
      content,
    );
  const hasEgressGuard =
    /\b(?:validateEgressUrl|safeFetch|assertPublicUrl|isBlockedHostname|saveRemoteMedia)\b/.test(
      content,
    );
  // Server-side sinks only — skip pure client components / browser utils
  const isServerFile =
    /(\+server\.|\.server\.|hooks[\\/]|services[\\/]|databases[\\/]|setup[\\/]|plugins[\\/]|routes[\\/].*[\\/]handlers[\\/])/.test(
      relPath,
    ) || /[\\/]routes[\\/].*[\\/]\+page\.server\.ts$/.test(relPath);
  const hasRequestInput = REQUEST_INPUT.test(content);
  // Lazily built taint sets — only server files without an egress guard pay for them.
  let requestDerived: Set<string> | undefined;
  let declaredNames: Set<string> | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = stripComments(lines[i]);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    // ── Dynamic code execution (error, RCE sink)
    if (/\bnew\s+Function\s*\(/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "dynamic-code-execution",
        message:
          "new Function(...) — dynamic code execution sink; refactor to a static import or allowlist",
        severity: "error",
      });
    }
    if (/\beval\s*\(/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "dynamic-code-execution",
        message:
          "eval(...) — dynamic code execution sink; refactor to a static import or allowlist",
        severity: "error",
      });
    }

    // ── Shell command interpolation (warning, command-injection class).
    // execFile/spawn with an args array never touches a shell and is safe.
    // Dot-prefixed calls (.exec / db.exec) are DB/engine methods, and regex
    // literals defining WAF patterns don't start with a quote — both skipped.
    const shellCall = line.match(/(?<![.\w])(exec|execSync|execAsync)\s*\(\s*[`'"]/);
    if (shellCall) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "shell-interpolation",
        message: `${shellCall[1]}(...) builds a shell command — use execFile/spawn with an args array so input can never reach a shell`,
        severity: "warning",
      });
    }
    if (/\b(?:spawn|spawnSync)\s*\(/.test(line) && /shell\s*:\s*true/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "shell-enabled",
        message: "spawn with shell:true — prefer an args array without a shell",
        severity: "warning",
      });
    }

    // ── Path interpolation into fs calls (warning, path-traversal class).
    // Only fs.* methods (not bare stat/rm which match unrelated words), and
    // only member-access interpolations (input-derived) or quote-adjacent
    // concatenation — bare local identifiers (internally derived paths) pass.
    if (
      !hasPathGuard &&
      /\bfs\.(?:readFile|writeFile|createReadStream|createWriteStream|unlink|rm|rename|mkdir|readdir|copyFile|appendFile|cp)\w*\s*\(/.test(
        line,
      ) &&
      (/\$\{[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+\}/.test(line) || /['"`]\s*\+/.test(line))
    ) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "path-interpolation",
        message:
          "fs call with interpolated/concatenated path — ensure input is normalized and constrained (resolvePath/isPathInside guard)",
        severity: "warning",
      });
    }

    // ── SSRF: fetch with a REQUEST-DERIVED interpolated absolute URL (warning).
    // Same-origin relative paths (`/api/...`) are not SSRF. Configured endpoints
    // (ollamaUrl, this.baseUrl) without request-ish names are also fine.
    if (
      isServerFile &&
      /\bfetch\s*\(\s*[`'"]/.test(line) &&
      !/\bfetch\s*\(\s*[`'"]\//.test(line) &&
      /\$\{[^}]*\b(?:request|req\b|query|params|body|headers|input|searchParams|redirect|target|host\b|href|redirectUri|callback)\b[^}]*\}/.test(
        line,
      )
    ) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "ssrf-fetch",
        message:
          "fetch() with request-derived absolute URL — verify the host is allowlisted and input cannot redirect the request",
        severity: "warning",
      });
    }

    // ── SSRF (error): fetch(<identifier|property>) / event.fetch(...) in a server
    // file without an egress guard. No variable-name allowlist: the target is
    // flagged when it is request-derived (request.json/formData/searchParams) or
    // when it is unresolved in a file that reads request input. String literals,
    // `new URL(...)` literals, `/`-relative values, configured constants and
    // `// ssrf-allow: <reason>` lines pass.
    if (isServerFile && !hasEgressGuard && !hasLineEscape(lines, i, "ssrf-allow")) {
      const callArg =
        line.match(/\bevent\.fetch\s*\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[,)]/) ??
        line.match(/(?<![.\w])fetch\s*\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[,)]/);
      if (callArg) {
        const argName = callArg[1];
        const root = argName.split(".")[0];
        requestDerived ??= collectRequestDerived(content);
        declaredNames ??= collectDeclaredIdentifiers(content);
        const relativeTarget = initializersOf(lines, root).some((init) => /^\s*["'`]\//.test(init));
        const constantTarget = /^[A-Z][A-Z0-9_]*$/.test(root);
        const derived = requestDerived.has(root) || (hasRequestInput && !declaredNames.has(root));
        if (derived && !relativeTarget && !constantTarget) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "ssrf-unguarded-fetch",
            message: `fetch(${argName}) on a server path without validateEgressUrl/safeFetch/saveRemoteMedia — request-controlled targets must go through the egress guard (blocks private IPs, metadata, DNS rebinding)`,
            severity: "error",
          });
        }
      }
    }

    // ── XSS sinks (warning)
    if (/\b(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "xss-sink",
        message:
          "DOM XSS sink — use textContent or Svelte templating instead of raw HTML assignment",
        severity: "warning",
      });
    }

    // ── IP spoofing (error): raw x-forwarded-for header lookup in server code
    if (isServerFile && !relPath.includes("hook-utils.ts") && !relPath.includes("threat-scan.ts")) {
      if (
        /(?:headers\.(?:get|has)\s*\(\s*["']x-forwarded-for["']|headers\[["']x-forwarded-for["']\]|getHeader\([^)]*["']x-forwarded-for["']\))/i.test(
          line,
        )
      ) {
        violations.push({
          path: relPath,
          line: i + 1,
          category: "ip-spoofing-x-forwarded-for",
          message:
            "Raw x-forwarded-for header lookup detected — use getClientIp(event) from @utils/hook-utils to prevent IP spoofing bypasses",
          severity: "error",
        });
      }
    }

    // ── Blocking Redis keys() command (error)
    if (/\bredis\.keys\s*\(/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "blocking-redis-keys",
        message:
          "redis.keys() blocks the single-threaded Redis event loop — use scanIterator() or bounded scanning",
        severity: "error",
      });
    }

    // ── Loopback hostname prefix bypass (error): startsWith("localhost") matches localhost.evil.com
    if (/\.startsWith\s*\(\s*["'](?:localhost|127\.0\.0\.1|\[::1\])["']\s*\)/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "loopback-prefix-bypass",
        message:
          'startsWith("localhost" | "127.0.0.1" | "[::1]") matches subdomain prefixes (e.g. localhost.evil.com) — check exact equality or startsWith("localhost:")',
        severity: "error",
      });
    }

    // ── Tenant spoofing via raw x-tenant-id header lookup outside sanctioned tenant resolvers (error)
    if (
      isServerFile &&
      !/request-tenant\.ts$|handle-local-context\.ts$|tenant-security\.ts$|test-bypass\.server\.ts$|handlers[\\/]testing\.ts$/.test(
        relPath,
      ) &&
      /headers\.(?:get|has)\s*\(\s*["']x-tenant-id["']\s*\)/i.test(line)
    ) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "tenant-spoofing-x-tenant-id",
        message:
          "Raw x-tenant-id header lookup detected — use event.locals.tenantId or resolveRequestTenant() so unauthenticated callers cannot spoof tenant scope",
        severity: "error",
      });
    }

    // ── Bare NODE_ENV === "test" gating in hooks or testing API (error, AGENTS.md §4)
    if (
      /(?:^|[\\/])(?:hooks|routes[\\/]api[\\/]testing)[\\/]/.test(relPath) &&
      /\bNODE_ENV\s*===\s*["']test["']/.test(line)
    ) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "test-mode-bare-node-env",
        message:
          'Test-mode overrides in hooks/testing API must be gated on TEST_MODE === "true" / PLAYWRIGHT_TEST === "true", never bare NODE_ENV === "test" (AGENTS.md §4)',
        severity: "error",
      });
    }
  }

  // ── Privilege escalation: any server path that feeds request JSON into
  // updateUserAttributes / user attribute writes without a privilege policy.
  const hasPrivilegePolicy =
    /\bstripPrivilegedUserFields\b|\bstripPrivilegeEscalationFields\b|\bsanitizeClientUserAttributePatch\b|\bPRIVILEGED_USER_FIELDS\b|\bPRIVILEGE_ESCALATION_FIELDS\b|\bhasPrivilegedUserFields\b|\ballowPrivilegeEscalation\b/.test(
      content,
    );
  // The write is the CALL to updateUserAttributes — dispatchers, permission
  // maps and docs may name the "update-user-attributes" action (or import
  // handlers/auth) without ever writing user attributes, so the bare route
  // literal must not arm this rule.
  const callsUpdateUserAttributes = /\bupdateUserAttributes\s*\(/.test(content);
  const isUserAttrApiPath =
    /handlers[\\/]auth|updateUserAttributesRoute|handleUpdateUserAttributes|handleUserSpecificRoutes/.test(
      relPath + content,
    ) ||
    (/[\\/]routes[\\/]api[\\/]/.test(relPath) &&
      /\bupdateUserAttributes\b/.test(content) &&
      /\brequest\.json\b|\.json\(\)/.test(content));

  if (
    isServerFile &&
    isUserAttrApiPath &&
    callsUpdateUserAttributes &&
    /\brequest\.json\b|\.json\(\)/.test(content) &&
    !hasPrivilegePolicy
  ) {
    violations.push({
      path: relPath,
      line: 1,
      category: "privilege-field-write",
      message:
        "User attribute update accepts request JSON without stripPrivilegedUserFields / sanitizeClientUserAttributePatch / allowPrivilegeEscalation — callers can set role/isAdmin (privilege escalation)",
      severity: "error",
    });
  }

  // Line-level: updateUserAttributes(..., body|data|payload) after request.json in
  // API handlers without any privilege policy in the file (covers /user/:id PUT bypass)
  if (isServerFile && /[\\/](handlers|routes)[\\/]/.test(relPath) && !hasPrivilegePolicy) {
    for (let i = 0; i < lines.length; i++) {
      const line = stripComments(lines[i]);
      if (
        /\bupdateUserAttributes\s*\(/.test(line) &&
        /\b(data|body|payload|attrs|attributes|updates|raw|newUserData)\b/.test(line)
      ) {
        // Look back a short window for request.json assignment of that variable
        const window = lines.slice(Math.max(0, i - 25), i + 1).join("\n");
        if (/\brequest\.json\b|\.json\(\)/.test(window)) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "privilege-field-write",
            message:
              "updateUserAttributes() receives request-derived data without a privilege policy in this file — strip role/isAdmin (stripPrivilegedUserFields) or pass allowPrivilegeEscalation only for admins",
            severity: "error",
          });
          break; // one finding per file is enough
        }
      }
    }
  }

  // Adapter/auth write path must fail-closed on escalation fields
  if (
    /auth-user|relational-auth|databases[\\/]auth[\\/]index/.test(relPath) &&
    /\bupdateUserAttributes\b/.test(content) &&
    !/\bstripPrivilegeEscalationFields\b|\ballowPrivilegeEscalation\b/.test(content)
  ) {
    violations.push({
      path: relPath,
      line: 1,
      category: "privilege-adapter-unguarded",
      message:
        "updateUserAttributes adapter/facade must call stripPrivilegeEscalationFields unless allowPrivilegeEscalation is set (fail-closed privilege escalation defense)",
      severity: "error",
    });
  }

  // ── SVG streaming bypass: media service must force sanitize (never stream raw SVG)
  if (
    /media-service/.test(relPath) &&
    /\bsanitizeSvg\b/.test(content) &&
    /\.stream\s*\(/.test(content)
  ) {
    const hasAlwaysSanitize =
      /\bMAX_SVG_BYTES\b|\bbufferAndSanitizeSvg\b|ALWAYS buffer \+ sanitize|always sanitize SVG|SVG.*streaming path/i.test(
        content,
      );
    if (!hasAlwaysSanitize) {
      violations.push({
        path: relPath,
        line: 1,
        category: "svg-stream-bypass",
        message:
          "sanitizeSvg exists alongside file.stream() without MAX_SVG_BYTES/bufferAndSanitizeSvg — large SVG uploads may skip sanitization (stored XSS)",
        severity: "error",
      });
    }
  }

  // ── Setup complete / admin mint: must gate on isSetupComplete (admin takeover class)
  if (
    isServerFile &&
    (/handlers[\\/]setup|routes[\\/]setup[\\/]setup\.server/.test(relPath) ||
      /handleCompleteSetup|function completeSetup\b/.test(content))
  ) {
    if (
      (/\bcreateUserAndSession\b/.test(content) || /\brole:\s*["']admin["']/.test(content)) &&
      !/\bisSetupComplete\b/.test(content)
    ) {
      violations.push({
        path: relPath,
        line: 1,
        category: "setup-complete-unguarded",
        message:
          "Setup complete path creates/promotes admin without isSetupComplete() gate — unauthenticated re-setup can mint administrator sessions after install",
        severity: "error",
      });
    }
  }

  // ── classifyRequest must not treat post-install /api/setup as public forever
  if (
    /hook-utils/.test(relPath) &&
    /\bisBootstrapRoute\b/.test(content) &&
    /\bclassifyRequest\b/.test(content)
  ) {
    if (
      !/setupApiLocked|\/api\/setup.*isSetupComplete|isSetupComplete.*\/api\/setup/.test(content)
    ) {
      violations.push({
        path: relPath,
        line: 1,
        category: "setup-api-public-after-install",
        message:
          "classifyRequest marks bootstrap (incl. /api/setup) as public without isSetupComplete lock — post-install unauthenticated setup APIs enable admin takeover (CWE-306)",
        severity: "error",
      });
    }
  }

  // ── Remote media upload action: must use saveRemoteMedia + media:write
  // (SSRF + authz class — action must not rely on load-only permission checks)
  if (isServerFile && /\bremoteUpload\b/.test(content) && /\bremoteUrls\b/.test(content)) {
    const usesSafeRemote =
      /\bsaveRemoteMedia\b/.test(content) ||
      (/\bvalidateEgressUrl\b/.test(content) && /\bsafeFetch\b/.test(content));
    if (!usesSafeRemote) {
      violations.push({
        path: relPath,
        line: 1,
        category: "ssrf-remote-upload-unguarded",
        message:
          "remoteUpload accepts remoteUrls without saveRemoteMedia / validateEgressUrl+safeFetch — server-side fetch of user URLs is an SSRF sink (private IP / metadata / non-blind if body stored)",
        severity: "error",
      });
    }
    if (!/\brequirePagePermission\b/.test(content) || !/media:write/.test(content)) {
      violations.push({
        path: relPath,
        line: 1,
        category: "media-action-missing-write-permission",
        message:
          "remoteUpload action must require media:write via requirePagePermission (load-only media checks can be bypassed by POSTing the action directly)",
        severity: "error",
      });
    }
  }

  // ── Code Fragmentation Detection & Prevention ──────────────────────────────
  const isTestOrDocFile = /[\\/](tests|docs|scripts)[\\/]|\.(?:test|spec)\.[tj]sx?$/.test(relPath);

  if (!isTestOrDocFile) {
    // 1. Ad-hoc admin check fragmentation
    const isAuthDefinitionFile =
      /databases[\\/]auth[\\/]constants\.ts|databases[\\/]database-resilience\.ts|databases[\\/]core[\\/]relational-auth\.ts|utils[\\/]theme-merge\.ts|routes[\\/]login[\\/]auth\.remote\.ts/.test(
        relPath,
      );
    if (!isAuthDefinitionFile) {
      for (let i = 0; i < lines.length; i++) {
        const line = stripComments(lines[i]).trim();
        if (!line || line.startsWith("*")) continue;
        if (
          /\b(?:user|caller|locals\.user)\??\.(?:role\s*===\s*["']admin["']|isAdmin\s*===\s*true)/.test(
            line,
          ) &&
          !/\bisAdmin\s*\(/.test(line)
        ) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "admin-role-fragmentation",
            message:
              "Ad-hoc admin check — use canonical isAdmin(user) from @src/databases/auth/constants to support SQLite integer flags (1) and super-admin",
            severity: "error",
          });
        }
      }
    }

    // 2. Ad-hoc session cookie deletion fragmentation
    const isConstantsFile = /databases[\\/]auth[\\/]constants\.ts/.test(relPath);
    if (!isConstantsFile) {
      for (let i = 0; i < lines.length; i++) {
        const line = stripComments(lines[i]).trim();
        if (!line || line.startsWith("*")) continue;
        if (
          /\bcookies\.delete\(\s*(?:SESSION_COOKIE_NAME|["'](?:auth_sessions|__Host-auth_sessions|__Secure-auth_sessions)["'])/.test(
            line,
          )
        ) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "cookie-clear-fragmentation",
            message:
              "Direct session cookie deletion — use clearAllSessionCookies(cookies) from @src/databases/auth/constants for complete multi-variant (RFC 6265bis) cleanup",
            severity: "error",
          });
        }
      }
    }

    // 3. Ad-hoc collection path construction
    const isFirstCollectionFile =
      /content[\\/]first-collection\.ts|routes[\\/]setup[\\/]seed\.ts/.test(relPath);
    if (!isFirstCollectionFile) {
      for (let i = 0; i < lines.length; i++) {
        const line = stripComments(lines[i]).trim();
        if (!line || line.startsWith("*")) continue;
        if (
          /\bpath\s*:\s*[`'"]\/collection\/\$\{/.test(line) ||
          /\bpath\s*\|\|\s*[`'"]\/collection\/\$\{/.test(line)
        ) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "collection-path-fragmentation",
            message:
              "Ad-hoc /collection/${...} path construction — use getSchemaPath(schema) or getNodePath(node) from @src/content/first-collection",
            severity: "error",
          });
        }
      }
    }

    // 4. Legacy svelte/store import fragmentation
    const isLegacyStoreAllowedFile = /stores[\\/]system[\\/](?:state\.svelte\.ts|metrics\.ts)/.test(
      relPath,
    );
    if (!isLegacyStoreAllowedFile) {
      for (let i = 0; i < lines.length; i++) {
        const line = stripComments(lines[i]).trim();
        if (!line || line.startsWith("*")) continue;
        if (/\b(?:from|import)\s+["']svelte\/store["']/.test(line)) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "legacy-store-fragmentation",
            message:
              "Legacy svelte/store import — use native Svelte 5 runes ($state, $derived) instead of writable/readable stores",
            severity: "error",
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Core DB-interpolation scan (SQL + NoSQL). Exported for unit tests.
 */
export function scanDbRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const lines = content.split("\n");
  const hasGuard = IDENTIFIER_GUARD.test(content);
  const hasEscapeHelper = /function\s+escapeRegex|const\s+escapeRegex|escapeRegExp\s*[=(]/.test(
    content,
  );
  // Dedupe: one violation per (line, category, expression)
  const seen = new Set<string>();
  const push = (v: RiskViolation, expr: string) => {
    const key = `${v.line}:${v.category}:${expr}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(v);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComments(raw);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    // ── Rule 1 (error): MongoDB server-side JS execution (RCE class)
    if (/\$\s*where\s*[:=]|\$\s*function\s*[:=]|\$\s*accumulator\s*[:=]|\$where\s*\(/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "mongodb-js-execution",
        message:
          "MongoDB $where/$function/$accumulator executes server-side JS — replace with safe operators or an allowlisted validation",
        severity: "error",
      });
    }

    // ── Rule 2 (warning): regex injection via interpolation.
    // Skipped when the pattern is escaped before interpolation: the `\$&`
    // replacement idiom (look back 40 lines), an escape helper in the
    // expression (escape(...)), an uppercase constant (TAG_PATTERN), a
    // `\${` regex-escaped interpolation, or a file-level escapeRegex helper.
    if (
      !hasEscapeHelper &&
      /\b(?:new\s+)?RegExp\s*\(/.test(line) &&
      /\$\{/.test(line) &&
      !SAFE_EXPR.test(line) &&
      !/\\\$\{/.test(line)
    ) {
      const lookback = lines.slice(Math.max(0, i - 40), i + 1).join("\n");
      if (!lookback.includes("\\$&")) {
        const flagged = [...line.matchAll(/\$\{([^}]*)\}/g)].some(
          (m) => !/^[A-Z][A-Z0-9_]*$/.test(m[1].trim()), // uppercase constants are compile-time
        );
        if (flagged) {
          violations.push({
            path: relPath,
            line: i + 1,
            category: "regex-interpolation",
            message:
              "RegExp built from interpolated input — escape pattern input (pattern.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&')) or use literal matching",
            severity: "warning",
          });
        }
      }
    }

    // A line is SQL only when it starts an SQL statement or feeds a DB call.
    const inSqlBlock = SQL_STMT_START.test(line) || (DB_CALL.test(line) && SQL_VERB.test(line));

    // ── Rule 3 (error): SQL value interpolation — '${...}' / "${...}" in SQL context
    if (inSqlBlock && /['"`]\$\{/.test(line)) {
      const tagged = TAGGED_TEMPLATE.test(line);
      for (const m of line.matchAll(/['"`]\$\{([^}]*)\}/g)) {
        const expr = m[1].trim();
        if (!expr || !SIMPLE_EXPR.test(expr) || SAFE_EXPR.test(expr)) continue;
        if (tagged) continue; // tagged templates parameterize interpolations
        // Files with identifier guards may use a validated name as a literal
        // (e.g. SQLite FTS5 content='${collection}') — collection was asserted
        // identifier-safe before the query was built. Same for schema-derived
        // column metadata (idCol.name / col.name) in quoted identifier positions.
        if (hasGuard && /^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) continue;
        if (hasGuard && /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) continue;
        push(
          {
            path: relPath,
            line: i + 1,
            category: "sql-value-interpolation",
            message: `SQL value interpolation (\${${expr}}) — bind as a parameter (? / $1) or use a tagged template instead of string-interpolating values`,
            severity: "error",
          },
          expr,
        );
      }
    }

    // ── Rule 4 (error): concatenating values into SQL strings.
    // The verb is the context: `const sql = "SELECT ... '" + x + "'"` is built
    // here and executed later, so no DB call appears on this line.
    if (SQL_VERB.test(line) && /['"`]\s*\+\s*[^'";,)\s]+\s*\+\s*['"`]/.test(line)) {
      const expr = line.match(/['"`]\s*\+\s*([^'";,)\s]+)\s*\+\s*['"`]/)?.[1];
      if (expr && !/^['"`]/.test(expr) && !/\b(sql\.|Number\(|String\()/.test(expr)) {
        push(
          {
            path: relPath,
            line: i + 1,
            category: "sql-concat-interpolation",
            message: `SQL built by string concatenation (+ ${expr} +) — use bound parameters`,
            severity: "error",
          },
          expr,
        );
      }
    }

    // ── Rule 5 (warning): SQL identifier interpolation without escaping.
    // Skipped for files that already validate identifiers (assert/escape guards).
    if (!hasGuard && inSqlBlock && /\$\{/.test(line) && !TAGGED_TEMPLATE.test(line)) {
      for (const m of line.matchAll(/\$\{([^}]*)\}/g)) {
        const expr = m[1].trim();
        if (!expr || !SIMPLE_EXPR.test(expr) || SAFE_EXPR.test(expr)) continue;
        if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(expr)) {
          push(
            {
              path: relPath,
              line: i + 1,
              category: "sql-identifier-interpolation",
              message: `SQL identifier interpolation (\${${expr}}) — escape-quote it (" doubled, backticks doubled) or validate /^[A-Za-z_][A-Za-z0-9_]*$/`,
              severity: "warning",
            },
            expr,
          );
        }
      }
    }
  }
  return violations;
}

/**
 * Core SvelteKit-config scan. Exported for unit tests.
 */
export function scanSvelteKitRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const lines = content.split("\n");
  // The double-submit CSRF cookie MUST be JS-readable (httpOnly:false is the
  // intended design — the token is not a session secret).
  const isCsrfCookie = content.includes("CSRF_TOKEN_COOKIE_NAME");

  for (let i = 0; i < lines.length; i++) {
    const line = stripComments(lines[i]);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    if (/\bcheckOrigin\s*:\s*false\b/.test(line) || /\bcsrf\s*:\s*false\b/.test(line)) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "sveltekit-csrf-disabled",
        message: "SvelteKit CSRF origin check disabled — remove checkOrigin:false/csrf:false",
        severity: "error",
      });
    }
    if (/\bhttpOnly\s*:\s*false\b/.test(line) && !isCsrfCookie) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "cookie-not-httponly",
        message: "Cookie without httpOnly — session/auth cookies must be httpOnly:true",
        severity: "error",
      });
    }
  }
  return violations;
}

/**
 * AST SQL scan — multi-line statements.
 *
 * The line-based rules in `scanDbRisk` only see one physical line, so a
 * statement whose verb (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `WHERE`, `SET`,
 * `FROM`) sits on a different line from the interpolation escapes them. This
 * pass walks `ts.TemplateExpression` / `ts.BinaryExpression` (`+`) nodes so the
 * verb and the interpolation are judged together.
 *
 * Exported for unit tests.
 */
export function scanAstSqlRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  if (!relPath.endsWith(".ts")) return violations;

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true);
  } catch {
    return violations;
  }

  const hasGuard = IDENTIFIER_GUARD.test(content);
  const seen = new Set<string>();
  const push = (node: ts.Node, expression: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const key = `${line}:${expression}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({
      path: relPath,
      line: line + 1,
      category: "sql-template-value-interpolation",
      message: `SQL value interpolation (\${${expression}}) in a multi-line statement — bind as a parameter (? / $1) or use a tagged template instead of string-interpolating values`,
      severity: "error",
    });
  };

  /** Uppercase names are compile-time constants, and calls are validated helpers. */
  const isSafeExpression = (expression: string): boolean =>
    SAFE_EXPR.test(expression) ||
    !SIMPLE_EXPR.test(expression) ||
    /^[A-Z][A-Z0-9_]*$/.test(expression) ||
    (hasGuard && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(expression));

  const flattenPlus = (node: ts.Expression): ts.Expression[] => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [...flattenPlus(node.left), ...flattenPlus(node.right)];
    }
    return [node];
  };

  const visit = (node: ts.Node) => {
    // Template literal whose head carries the SQL verb (possibly lines below the
    // backtick) and whose interpolation lands in a quoted value position.
    if (ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent)) {
      const head = node.head.text;
      if (SQL_VERB.test(head)) {
        let previous = head;
        for (const span of node.templateSpans) {
          const expression = span.expression.getText(sourceFile).trim();
          const quotedValue = /["']\s*$/.test(previous);
          if (quotedValue && expression && !isSafeExpression(expression)) push(node, expression);
          previous = span.literal.text;
        }
      }
    }

    // Cross-line concatenation: `"... WHERE id = '" + id + "'"`.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if (SQL_VERB.test(node.getText(sourceFile))) {
        const operands = flattenPlus(node);
        for (let index = 0; index < operands.length - 1; index++) {
          const current = operands[index];
          const currentText = current.getText(sourceFile);
          if (!/["']\s*$/.test(currentText)) continue;
          if (!ts.isStringLiteral(current) && !ts.isNoSubstitutionTemplateLiteral(current))
            continue;
          const next = operands[index + 1];
          if (ts.isStringLiteral(next) || ts.isNoSubstitutionTemplateLiteral(next)) continue;
          const nextText = next.getText(sourceFile).trim();
          if (isSafeExpression(nextText)) continue;
          push(node, nextText);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

/** Secret-ish identifiers whose comparison must be constant-time. */
const SECRET_IDENTIFIER = /(?:secret|token|signature|hmac|apiKey|api_key|csrf|otp|hash)/i;
/** Credential nouns — a bare content-hash identity check is not an oracle. */
const CREDENTIAL_IDENTIFIER = /(?:secret|token|signature|hmac|apiKey|api_key|csrf|otp)/i;

/** `hashedToken` vs `token` decides which column to read — not a secret compare. */
function isHashOfSelf(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return (
    (left.startsWith("hashed") || left.startsWith("hash")) &&
    right.length > 0 &&
    left.endsWith(right)
  );
}

/**
 * Context-aware AST security analysis using the TypeScript compiler API.
 * Catches complex patterns that line-based regex cannot reliably analyze:
 * unbounded batch blocks, prototype pollution, timing-unsafe secret
 * comparison, insecure randomness, open redirect, and missing route guards.
 */
export function scanAstRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const normPath = relPath.replace(/\\/g, "/");
  const isApiHandler = normPath.includes("routes/api/");
  if (!normPath.endsWith(".ts")) return violations;

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true);
  } catch {
    return violations;
  }

  const seen = new Set<string>();
  const pushAst = (node: ts.Node, category: string, message: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const key = `${line}:${category}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ path: relPath, line: line + 1, category, message, severity: "error" });
  };

  // ── Rule: missing auth/tenant guard on a route module that reads request input.
  const isRouteModule = /\/(?:\+server|\+page\.server)\.ts$/.test(normPath);
  const isExemptRoute =
    /\/(?:auth|setup|login)\//.test(normPath) ||
    /(?:^|\/)public(?:\/|\.)/.test(normPath) ||
    /\/\/\s*public-endpoint:\s*\S/.test(content);
  const hasAuthGuard =
    /\blocals\??\.(?:user|tenantId)\b|\bgetAuthenticatedUser\b|\brequirePermission\b|\brequirePagePermission\b|\bcheckEndpointPermission\b|\}\s*=\s*(?:event\.)?locals\b/.test(
      content,
    );
  if (isRouteModule && !isExemptRoute && !hasAuthGuard && REQUEST_INPUT.test(content)) {
    violations.push({
      path: relPath,
      line: 1,
      category: "missing-auth-guard",
      message:
        "Route module reads request input without an auth/tenant guard — require locals.user/tenantId, getAuthenticatedUser, requirePermission, requirePagePermission or checkEndpointPermission (declare `// public-endpoint: <reason>` for intentionally public routes)",
      severity: "error",
    });
  }

  const tainted = collectRequestDerived(content);
  const directlyTainted = collectDirectRequestDerived(content);
  const hasMergeGuard =
    /__proto__|sanitizeMerge|safeAssign|PROTO_KEYS|UNSAFE_(?:OBJECT_)?KEYS|hasPrototypePollution/.test(
      content,
    );
  const hasTimingSafe = /\btimingSafeEqual\b|\bconstantTime\w*Equal\b/.test(content);
  const hasRedirectGuard =
    /\bsafeRedirect\b|\bisSafeRedirect\b|\bsanitizeRedirect\b|\.origin\s*===|\bstartsWith\s*\(\s*["']\/[^"']*["']\s*\)/.test(
      content,
    );
  const isSecurityPath = /(?:auth|security|token|session|csrf|otp|password|reset)/i.test(normPath);

  /** Unwrap wrappers and decide whether a node's value came from the request. */
  const fromRequest = (node: ts.Node): boolean => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isTypeAssertionExpression(node)
    ) {
      return fromRequest(node.expression);
    }
    if (ts.isIdentifier(node)) return tainted.has(node.text);
    if (ts.isPropertyAccessExpression(node)) return fromRequest(node.expression);
    if (ts.isElementAccessExpression(node)) return fromRequest(node.expression);
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      return (
        /\.(?:get|json|formData|text)$/.test(callee) && /searchParams|request|url/.test(callee)
      );
    }
    return false;
  };

  const isNumeric3xx = (node: ts.Node): boolean =>
    ts.isNumericLiteral(node) && /^3\d\d$/.test(node.text);

  const visit = (node: ts.Node) => {
    // ── Rule: Unbounded Batch Action Blocks (API handlers only).
    if (isApiHandler && ts.isIfStatement(node)) {
      const condText = node.expression.getText(sourceFile);
      if (/action\s*===?\s*["']batch["']|method\s*===?\s*["']batch["']/.test(condText)) {
        const blockText = node.thenStatement.getText(sourceFile);
        const hasUpperLimit =
          /\.length\s*>\s*\d+|\.length\s*>=\s*\d+|MAX_.*BATCH|INVALID_BATCH_SIZE/.test(blockText);
        if (!hasUpperLimit) {
          pushAst(
            node,
            "batch-size-unbounded",
            "Batch action block lacks an upper-bound array length check (e.g. ids.length > MAX_BATCH_SIZE) — vulnerable to payload exhaustion DoS",
          );
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);

      // ── Rule: prototype pollution via Object.assign / deepMerge of request data.
      if (!hasMergeGuard) {
        if (callee === "Object.assign" && node.arguments.slice(1).some(fromRequest)) {
          pushAst(
            node,
            "prototype-pollution-request-merge",
            "Object.assign(<target>, request data) copies `__proto__` through [[Set]] — strip __proto__/constructor/prototype (or use safeAssign/sanitizeMerge)",
          );
        }
        if (/^(?:\w+\.)?deepMerge$/.test(callee) && node.arguments.some(fromRequest)) {
          pushAst(
            node,
            "prototype-pollution-request-merge",
            "deepMerge() merging request data — recursively copying attacker keys can pollute Object.prototype; strip __proto__/constructor/prototype first",
          );
        }
      }

      // ── Rule: insecure randomness on security-sensitive paths.
      if (callee === "Math.random" && isSecurityPath) {
        pushAst(
          node,
          "insecure-randomness",
          "Math.random() on an auth/security/token/session path — use crypto.getRandomValues()/randomUUID() (Math.random is not a CSPRNG)",
        );
      }

      // ── Rule: timing-unsafe secret comparison via .includes / .startsWith.
      if (!hasTimingSafe) {
        const method = /^([A-Za-z_$][\w$]*)\.(?:includes|startsWith)$/.exec(callee);
        const arg = node.arguments[0];
        if (method && SECRET_IDENTIFIER.test(method[1]) && arg && ts.isIdentifier(arg)) {
          if (SECRET_IDENTIFIER.test(arg.text) && !isHashOfSelf(method[1], arg.text)) {
            pushAst(
              node,
              "timing-unsafe-comparison",
              `${method[1]}.${callee.split(".").pop()}(...) compares a secret — use timingSafeEqual (node:crypto) to avoid a byte-by-byte timing oracle`,
            );
          }
        }
      }

      // ── Rule: open redirect to a request-derived target.
      if (!hasRedirectGuard) {
        if (
          callee === "redirect" &&
          node.arguments.length >= 2 &&
          isNumeric3xx(node.arguments[0]) &&
          fromRequest(node.arguments[1])
        ) {
          pushAst(
            node,
            "open-redirect",
            'redirect(3xx, request-derived target) without a same-origin check — validate with safeRedirect or `target.startsWith("/")`',
          );
        }
        if (
          /^(?:Response|Response\.prototype)\.redirect$/.test(callee) &&
          node.arguments.length >= 2 &&
          fromRequest(node.arguments[0]) &&
          isNumeric3xx(node.arguments[1])
        ) {
          pushAst(
            node,
            "open-redirect",
            'Response.redirect request-derived target without a same-origin check — validate with safeRedirect or `target.startsWith("/")`',
          );
        }
      }
    }

    // ── Rule: timing-unsafe `secret === candidate` comparison.
    if (
      !hasTimingSafe &&
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
    ) {
      const { left, right } = node;
      if (ts.isIdentifier(left) && ts.isIdentifier(right)) {
        const pair = [left.text, right.text];
        const credentialPair = pair.every((name) => SECRET_IDENTIFIER.test(name));
        const hasCredentialNoun = pair.some((name) => CREDENTIAL_IDENTIFIER.test(name));
        // Compile-time constants are sentinels/masks, and `hash === hash` is a
        // content-identity check — neither is a server-held secret oracle.
        const compileTimeConstant = pair.some((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
        const hashOfSelf =
          isHashOfSelf(left.text, right.text) || isHashOfSelf(right.text, left.text);
        if (credentialPair && hasCredentialNoun && !compileTimeConstant && !hashOfSelf) {
          pushAst(
            node,
            "timing-unsafe-comparison",
            `${left.text} ${node.operatorToken.getText(sourceFile)} ${right.text} compares a secret with an early-exit operator — use timingSafeEqual (node:crypto)`,
          );
        }
      }
    }

    // ── Rule: prototype pollution via object spread of request data.
    // Object spread itself uses CreateDataProperty, so only a stored merge (two or
    // more members, spread onto an existing shape, not a call argument the callee
    // maps itself) of directly request-derived data is reported.
    if (
      !hasMergeGuard &&
      ts.isObjectLiteralExpression(node) &&
      node.properties.length >= 2 &&
      !ts.isCallExpression(node.parent)
    ) {
      for (const property of node.properties) {
        if (!ts.isSpreadAssignment(property)) continue;
        const expression = property.expression;
        const spreadIdentifier =
          ts.isIdentifier(expression) && directlyTainted.has(expression.text);
        const inlineJson =
          /request\.json\s*\(|\.json\s*\(/.test(expression.getText(sourceFile)) &&
          !ts.isReturnStatement(node.parent);
        if (spreadIdentifier || inlineJson) {
          pushAst(
            node,
            "prototype-pollution-request-merge",
            "Object spread-merge of request JSON into a persisted object — strip __proto__/constructor/prototype (or use safeAssign/sanitizeMerge) before merging",
          );
          break;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) collectFiles(full, out);
      else if (/\.(ts|js|svelte)$/.test(name)) out.push(full);
    } catch {
      /* skip */
    }
  }
  return out;
}

function main() {
  const violations: RiskViolation[] = [];

  // Global scan over the entire src tree (vendored types + generated code excluded)
  const allFiles = collectFiles(join(ROOT, "src"));
  for (const file of allFiles) {
    const rel = relative(ROOT, file);
    if (EXCLUDED.some((rx) => rx.test(rel))) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    const fileViolations = [
      ...scanDbRisk(rel, content),
      ...scanAstSqlRisk(rel, content),
      ...scanGlobalRisk(rel, content),
      ...scanSvelteKitRisk(rel, content),
      ...scanAstRisk(rel, content),
    ];
    // Scoped suppressions: `slop:suppress [rule-id]` covers the offending line or
    // the line directly above it — never the whole file.
    violations.push(...fileViolations.filter((v) => !isSuppressed(lines, v.line - 1, v.category)));
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  for (const v of violations) {
    const tag = v.severity === "error" ? "❌" : "⚠️";
    console.log(`${tag} ${v.path}:${v.line} [${v.category}] ${v.message}`);
  }

  console.log(
    `\n${violations.length} findings (${errors.length} errors, ${warnings.length} warnings) over ${allFiles.length} files`,
  );
  if (errors.length > 0 || (STRICT && violations.length > 0)) {
    console.error("❌ Global security risk scan failed");
    process.exit(1);
  }
  console.log("✅ Global security risk scan passed");
}

if (import.meta.main) main();
