#!/usr/bin/env bun
/**
 * @file scripts/test/mutate-core.ts
 * @description Dependency-free mutation runner for the write path.
 *
 * `tests/mutation/seam-mutation.test.ts` is an ordinary Vitest file: it mutates
 * *source text in memory* and asserts a seam's invariant. Nothing ever rewrites a
 * file on disk, so a real "does the unit suite catch this?" question was never
 * asked. This runner closes that gap without adding a mutator dependency
 * (Stryker et al. pull a plugin/babel toolchain into a tree that pins Rolldown).
 *
 * For every entry in {@link MUTATIONS} it:
 *   1. refuses to run unless `git status --porcelain -- <file>` is empty (a dirty
 *      target means another agent is editing — abort, never clobber work);
 *   2. reads the file, applies ONE exact string replacement (must occur exactly
 *      once — a silent 0/2 match would mutate the wrong thing);
 *   3. runs the mapped unit test file(s) with `bun x vitest run <file>`;
 *   4. requires a NON-ZERO exit: a passing suite means the mutation survived,
 *      i.e. the behaviour is not pinned by any test;
 *   5. restores the original bytes in `finally` and verifies with `git diff`.
 *
 * ### Usage
 *   bun run scripts/test/mutate-core.ts --dry-run         # list mutations, run nothing
 *   bun run scripts/test/mutate-core.ts --max=2           # first two mutations
 *   bun run scripts/test/mutate-core.ts                   # full write-path set
 *   bun run scripts/test/mutate-core.ts --security-only   # auth/security/egress/write-pipeline
 *   bun run scripts/test/mutate-core.ts --only=id1,id2    # explicit seam selection
 *   bun run scripts/test/mutate-core.ts --report=out.json # custom report path
 *   bun run scripts/test/mutate-core.ts --no-report       # skip the JSON report
 *
 * ### Contract
 *   exit 0  every mutation was killed
 *   exit 1  at least one mutation SURVIVED (tests still passed)
 *   exit 2  usage error
 *   exit 3  aborted: dirty target, ambiguous replacement, or failed restore
 *
 * ### Features:
 * - explicit file + mutation list (no glob discovery, no dependencies)
 * - dirty-tree guard per target, before any write
 * - try/finally restore plus a final restore pass (and SIGINT/SIGTERM handlers)
 * - `--dry-run`, `--max=<n>`, `--security-only`, `--only=<ids>`, summary table,
 *   non-zero exit on survival
 * - machine-readable report (`.mutation/report.json`) consumed by
 *   `scripts/security/check-test-strength.ts`; `--no-report` keeps the old behaviour
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export interface Mutation {
  /** Stable id used in the summary table. */
  id: string;
  /** Project-relative source file the mutation rewrites. */
  file: string;
  /** What the mutation removes, in one line. */
  description: string;
  /** Exact source text to replace — must occur exactly once. */
  find: string;
  /** Replacement text. */
  replace: string;
  /** Unit test files that must fail while the mutation is applied. */
  tests: readonly string[];
}

export type Status = "killed" | "survived" | "invalid" | "aborted";

interface Outcome {
  mutation: Mutation;
  status: Status;
  durationMs: number;
  detail: string;
}

const ROOT = join(import.meta.dirname, "../..");

const HOST = typeof Bun !== "undefined" ? process.execPath : "bun";

const EXIT_SURVIVED = 1;
const EXIT_USAGE = 2;
const EXIT_ABORTED = 3;

/** Default JSON report consumed by `scripts/security/check-test-strength.ts`. */
const DEFAULT_REPORT_PATH = ".mutation/report.json";

/** One machine-readable result row. `status` uses the same vocabulary as the CLI. */
export interface MutationReportEntry {
  id: string;
  file: string;
  description: string;
  tests: string[];
  status: Status;
  duration_ms: number;
  detail: string;
}

/**
 * Report written after a run. `killed + survived` is the denominator of the
 * mutation score; `invalid` (stale `find`) and `aborted` (dirty/concurrent
 * writer) never count for or against the tests.
 */
export interface MutationReport {
  version: 1;
  generated_at: string;
  mode: "write-path" | "security" | "all";
  totals: { total: number; killed: number; survived: number; invalid: number; aborted: number };
  mutations: MutationReportEntry[];
}

/** Build the JSON report from the in-memory outcomes. Pure — unit-tested. */
export function buildReport(
  outcomes: readonly Outcome[],
  mode: MutationReport["mode"],
): MutationReport {
  const count = (status: Status) => outcomes.filter((outcome) => outcome.status === status).length;
  return {
    version: 1,
    // Standalone script: `@utils/date` pulls `@src/paraglide/runtime`, which does
    // not resolve under plain `bun` — the report timestamp stays self-contained.
    generated_at: new Date().toISOString(),
    mode,
    totals: {
      total: outcomes.length,
      killed: count("killed"),
      survived: count("survived"),
      invalid: count("invalid"),
      aborted: count("aborted"),
    },
    mutations: outcomes.map((outcome) => ({
      id: outcome.mutation.id,
      file: outcome.mutation.file,
      description: outcome.mutation.description,
      tests: [...outcome.mutation.tests],
      status: outcome.status,
      duration_ms: outcome.durationMs,
      detail: outcome.detail,
    })),
  };
}

/** Write the report (creating `.mutation/` on first run). Absolute paths win. */
export function writeReport(path: string, report: MutationReport, root: string = ROOT): string {
  const target = isAbsolute(path) ? path : join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return target;
}

/**
 * The write-path seams: optimistic-concurrency tokens (every `If-Match`/update
 * path goes through them) and the Drizzle write-count reader (every `updateMany`
 * on the SQL adapters). Each mutation flips one documented guarantee.
 */
const MUTATIONS: readonly Mutation[] = [
  {
    id: "lock-equality",
    file: "src/utils/optimistic-lock.ts",
    description: "matchesVersion: invert the version equality (stale tokens match)",
    find: "  return currentKey === expectedKey;",
    replace: "  return currentKey !== expectedKey;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-null-token",
    file: "src/utils/optimistic-lock.ts",
    description:
      "matchesVersion: drop the absent-token short-circuit (unconditional write conflicts)",
    find: "  if (token === null) return true;",
    replace: "  if (token === null) return false;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-version-key-raw",
    file: "src/utils/optimistic-lock.ts",
    description: "versionKey: return the raw epoch string instead of the parsed number",
    find: "    if (/^\\d+$/.test(trimmed)) return Number(trimmed);",
    replace: "    if (/^\\d+$/.test(trimmed)) return trimmed as unknown as number;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-etag-date",
    file: "src/utils/optimistic-lock.ts",
    description: "versionTokenString: emit String(date) instead of ISO (ETag stops round-tripping)",
    find: '    return Number.isNaN(value.getTime()) ? "" : value.toISOString();',
    replace: '    return Number.isNaN(value.getTime()) ? "" : String(value);',
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "rows-affected-null",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: always return null (driver shape never recognized)",
    find: [
      "  const direct = read(result);",
      "  if (direct !== null) return direct;",
      "  if (Array.isArray(result) && result.length > 0) return read(result[0]);",
      "  return null;",
    ].join("\n"),
    replace: [
      "  const direct = read(result);",
      "  if (direct !== null) return null;",
      "  if (Array.isArray(result) && result.length > 0) return null;",
      "  return null;",
    ].join("\n"),
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
  {
    id: "rows-affected-precedence",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: read `changes` before `count` (postgres.js count loses)",
    find: [
      "      (value as { count?: unknown }).count ??",
      "      (value as { changes?: unknown }).changes ??",
    ].join("\n"),
    replace: [
      "      (value as { changes?: unknown }).changes ??",
      "      (value as { count?: unknown }).count ??",
    ].join("\n"),
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
  {
    id: "rows-affected-unwrap",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: drop the mysql2 tuple unwrap (affectedRows lost)",
    find: "  if (Array.isArray(result) && result.length > 0) return read(result[0]);",
    replace: "  if (Array.isArray(result) && result.length > 0) return null;",
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
];

/**
 * Security-area seams. Also part of the default run; `--security-only` selects
 * just this set for the nightly security workflow. Every entry maps to a unit
 * suite that must fail while the mutation is applied — the score gate in
 * `scripts/security/check-test-strength.ts` reads the resulting report.
 *
 * Areas: `src/databases/auth/`, `src/utils/security/`, `src/utils/egress-guard.ts`,
 * `src/services/sdk/namespaces/collections/write-pipeline.ts`.
 */
export const SECURITY_TARGETS: readonly Mutation[] = [
  {
    id: "auth-revocation-global",
    file: "src/databases/auth/revocation-epoch.ts",
    description: "isSessionRevoked: stop honouring the global revocation epoch",
    find: [
      "  if (globalRevocationEpoch > 0 && issuedAtMs < globalRevocationEpoch) {",
      "    return true;",
      "  }",
    ].join("\n"),
    replace: [
      "  if (globalRevocationEpoch > 0 && issuedAtMs < globalRevocationEpoch) {",
      "    return false;",
      "  }",
    ].join("\n"),
    tests: ["tests/unit/auth/revocation-epoch.test.ts"],
  },
  {
    id: "auth-revocation-tenant",
    file: "src/databases/auth/revocation-epoch.ts",
    description: "isSessionRevoked: stop honouring the per-tenant revocation epoch",
    find: [
      "    if (tenantEpoch !== undefined && issuedAtMs < tenantEpoch) {",
      "      return true;",
      "    }",
    ].join("\n"),
    replace: [
      "    if (tenantEpoch !== undefined && issuedAtMs < tenantEpoch) {",
      "      return false;",
      "    }",
    ].join("\n"),
    tests: ["tests/unit/auth/revocation-epoch.test.ts"],
  },
  {
    id: "auth-revocation-user",
    file: "src/databases/auth/revocation-epoch.ts",
    description: "isSessionRevoked: stop honouring the per-user revocation epoch",
    find: [
      "    if (userEpoch !== undefined && issuedAtMs < userEpoch) {",
      "      return true;",
      "    }",
    ].join("\n"),
    replace: [
      "    if (userEpoch !== undefined && issuedAtMs < userEpoch) {",
      "      return false;",
      "    }",
    ].join("\n"),
    tests: ["tests/unit/auth/revocation-epoch.test.ts"],
  },
  {
    id: "auth-totp-secret-format",
    file: "src/databases/auth/totp.ts",
    description: "isValidTOTPSecret: drop the length + Base32 format contract",
    find: '  return typeof secret === "string" && secret.length >= 16 && base32Regex.test(secret);',
    replace: '  return typeof secret === "string";',
    tests: ["tests/unit/auth/totp/totp-pure.test.ts"],
  },
  {
    id: "auth-dashboard-grant-never",
    file: "src/databases/auth/dashboard-access.ts",
    description: "rolesGrantDashboardAccess: a matching permission stops returning true",
    find: [
      "    for (const permission of permissions) {",
      "      if (isDashboardAccessPermission(permission)) return true;",
      "    }",
    ].join("\n"),
    replace: [
      "    for (const permission of permissions) {",
      "      if (isDashboardAccessPermission(permission)) return false;",
      "    }",
    ].join("\n"),
    tests: ["tests/unit/routes/dashboard-role-access.test.ts"],
  },
  {
    id: "security-redirect-protocol-relative",
    file: "src/utils/security/safe-redirect.ts",
    description: "safeRedirect: protocol-relative URLs pass as internal paths",
    find: '    !trimmed.startsWith("//") &&',
    replace: "    true &&",
    tests: ["tests/unit/security/safe-redirect.test.ts"],
  },
  {
    id: "security-input-sanitizer-prototype-keys",
    file: "src/utils/security/input-sanitizer.ts",
    description: "sanitizeObject: constructor keys survive the rebuild pass",
    find: '      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;',
    replace: '      if (key === "__proto__" || key === "prototype") continue;',
    tests: ["tests/unit/security/prototype-pollution.test.ts"],
  },
  {
    id: "security-input-sanitizer-script-strip",
    file: "src/utils/security/input-sanitizer.ts",
    description: "sanitizeString: return the input unchanged (script tags survive)",
    find: "  return sanitizeHtml(input);",
    replace: "  return input;",
    tests: ["tests/unit/security/input-sanitization.test.ts"],
  },
  {
    id: "egress-protocol-relative",
    file: "src/utils/egress-guard.ts",
    description: "validateEgressUrl: only `//` is rejected, the `/\\` form is not",
    find: '  if (typeof url === "string" && (url.trim().startsWith("//") || url.trim().startsWith("/\\\\"))) {',
    replace: '  if (typeof url === "string" && url.trim().startsWith("//")) {',
    tests: ["tests/unit/security/egress-guard.test.ts"],
  },
  {
    id: "egress-ipv6-ula",
    file: "src/utils/egress-guard.ts",
    description: "BLOCKED_IP_RANGES: fc00::/8 only — the fd00::/8 half of ULA is allowed",
    find: "  /^f[cd][0-9a-f]{2}:/i, // IPv6 unique local (fc00::/7 — covers fc00: … fdff:)",
    replace: "  /^fc[0-9a-f]{2}:/i, // IPv6 unique local (fc00::/7 — covers fc00: … fdff:)",
    tests: ["tests/unit/security/egress-guard.test.ts"],
  },
  {
    id: "write-pipeline-updatedby-stamp",
    file: "src/services/sdk/namespaces/collections/write-pipeline.ts",
    description: "prepareWritePayload: stamp updatedBy even when the schema omits the field",
    find: '    if (schemaDeclaresField(schema, "updatedBy")) {',
    replace: "    if (true) {",
    tests: ["tests/unit/sdk/write-pipeline-perf.test.ts"],
  },
  {
    id: "write-pipeline-createdby-system",
    file: "src/services/sdk/namespaces/collections/write-pipeline.ts",
    description: "prepareWritePayload: system writes lose the `createdBy: system` attribution",
    find: '    entryData.createdBy = system ? "system" : user?._id;',
    replace: "    entryData.createdBy = user?._id;",
    tests: ["tests/unit/sdk/write-pipeline-perf.test.ts"],
  },
  {
    id: "auth-permission-catalog-accept",
    file: "src/databases/auth/permissions.ts",
    description: "isAcceptablePermissionId: catalog-only ids are rejected again (registry alone)",
    find: "  return permissionRegistry.has(permissionId) || isCatalogPermissionId(permissionId);",
    replace: "  return permissionRegistry.has(permissionId);",
    tests: ["tests/unit/security/permission-registry-consistency.test.ts"],
  },
  {
    id: "auth-permission-bitmask-decision",
    file: "src/databases/auth/permissions.ts",
    description: "evaluatePermissionWithRoles: invert the 64-bit grant test (unheld bits grant)",
    find: "    return (userMask & reqBit) !== 0n;",
    replace: "    return (userMask & reqBit) === 0n;",
    tests: ["tests/unit/auth/roles/role-permission-access.test.ts"],
  },
  {
    id: "auth-totp-replay-detect",
    file: "src/databases/auth/totp-replay-registry.ts",
    description: "tryInsert: an already-consumed code is accepted again (replay allowed)",
    find: "      return false; // replay detected",
    replace: "      return true; // replay detected",
    tests: ["tests/unit/auth/totp/totp-replay-registry.test.ts"],
  },
  {
    id: "auth-totp-replay-fail-closed",
    file: "src/databases/auth/totp-replay-registry.ts",
    description: "consumeCode: a registry error fails open instead of rejecting the code",
    find: [
      '      logger.error("TOTP replay registry error — rejecting code (fail-closed)", err);',
      "      return false;",
    ].join("\n"),
    replace: [
      '      logger.error("TOTP replay registry error — rejecting code (fail-closed)", err);',
      "      return true;",
    ].join("\n"),
    tests: ["tests/unit/auth/totp/totp-replay-registry.test.ts"],
  },
  {
    id: "auth-api-permission-fail-open",
    file: "src/databases/auth/api-permissions.ts",
    description: "hasApiPermission: an endpoint absent from the map/trie is allowed",
    find: [
      "  if (!allowedRoles) {",
      "    // If endpoint is not defined, deny access by default (secure by default)",
      "    return false;",
      "  }",
    ].join("\n"),
    replace: [
      "  if (!allowedRoles) {",
      "    // If endpoint is not defined, deny access by default (secure by default)",
      "    return true;",
      "  }",
    ].join("\n"),
    tests: ["tests/unit/auth/api-permissions.test.ts"],
  },
  {
    id: "security-session-cookie-host-precedence",
    file: "src/utils/security/session-cookie.ts",
    description: "readSessionCookie: secure connections read the plain cookie before __Host-",
    find: [
      "  if (isSecure === true) {",
      "    result =",
      "      cookies.get(HOST_SESSION_COOKIE_NAME) ||",
      "      cookies.get(SESSION_COOKIE_NAME) ||",
      "      cookies.get(SECURE_SESSION_COOKIE_NAME);",
    ].join("\n"),
    replace: [
      "  if (isSecure === true) {",
      "    result =",
      "      cookies.get(SESSION_COOKIE_NAME) ||",
      "      cookies.get(SESSION_COOKIE_NAME) ||",
      "      cookies.get(SECURE_SESSION_COOKIE_NAME);",
    ].join("\n"),
    tests: ["tests/unit/security/session-cookie.test.ts"],
  },
  {
    id: "security-user-attr-admin-inversion",
    file: "src/utils/security/user-attribute-policy.ts",
    description: "sanitizeClientUserAttributePatch: non-admin patches keep privileged fields",
    find: ["  if (!options.isAdmin) {", "    stripPrivilegedUserFields(updates);", "  }"].join(
      "\n",
    ),
    replace: ["  if (options.isAdmin) {", "    stripPrivilegedUserFields(updates);", "  }"].join(
      "\n",
    ),
    tests: ["tests/unit/security/user-attribute-policy.test.ts"],
  },
  {
    id: "security-user-attr-permissions-field",
    file: "src/utils/security/user-attribute-policy.ts",
    description: "PRIVILEGE_ESCALATION_FIELDS: `permissions` is no longer stripped at the adapter",
    find: ['  "roleIds",', '  "permissions",', "] as const;"].join("\n"),
    replace: ['  "roleIds",', "] as const;"].join("\n"),
    tests: ["tests/unit/security/user-attribute-policy.test.ts"],
  },
  {
    id: "security-redirect-backslash",
    file: "src/utils/security/safe-redirect.ts",
    description: "safeRedirect: `/\\evil.com` is accepted as an internal path",
    find: '    !trimmed.startsWith("/\\\\") &&',
    replace: "    true &&",
    tests: ["tests/unit/security/safe-redirect.test.ts"],
  },
  {
    id: "security-mongo-where-operator",
    file: "src/utils/security/mongo-sanitize.ts",
    description: "BLOCKED_OPERATORS: `$where` script execution is no longer rejected",
    find: ['  "$where",', '  "$function",'].join("\n"),
    replace: '  "$function",',
    tests: ["tests/unit/utils/security-hot-path-optimizations.test.ts"],
  },
  {
    id: "security-mongo-regex-cap",
    file: "src/utils/security/mongo-sanitize.ts",
    description: "sanitizeMongoQuery: the $regex length cap (ReDoS guard) never trips",
    find: '      if (typeof val === "string" && val.length > MAX_REGEX_LENGTH) {',
    replace: '      if (typeof val === "string" && val.length > Number.MAX_SAFE_INTEGER) {',
    tests: ["tests/unit/utils/security-hot-path-optimizations.test.ts"],
  },
  {
    id: "security-input-sanitizer-zero-copy-constructor",
    file: "src/utils/security/input-sanitizer.ts",
    description: "objectNeedsSanitize: a `constructor` own key no longer forces the rebuild pass",
    find: '    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;',
    replace: '    if (key === "__proto__" || key === "prototype") return true;',
    tests: ["tests/unit/security/prototype-pollution.test.ts"],
  },
];

/** Originals captured before the first write, keyed by project-relative path. */
const originals = new Map<string, string>();
/** Content this runner wrote, keyed by project-relative path (concurrent-writer guard). */
const applied = new Map<string, string>();
/** Files currently believed to hold mutated content. */
const touched = new Set<string>();
/** Files that were clean before the first write (safe to restore from HEAD). */
const cleanAtStart = new Set<string>();

function git(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function isClean(relativePath: string): boolean {
  return git(["status", "--porcelain", "--", relativePath]).stdout === "";
}

function readTarget(relativePath: string): string {
  const content = readFileSync(join(ROOT, relativePath), "utf8");
  if (!originals.has(relativePath)) originals.set(relativePath, content);
  return content;
}

/**
 * Writes through a same-directory temp file and renames it over the target, so
 * an interrupted process can never leave a half-written source file behind.
 * A plain `writeFileSync` truncates first; if the gate is killed between the
 * truncate and the write, the tree keeps a syntactically broken fragment and
 * every later step (probe, integration, E2E) fails for the wrong reason.
 */
function writeTarget(relativePath: string, content: string): void {
  const target = join(ROOT, relativePath);
  const temporary = `${target}.mutation-${process.pid}.tmp`;
  writeFileSync(temporary, content);
  try {
    renameSync(temporary, target);
  } catch (err) {
    if (process.platform === "win32") {
      // Windows NTFS anti-virus/indexer file lock: retry with backoff, then copy fallback
      let success = false;
      for (let i = 0; i < 5; i++) {
        try {
          copyFileSync(temporary, target);
          unlinkSync(temporary);
          success = true;
          break;
        } catch {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
      }
      if (!success) {
        throw err;
      }
    } else {
      throw err;
    }
  }
}

/**
 * True when the file still holds the exact bytes this runner wrote. A different
 * value means a concurrent writer (another agent) touched it inside the mutation
 * window — restoring would destroy their work, so the caller aborts instead.
 */
function isUntouchedSinceWrite(relativePath: string): boolean {
  const expected = applied.get(relativePath);
  if (expected === undefined) return true;
  try {
    return readFileSync(join(ROOT, relativePath), "utf8") === expected;
  } catch {
    return false;
  }
}

/** Writes every captured original back; returns the paths that still differ. */
function restoreAll(): string[] {
  const dirty: string[] = [];
  // Deleting the current entry during Set iteration is well-defined.
  for (const relativePath of touched) {
    if (!restoreTarget(relativePath)) dirty.push(relativePath);
  }
  return dirty;
}

function restoreTarget(relativePath: string): boolean {
  const content = originals.get(relativePath);
  if (content === undefined) return true;

  if (isUntouchedSinceWrite(relativePath)) {
    writeTarget(relativePath, content);
    applied.delete(relativePath);
    touched.delete(relativePath);
    if (isClean(relativePath)) return true;
  }

  // The in-memory restore failed (partial write, interrupted process, line-ending
  // normalisation, or a concurrent writer). The target was clean before this run,
  // so HEAD is the only legitimate baseline: leaving a mutated source file behind
  // makes every later gate fail for the wrong reason. Restore it and say so.
  if (cleanAtStart.has(relativePath)) {
    console.error(`\n⚠️  ${relativePath} did not match its pre-run bytes — restoring from HEAD.`);
    const checkedOut = git(["checkout", "--", relativePath]);
    if (checkedOut.status === 0) {
      applied.delete(relativePath);
      touched.delete(relativePath);
      return isClean(relativePath);
    }
  }

  return false;
}

function runTests(tests: readonly string[]): { status: number; output: string } {
  const result = spawnSync(HOST, ["x", "vitest", "run", ...tests], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, TEST_MODE: "true" },
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function tailLines(text: string, count: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines.slice(-count).join("\n");
}

function applyMutation(mutation: Mutation): string | null {
  const content = readTarget(mutation.file);
  const occurrences = content.split(mutation.find).length - 1;
  if (occurrences !== 1) {
    return `replacement target occurs ${occurrences}× in ${mutation.file} (expected exactly 1) — mutation config is stale`;
  }
  const mutated = content.replace(mutation.find, mutation.replace);
  // Mark before writing: if the process is interrupted mid-write, the restore
  // pass must still see this file and fall back to HEAD.
  touched.add(mutation.file);
  applied.set(mutation.file, mutated);
  writeTarget(mutation.file, mutated);
  return null;
}

function runMutation(mutation: Mutation): Outcome {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  if (!isClean(mutation.file)) {
    return {
      mutation,
      status: "aborted",
      durationMs: elapsed(),
      detail: `${mutation.file} has uncommitted changes — refusing to rewrite it`,
    };
  }
  cleanAtStart.add(mutation.file);

  let status: Status = "killed";
  let detail = "";

  try {
    const problem = applyMutation(mutation);
    if (problem) {
      return { mutation, status: "invalid", durationMs: elapsed(), detail: problem };
    }

    const run = runTests(mutation.tests);
    if (run.status === 0) {
      status = "survived";
      detail = `tests passed with the mutation applied\n${tailLines(run.output, 12)}`;
    } else {
      detail = `tests failed as required (vitest exit ${run.status})`;
    }
  } finally {
    const restored = restoreTarget(mutation.file);
    if (!restored) {
      status = "aborted";
      detail = `${mutation.file} was changed by another writer during the mutation window or could not be restored — leaving it untouched; inspect \`git diff\` immediately`;
    }
  }

  return { mutation, status, durationMs: elapsed(), detail };
}

export interface CliOptions {
  dryRun: boolean;
  max: number | null;
  help: boolean;
  securityOnly: boolean;
  /** Explicit mutation-id allow-list; null selects the whole pool. */
  only: readonly string[] | null;
  /** Project-relative (or absolute) report path; null disables the report. */
  report: string | null;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  let dryRun = false;
  let max: number | null = null;
  let help = false;
  let securityOnly = false;
  let only: string[] | null = null;
  let report: string | null = DEFAULT_REPORT_PATH;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--security-only") {
      securityOnly = true;
      continue;
    }
    if (arg === "--no-report") {
      report = null;
      continue;
    }
    if (arg.startsWith("--report=")) {
      const raw = arg.slice("--report=".length);
      if (!raw) throw new Error("--report=<path> needs a non-empty path");
      report = raw;
      continue;
    }
    if (arg.startsWith("--only=")) {
      const ids = arg
        .slice("--only=".length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) throw new Error("--only=<ids> needs at least one mutation id");
      only = ids;
      continue;
    }
    if (arg.startsWith("--max=")) {
      const raw = arg.slice("--max=".length);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`--max=<n> needs a positive integer, got "${raw}"`);
      }
      max = parsed;
      continue;
    }
    throw new Error(`unknown argument "${arg}"`);
  }

  return { dryRun, max, help, securityOnly, only, report };
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/test/mutate-core.ts [--dry-run] [--max=<n>] [--security-only]
                                            [--only=<id[,id]>]
                                            [--report=<path>|--no-report]

  --dry-run        list the mutation set and exit (nothing is written)
  --max=<n>        run at most the first n mutations
  --security-only  mutate only the auth/security/egress/write-pipeline targets
  --only=<ids>     run only the named mutation ids (comma-separated; pool order)
  --report=<path>  JSON report path (default ${DEFAULT_REPORT_PATH})
  --no-report      do not write a JSON report

The default set is the write-path corpus plus the security corpus, so the
security:assurance mutation floors get data for every configured area.
`);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

function printSummary(outcomes: readonly Outcome[]): void {
  const idWidth = Math.max(...outcomes.map((o) => o.mutation.id.length), 3);
  const fileWidth = Math.max(...outcomes.map((o) => o.mutation.file.length), 4);
  const statusWidth = Math.max(...outcomes.map((o) => o.status.length), 6);

  console.log("\n== Mutation summary ==");
  console.log(
    `${pad("id", idWidth)}  ${pad("status", statusWidth)}  ${pad("file", fileWidth)}  ms`,
  );
  console.log(`${"-".repeat(idWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(fileWidth)}  --`);
  for (const outcome of outcomes) {
    console.log(
      `${pad(outcome.mutation.id, idWidth)}  ${pad(outcome.status, statusWidth)}  ` +
        `${pad(outcome.mutation.file, fileWidth)}  ${outcome.durationMs}`,
    );
  }

  const count = (status: Status) => outcomes.filter((o) => o.status === status).length;
  console.log(
    `\n${count("killed")} killed · ${count("survived")} survived · ` +
      `${count("invalid")} invalid · ${count("aborted")} aborted`,
  );

  for (const outcome of outcomes) {
    if (outcome.status === "killed") continue;
    console.log(`\n[${outcome.status}] ${outcome.mutation.id} — ${outcome.mutation.description}`);
    console.log(outcome.detail);
  }
}

function emitReport(outcomes: readonly Outcome[], options: CliOptions): void {
  if (!options.report) return;
  try {
    const written = writeReport(
      options.report,
      buildReport(outcomes, options.securityOnly ? "security" : "all"),
    );
    console.log(`\n📄 Mutation report: ${written}`);
  } catch (error) {
    // A read-only checkout must not turn a mutation result into a crash; the
    // checker reports the missing file itself (exit 2, or a notice with
    // `--allow-missing`).
    console.error(
      `⚠️  could not write the mutation report: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function main(): number {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n🛑 ${error instanceof Error ? error.message : String(error)}\n`);
    printUsage();
    return EXIT_USAGE;
  }

  if (options.help) {
    printUsage();
    return 0;
  }

  const pool: Mutation[] = options.securityOnly
    ? [...SECURITY_TARGETS]
    : [...MUTATIONS, ...SECURITY_TARGETS];
  let filtered = pool;
  if (options.only) {
    const byId = new Map(pool.map((mutation) => [mutation.id, mutation]));
    const unknown = options.only.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      console.error(`\n🛑 unknown mutation id(s): ${unknown.join(", ")}\n`);
      printUsage();
      return EXIT_USAGE;
    }
    filtered = options.only.map((id) => byId.get(id) as Mutation);
  }
  const selected = options.max ? filtered.slice(0, options.max) : filtered;

  if (options.dryRun) {
    console.log(`Dry run — ${selected.length} mutation(s), nothing will be written.\n`);
    const fileWidth = Math.max(...selected.map((m) => m.file.length), 4);
    for (const mutation of selected) {
      console.log(`${mutation.id}\n  ${pad(mutation.file, fileWidth)}  ${mutation.description}`);
      console.log(`  tests: ${mutation.tests.join(", ")}`);
    }
    const files = [...new Set(selected.map((m) => m.file))];
    console.log(`\nTargets (${files.length}): ${files.join(", ")}`);
    return 0;
  }

  // A stale report from an earlier run must never be scored as this run's
  // result: the checker would read a green file even though this run aborted
  // before mutating anything.
  if (options.report) {
    try {
      unlinkSync(isAbsolute(options.report) ? options.report : join(ROOT, options.report));
    } catch {
      // No previous report (the normal case) — nothing to clear.
    }
  }

  for (const file of new Set(selected.map((m) => m.file))) {
    if (!isClean(file)) {
      console.error(`\n🛑 ${file} has uncommitted changes — refusing to mutate a dirty target.`);
      return EXIT_ABORTED;
    }
  }

  const outcomes: Outcome[] = [];
  try {
    for (const mutation of selected) {
      process.stdout.write(`▶ ${mutation.id} (${mutation.file}) … `);
      const outcome = runMutation(mutation);
      outcomes.push(outcome);
      console.log(`${outcome.status} [${outcome.durationMs}ms]`);
      if (outcome.status === "aborted") {
        console.error(`\n🛑 ${outcome.detail}`);
        printSummary(outcomes);
        emitReport(outcomes, options);
        return EXIT_ABORTED;
      }
    }
  } finally {
    const dirty = restoreAll();
    if (dirty.length > 0) {
      console.error(`\n🛑 final restore left changes in: ${dirty.join(", ")}`);
    }
  }

  printSummary(outcomes);
  emitReport(outcomes, options);

  const dirty = [...originals.keys()].filter((file) => !isClean(file));
  if (dirty.length > 0) {
    console.error(`\n🛑 tree is still dirty after the restore pass: ${dirty.join(", ")}`);
    return EXIT_ABORTED;
  }

  const survivors = outcomes.filter((o) => o.status !== "killed");
  if (survivors.length > 0) {
    console.error(
      `\n🛑 ${survivors.length} mutation(s) were not caught — the ${
        options.securityOnly ? "security" : "write-path + security"
      } surface is not fully pinned.`,
    );
    return EXIT_SURVIVED;
  }

  console.log(
    `\n✅ All ${outcomes.length} mutations killed. Restored: ${[...originals.keys()].join(", ")}`,
  );
  return 0;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    const dirty = restoreAll();
    if (dirty.length > 0) console.error(`🛑 restore failed for: ${dirty.join(", ")}`);
    process.exit(130);
  });
}

// Normal exits and `process.exit()` paths (including a thrown error escaping
// main) still owe the tree a restore; the signal handlers above do not cover
// them. `restoreAll` is idempotent — already-restored paths are no-ops.
process.on("exit", () => {
  const dirty = restoreAll();
  if (dirty.length > 0) console.error(`🛑 restore on exit failed for: ${dirty.join(", ")}`);
});

process.exit(main());
