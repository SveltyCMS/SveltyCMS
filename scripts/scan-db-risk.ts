#!/usr/bin/env bun
/**
 * @file scripts/scan-db-risk.ts
 * @description
 * Static risk scanner for the DATABASE layer across all 4 adapters
 * (SQLite, MariaDB/MySQL, PostgreSQL, MongoDB) plus SvelteKit config risks.
 *
 * The dependency tree is covered by `bun audit` + the OSV global database
 * (see scripts/scan-osv.ts) — this scanner covers what no external database
 * can: vulnerabilities in OUR own adapter code.
 *
 * ### What it checks
 * - **SQL value interpolation** (`'${value}'` inside SQL strings) — the
 *   WordPress `author__not_in` SQLi class. Values must be bound parameters
 *   (`?`, `$1`) or tagged templates (sql`...`, raw`...`).
 * - **SQL string concatenation** of values into statements.
 * - **SQL identifier interpolation** without escaping (warning tier).
 * - **MongoDB `$where` / `$function` / `$accumulator`** — server-side JS
 *   execution (RCE class). Must be statically forbidden or validated.
 * - **Regex injection** (`RegExp('...${...}')`) in DB adapters.
 * - **SvelteKit CSRF protection disabled** (`checkOrigin: false`, `csrf: false`).
 * - **Non-httpOnly cookies** (session tokens must be httpOnly).
 *
 * ### Usage
 *   bun run scripts/scan-db-risk.ts          # scan (warnings tolerated)
 *   bun run scripts/scan-db-risk.ts --strict # exit 1 on any finding
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

// Directories where raw queries are legitimately constructed (all 4 adapters + connectors).
const DB_SCOPES = [
  join(ROOT, "src", "databases"),
  join(ROOT, "src", "plugins"),
  join(ROOT, "src", "services"),
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
const SIMPLE_EXPR = /^[A-Za-z0-9_.\[\]'" ]+$/;

function stripComments(line: string): string {
  return line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
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

    // ── Rule 2 (warning): regex injection via interpolation in DB layer.
    // Skipped when the pattern is regex-escaped before interpolation — the
    // `\$&` replacement string is the signature of the escaping idiom
    // (e.g. pattern.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")). Escape and
    // RegExp call often live on adjacent lines, so look back 15 lines.
    const lookback = lines.slice(Math.max(0, i - 15), i + 1).join("\n");
    if (/\b(?:new\s+)?RegExp\s*\(/.test(line) && /\$\{/.test(line) && !lookback.includes("\\$&")) {
      violations.push({
        path: relPath,
        line: i + 1,
        category: "regex-interpolation",
        message:
          "RegExp built from interpolated input — escape pattern input (pattern.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&')) or use literal matching",
        severity: "warning",
      });
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
    if (/\bhttpOnly\s*:\s*false\b/.test(line)) {
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

  for (const scope of DB_SCOPES) {
    if (!statSync(scope, { throwIfNoEntry: false })) continue;
    for (const file of collectFiles(scope)) {
      const content = readFileSync(file, "utf8");
      if (content.includes("slop:suppress")) continue;
      violations.push(...scanDbRisk(relative(ROOT, file), content));
    }
  }
  // SvelteKit config risks apply to hooks/config/root layout — the whole src.
  const allFiles = collectFiles(join(ROOT, "src")).filter((f) =>
    /(hooks|svelte\.config|vite\.config|layout|svelte\.ts|\.svelte)$/.test(f),
  );
  for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    violations.push(...scanSvelteKitRisk(relative(ROOT, file), content));
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  for (const v of violations) {
    const tag = v.severity === "error" ? "❌" : "⚠️";
    console.log(`${tag} ${v.path}:${v.line} [${v.category}] ${v.message}`);
  }

  console.log(
    `\n${violations.length} findings (${errors.length} errors, ${warnings.length} warnings)`,
  );
  if (errors.length > 0 || (STRICT && violations.length > 0)) {
    console.error("❌ DB/SvelteKit risk scan failed");
    process.exit(1);
  }
  console.log("✅ DB/SvelteKit risk scan passed");
}

if (import.meta.main) main();
