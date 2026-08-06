#!/usr/bin/env bun
/**
 * @file scripts/scan-security-risk.ts
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
 * - **MongoDB `$where` / `$function` / `$accumulator`** — server-side JS
 *   execution (RCE class).
 * - **Dynamic code execution** — `eval(` / `new Function(` (RCE sinks).
 * - **SvelteKit CSRF protection disabled** (`checkOrigin: false`, `csrf: false`).
 * - **Non-httpOnly cookies** (session tokens must be httpOnly).
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
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface RiskViolation {
  path: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning";
}

const ROOT = join(import.meta.dirname, "..");
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

/**
 * Global rules — command injection, dynamic code execution, path traversal,
 * SSRF, XSS sinks. Exported for unit tests.
 */
export function scanGlobalRisk(relPath: string, content: string): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const lines = content.split("\n");
  const hasPathGuard =
    /\b(?:resolvePath|isPathInside|normalizePath|safeJoin|assertPath|pathInside|resolveUploadPath|sanitizePath|assertFilePath)\b/.test(
      content,
    );

  for (let i = 0; i < lines.length; i++) {
    const line = stripComments(lines[i]);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    // ── Dynamic code execution (error, RCE sink)
    if (/\bnew\s+Function\s*\(/.test(line) && !/new Function\('return import\(/.test(line)) {
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

    // ── SSRF: fetch with a REQUEST-DERIVED interpolated URL (warning).
    // Configured endpoints (ollamaUrl, this.baseUrl, OLLAMA_BASE) are fine —
    // only expressions that smell like request input are flagged.
    const isServerFile =
      /(\+server\.|\.server\.|hooks[\\/]|services[\\/]|databases[\\/]|setup[\\/])/.test(relPath);
    if (
      isServerFile &&
      /\bfetch\s*\(\s*[`'"]/.test(line) &&
      /\$\{[^}]*\b(?:request|req\b|query|params|body|headers|input|searchParams|redirect|target|host\b|href|redirectUri|callback)\b[^}]*\}/.test(
        line,
      )
    ) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "ssrf-fetch",
        message:
          "fetch() with request-derived URL — verify the host is allowlisted and input cannot redirect the request",
        severity: "warning",
      });
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
    const lookback = lines.slice(Math.max(0, i - 40), i + 1).join("\n");
    const hasEscapeHelper = /function\s+escapeRegex|const\s+escapeRegex|escapeRegExp\s*[=(]/.test(
      content,
    );
    if (
      /\b(?:new\s+)?RegExp\s*\(/.test(line) &&
      /\$\{/.test(line) &&
      !lookback.includes("\\$&") &&
      !SAFE_EXPR.test(line) &&
      !/\\\$\{/.test(line) &&
      !hasEscapeHelper
    ) {
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
    if (content.includes("slop:suppress")) continue;
    violations.push(...scanDbRisk(rel, content));
    violations.push(...scanGlobalRisk(rel, content));
    violations.push(...scanSvelteKitRisk(rel, content));
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
