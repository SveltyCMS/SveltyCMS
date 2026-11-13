#!/usr/bin/env bun
/**
 * @file scripts/security/risk-audit.ts
 * @description
 * Full risk audit for commits — runs every fast, stateless security check in
 * one gate. Covers the layers no single tool can:
 *
 *   1. scan-security-risk — OUR code: SQL/NoSQL injection classes across all
 *                        4 adapters (SQLite, MariaDB, PostgreSQL, MongoDB),
 *                        command injection, dynamic code execution, path
 *                        traversal, SSRF (incl. unguarded remote URL fetch),
 *                        privilege-field writes, SVG stream bypass, XSS sinks +
 *                        SvelteKit CSRF/cookie
 *                        config — over the ENTIRE src tree
 *   2. scan-secret-misuse — hardcoded credentials / comparison backdoors
 *   3. slop-scanner      — XSS, RTL, security architecture rules
 *   4. lint-tenant-api   — AST tenant-isolation hygiene & bypass allowlist
 *   5. bun audit         — GitHub Advisory DB for the npm dependency tree
 *   6. scan-osv          — OSV.dev global database (GHSA + NVD + 20+ feeds)
 *
 * ### Features:
 * - Parallel execution across all independent scanners with deterministic output ordering
 * - Advisories are identified from `bun audit --json` (`url`/`id` fields), so an
 *   advisory that merely *mentions* a suppressed GHSA in its title/prose can never
 *   mask a real finding; the human reporter stays as a line-scoped fallback
 * - Supports `--full` to force full-repo scanning on incremental gates (`scan-secret-misuse`, `lint-tenant-api`)
 *
 * ### Usage
 *   bun run risk:audit         # full risk audit (exit 1 on findings)
 *   bun run risk:audit --full  # force full non-incremental scans on all gates
 */

const fullFlag = process.argv.includes("--full") || process.argv.includes("--all");

const STEPS: { name: string; args: string[] }[] = [
  {
    name: "🛡️  Global security risk scan (all src)",
    args: ["run", "scripts/security/scan-security-risk.ts", "--strict"],
  },
  {
    name: "🔑  Secret misuse scan",
    args: [
      "run",
      "scripts/security/scan-secret-misuse.ts",
      "--strict",
      ...(fullFlag ? ["--full"] : []),
    ],
  },
  {
    name: "🧹  Slop scanner (XSS/RTL/security)",
    args: ["run", "scripts/security/slop-scanner.ts", "--strict"],
  },
  {
    name: "🏢  Tenant isolation API hygiene",
    args: ["run", "scripts/lint/lint-tenant-api.ts", ...(fullFlag ? ["--full"] : [])],
  },
  {
    name: "📦  Dependency audit (GitHub Advisory DB)",
    args: ["audit", "--no-color", "--json"],
  },
  {
    name: "🌐  Global vulnerability check (OSV.dev)",
    args: ["run", "scripts/security/scan-osv.ts"],
  },
];

interface StepResult {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

/** Known devtool/build-time advisories with no upstream patch available yet on npm. */
const SUPPRESSED_AUDIT_ADVISORIES: readonly string[] = [
  "GHSA-gcqx-w48m-w2h4", // deepmerge <= 4.3.1 (transitive from @sveltejs/vite-plugin-svelte, build-time only, patch pending)
];

const GHSA_PATTERN = /GHSA-[a-z0-9-]+/i;

/** One advisory as reported by `bun audit --json`. */
interface AuditAdvisory {
  packageName: string;
  ids: string[];
  title?: string;
  severity?: string;
  url?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Advisory identifiers from a structured record. Only the `url` and an
 * id-shaped `id` field are trusted — `title`, `cwe` and any prose stay ignored,
 * which is precisely the bug a whole-output `.match()` produced.
 */
function advisoryIdsFromRecord(record: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const id = record.id;
  if (typeof id === "string" && GHSA_PATTERN.test(id)) ids.push(id);
  const url = record.url;
  if (typeof url === "string") {
    const match = url.match(GHSA_PATTERN);
    if (match) ids.push(match[0]);
  }
  return ids;
}

/**
 * Parses `bun audit --json` output. Returns `null` for anything that is not the
 * structured reporter (human text, empty output, truncated JSON), so callers can
 * fall back instead of failing on a format change.
 */
export function parseAuditJson(stdout: string): AuditAdvisory[] | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // catch-allow: not the JSON reporter (partial/plain output) — caller falls back to the line-scoped scan
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const advisories: AuditAdvisory[] = [];
  for (const [packageName, entries] of Object.entries(parsed)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isPlainObject(entry)) continue;
      advisories.push({
        packageName,
        ids: advisoryIdsFromRecord(entry),
        title: typeof entry.title === "string" ? entry.title : undefined,
        severity: typeof entry.severity === "string" ? entry.severity : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
      });
    }
  }
  return advisories;
}

/**
 * Advisory ids on one human-reporter line. Accepted shapes: a line that starts
 * with the id, an `Advisory:` line, or an advisory URL token (bun's own human
 * output carries the id only inside the URL). Prose is never scanned for ids.
 */
function advisoryIdsOnLine(line: string): string[] {
  const header = line.match(/^\s*(GHSA-[a-z0-9-]+)/i);
  if (header) return [header[1]];

  const ids: string[] = [];
  if (/Advisory:/i.test(line)) {
    ids.push(...(line.match(/GHSA-[a-z0-9-]+/gi) ?? []));
  }
  for (const url of line.match(/https?:\/\/\S+/g) ?? []) {
    const match = url.match(GHSA_PATTERN);
    if (match) ids.push(match[0]);
  }
  return ids;
}

/** Case-insensitive de-dupe that preserves the first spelling, sorted for determinism. */
function dedupeIds(ids: string[]): string[] {
  const byLower = new Map<string, string>();
  for (const id of ids) {
    if (!byLower.has(id.toLowerCase())) byLower.set(id.toLowerCase(), id);
  }
  return [...byLower.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Advisory ids a failed dependency audit actually reported. Structured JSON is
 * preferred; the human reporter is read line-scoped.
 */
export function extractAdvisoryIds(stdout: string): string[] {
  const structured = parseAuditJson(stdout);
  const ids = structured
    ? structured.flatMap((advisory) => advisory.ids)
    : stdout.split(/\r?\n/).flatMap(advisoryIdsOnLine);
  return dedupeIds(ids);
}

/** Ids that are not in the suppression list — compares the id, never prose. */
export function unsuppressedAdvisories(
  ids: readonly string[],
  suppressed: readonly string[] = SUPPRESSED_AUDIT_ADVISORIES,
): string[] {
  const allowed = new Set(suppressed.map((id) => id.toLowerCase()));
  return ids.filter((id) => !allowed.has(id.toLowerCase()));
}

/** What a failed dependency audit is allowed to mean. */
export type AuditStepVerdict =
  | { kind: "pass" }
  | { kind: "allowed-suppressed"; ids: string[] }
  | { kind: "fail"; ids: string[] }
  | { kind: "fail-unidentified" };

/**
 * Classify one dependency-audit step without printing anything.
 *
 * A failure whose only ids are suppressed dev/build advisories is allowed; a
 * failure with no identifiable advisory is NEVER allowed (a format change must
 * not silently turn a real advisory into a pass).
 */
export function classifyAuditStep(
  exitCode: number,
  stdout: string,
  suppressed: readonly string[] = SUPPRESSED_AUDIT_ADVISORIES,
): AuditStepVerdict {
  if (exitCode === 0) return { kind: "pass" };
  const advisoryIds = extractAdvisoryIds(stdout);
  const unsuppressed = unsuppressedAdvisories(advisoryIds, suppressed);
  if (advisoryIds.length > 0 && unsuppressed.length === 0) {
    return { kind: "allowed-suppressed", ids: advisoryIds };
  }
  if (unsuppressed.length > 0) return { kind: "fail", ids: unsuppressed };
  return { kind: "fail-unidentified" };
}

/** Human-readable rendering of the structured reporter (replaces its raw JSON). */
function formatAuditReport(advisories: AuditAdvisory[]): string {
  if (advisories.length === 0) return "✅ No dependency advisories reported.\n";
  const lines = advisories.map((advisory) => {
    const ids = advisory.ids.length > 0 ? ` [${advisory.ids.join(", ")}]` : "";
    const severity = advisory.severity ?? "unknown";
    const title = advisory.title ?? "advisory";
    const url = advisory.url ? ` — ${advisory.url}` : "";
    return `  ❌ ${advisory.packageName}${ids} (${severity}): ${title}${url}`;
  });
  return `${lines.join("\n")}\n`;
}

async function runStep(step: { name: string; args: string[] }): Promise<StepResult> {
  const start = performance.now();
  const proc = Bun.spawn(["bun", ...step.args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    name: step.name,
    exitCode,
    stdout,
    stderr,
    elapsedMs: Math.round(performance.now() - start),
  };
}

async function main(): Promise<number> {
  const totalStart = performance.now();
  const results = await Promise.all(STEPS.map(runStep));
  const totalElapsedMs = Math.round(performance.now() - totalStart);

  let ok = 0;
  for (const res of results) {
    const isAuditStep = res.name.includes("Dependency audit");
    process.stdout.write(`\n━━━ ${res.name} (${res.elapsedMs}ms) ━━━\n\n`);
    if (isAuditStep) {
      const advisories = parseAuditJson(res.stdout);
      if (advisories) process.stdout.write(formatAuditReport(advisories));
      else if (res.stdout) process.stdout.write(res.stdout);
    } else if (res.stdout) {
      process.stdout.write(res.stdout);
    }
    if (res.stderr) process.stderr.write(res.stderr);

    if (res.exitCode === 0) {
      ok += 1;
    } else if (isAuditStep) {
      const verdict = classifyAuditStep(res.exitCode, res.stdout);
      if (verdict.kind === "allowed-suppressed") {
        console.log(
          `\n⚠️  ${res.name} has only known suppressed dev/build advisories (${verdict.ids.join(", ")}) — allowing.`,
        );
        ok += 1;
      } else if (verdict.kind === "fail") {
        console.error(`\n❌ ${res.name} failed (exit ${res.exitCode})`);
        console.error(`   Unsuppressed advisories: ${verdict.ids.join(", ")}`);
      } else if (verdict.kind === "fail-unidentified") {
        console.error(
          `\n❌ ${res.name} failed (exit ${res.exitCode}) with no identifiable advisory — treating as a real failure.`,
        );
      }
    } else {
      console.error(`\n❌ ${res.name} failed (exit ${res.exitCode})`);
    }
  }

  console.log(`\nRisk audit: ${ok}/${STEPS.length} checks passed in ${totalElapsedMs}ms`);
  return ok === STEPS.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
