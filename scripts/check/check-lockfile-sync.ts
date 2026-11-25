/**
 * @file scripts/check/check-lockfile-sync.ts
 * @description
 * Verifies that every dependency range declared in package.json is satisfied
 * by the resolved version recorded in bun.lock.
 *
 * Why this exists:
 * - `bun install --frozen-lockfile` (CI Bootstrap) hard-fails when the
 *   manifest and lockfile disagree, which skipped every downstream CI job.
 * - Pre-commit gates (format/lint/unit) cannot see this because they never
 *   re-resolve dependencies — so a package.json bump without a lockfile
 *   regeneration used to pass locally and break CI.
 *
 * This is a pure static check (~ms, no network, no node_modules writes):
 * - every direct dependency must exist in bun.lock
 * - its resolved version must satisfy the declared semver range
 *
 * Features:
 * - Tolerant bun.lock parser (BOM + trailing commas)
 * - Exact pins and non-registry sources (`file:`, `git`, `link:`, `workspace:`)
 *   are accepted without a semver comparison
 * - Offender list shared by the CLI and the unit suite (`findLockfileOffenders`)
 *
 * Usage: bun run scripts/check-lockfile-sync.ts
 * Exit: 0 when in sync, 1 with a list of offenders otherwise.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const FAIL_PREFIX = "❌ lockfile-sync";

export interface LockEntry {
  /** First element of a bun.lock package entry: "name@resolvedVersion". */
  resolved: string;
}

/** One `[name, range]` pair from package.json. */
export type DeclaredDependency = readonly [name: string, range: string];

/**
 * Parses the bun.lock JSON body.
 *
 * bun.lock is JSONC-ish: it may carry a BOM and trailing commas, neither of
 * which `JSON.parse` accepts. Entries that are not `[resolved, …]` tuples are
 * ignored rather than treated as missing.
 */
export interface WorkspaceManifestDeps {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface ParsedBunLock {
  packages: Record<string, LockEntry>;
  workspaces: Record<string, WorkspaceManifestDeps>;
  overrides: Record<string, string>;
}

/**
 * Parses JSONC (`bun.lock` allows trailing commas) into structured lockfile sections.
 */
export function parseBunLockData(raw: string): ParsedBunLock {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/,\s*([\]}])/g, "$1");
  const data = JSON.parse(normalized) as {
    packages?: Record<string, unknown>;
    workspaces?: Record<string, WorkspaceManifestDeps>;
    overrides?: Record<string, string>;
  };
  const packages: Record<string, LockEntry> = {};
  for (const [name, info] of Object.entries(data.packages ?? {})) {
    if (Array.isArray(info) && typeof info[0] === "string") {
      packages[name] = { resolved: info[0] };
    }
  }
  return {
    packages,
    workspaces: data.workspaces ?? {},
    overrides: data.overrides ?? {},
  };
}

export function parseBunLockContent(raw: string): Record<string, LockEntry> {
  return parseBunLockData(raw).packages;
}

/**
 * Scans raw JSON/JSONC source for duplicate object keys within any single `{ ... }` scope.
 * Standard `JSON.parse()` silently overwrites earlier keys (e.g. a duplicate `"workspaces"`
 * block), which causes local tooling and `bun install --frozen-lockfile` to disagree.
 */
export function findDuplicateJsonKeys(raw: string): string[] {
  const text = raw.replace(/^\uFEFF/, "");
  const duplicates: string[] = [];
  type Frame = { kind: "obj"; keys: Set<string>; expectKey: boolean } | { kind: "arr" };
  const stack: Frame[] = [];

  let i = 0;
  let line = 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"') {
      const keyLine = line;
      const start = i;
      i++;
      while (i < text.length) {
        const inner = text[i]!;
        if (inner === "\\") {
          i += 2;
          continue;
        }
        if (inner === '"') {
          i++;
          break;
        }
        if (inner === "\n") line++;
        i++;
      }
      let look = i;
      while (look < text.length && " \t\r\n".includes(text[look]!)) look++;
      const top = stack[stack.length - 1];
      if (top?.kind === "obj" && top.expectKey && text[look] === ":") {
        try {
          const keyName = JSON.parse(text.slice(start, i)) as string;
          if (top.keys.has(keyName)) {
            duplicates.push(`duplicate JSON key "${keyName}" at line ${keyLine}`);
          } else {
            top.keys.add(keyName);
          }
        } catch {
          // Malformed JSON string literal will fail JSON.parse() right afterward.
        }
        top.expectKey = false;
      } else if (top?.kind === "obj") {
        top.expectKey = false;
      }
      continue;
    }

    const top = stack[stack.length - 1];
    if (ch === "{") {
      if (top?.kind === "obj") top.expectKey = false;
      stack.push({ kind: "obj", keys: new Set(), expectKey: true });
    } else if (ch === "[") {
      if (top?.kind === "obj") top.expectKey = false;
      stack.push({ kind: "arr" });
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent?.kind === "obj") parent.expectKey = false;
    } else if (ch === ",") {
      if (top?.kind === "obj") top.expectKey = true;
    } else if (ch !== ":" && top?.kind === "obj") {
      top.expectKey = false;
    }
    i++;
  }
  return duplicates;
}

function defaultSemverSatisfies(version: string, range: string): boolean {
  const bunRuntime = (
    globalThis as { Bun?: { semver?: { satisfies: (v: string, r: string) => boolean } } }
  ).Bun;
  if (bunRuntime?.semver?.satisfies) {
    return bunRuntime.semver.satisfies(version, range);
  }
  return true;
}

function collectRecursivePackageDirs(baseDir: string, rootDir: string, out: Set<string>): void {
  if (!existsSync(baseDir)) return;
  if (existsSync(join(baseDir, "package.json"))) {
    out.add(relative(rootDir, baseDir).replaceAll("\\", "/"));
  }
  for (const entry of readdirSync(baseDir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(baseDir, entry);
    if (statSync(full).isDirectory()) {
      collectRecursivePackageDirs(full, rootDir, out);
    }
  }
}

/** Expands npm/Bun `workspaces` globs into normalized relative directory paths. */
export function resolveWorkspaceDirs(rootDir: string, workspacesField: unknown): string[] {
  const rawPatterns = Array.isArray(workspacesField)
    ? workspacesField
    : workspacesField &&
        typeof workspacesField === "object" &&
        Array.isArray((workspacesField as { packages?: unknown }).packages)
      ? (workspacesField as { packages: unknown[] }).packages
      : [];

  const matched = new Set<string>();
  const excluded = new Set<string>();

  for (const item of rawPatterns) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().replaceAll("\\", "/");
    if (!trimmed) continue;

    const isNegated = trimmed.startsWith("!");
    const pattern = (isNegated ? trimmed.slice(1) : trimmed).replace(/\/+$/, "");
    const targetSet = isNegated ? excluded : matched;

    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      collectRecursivePackageDirs(prefix ? join(rootDir, prefix) : rootDir, rootDir, targetSet);
    } else if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      const parent = prefix ? join(rootDir, prefix) : rootDir;
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent)) {
        if (entry === "node_modules" || entry === ".git") continue;
        const full = join(parent, entry);
        if (statSync(full).isDirectory() && existsSync(join(full, "package.json"))) {
          targetSet.add(relative(rootDir, full).replaceAll("\\", "/"));
        }
      }
    } else {
      const full = join(rootDir, pattern);
      if (
        existsSync(full) &&
        statSync(full).isDirectory() &&
        existsSync(join(full, "package.json"))
      ) {
        targetSet.add(relative(rootDir, full).replaceAll("\\", "/"));
      }
    }
  }

  for (const dir of excluded) matched.delete(dir);
  return [...matched].sort();
}

export interface WorkspaceManifestInput {
  dir: string;
  raw: string;
  manifest: WorkspaceManifestDeps;
}

/**
 * Verifies workspace declarations, workspace dependency specs, and root `overrides`
 * against the parsed `bun.lock` data.
 */
export function findWorkspaceLockfileOffenders(
  workspaces: WorkspaceManifestInput[],
  lockData: ParsedBunLock,
  satisfiesFn: (version: string, range: string) => boolean = defaultSemverSatisfies,
): string[] {
  const offenders: string[] = [];
  const declaredDirs = new Set(workspaces.map((w) => w.dir));
  const workspaceNames = new Set(
    workspaces.map((w) => w.manifest.name).filter((n): n is string => typeof n === "string"),
  );

  for (const wsDir of Object.keys(lockData.workspaces)) {
    if (wsDir !== "" && !declaredDirs.has(wsDir)) {
      offenders.push(`stale workspace "${wsDir}" in bun.lock is missing from package.json`);
    }
  }

  const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;

  for (const ws of workspaces) {
    for (const dup of findDuplicateJsonKeys(ws.raw)) {
      offenders.push(`${ws.dir}/package.json: ${dup}`);
    }

    const lockedWs = lockData.workspaces[ws.dir];
    if (!lockedWs) {
      offenders.push(`workspace "${ws.dir}" is missing from bun.lock "workspaces"`);
      continue;
    }

    if (ws.manifest.name) {
      if (lockedWs.name !== ws.manifest.name) {
        offenders.push(
          `workspace "${ws.dir}" name "${ws.manifest.name}" mismatches bun.lock "${lockedWs.name ?? "<missing>"}"`,
        );
      }
      const pkgEntry = lockData.packages[ws.manifest.name];
      const expectedPrefix = `${ws.manifest.name}@workspace:${ws.dir}`;
      if (!pkgEntry || !pkgEntry.resolved.startsWith(expectedPrefix)) {
        offenders.push(
          `workspace "${ws.manifest.name}" is missing "${expectedPrefix}" in bun.lock "packages"`,
        );
      }
    }

    if (ws.manifest.version && lockedWs.version !== ws.manifest.version) {
      offenders.push(
        `workspace "${ws.dir}" version "${ws.manifest.version}" mismatches bun.lock "${lockedWs.version ?? "<missing>"}"`,
      );
    }

    for (const section of sections) {
      const declared = ws.manifest[section] ?? {};
      const lockedSection = lockedWs[section] ?? {};
      for (const [dep, range] of Object.entries(declared)) {
        if (lockedSection[dep] !== range) {
          offenders.push(
            `workspace "${ws.dir}" ${section}.${dep}@${range} mismatches bun.lock "${lockedSection[dep] ?? "<missing>"}"`,
          );
          continue;
        }
        if (range.startsWith("workspace:")) {
          if (!workspaceNames.has(dep) && !lockData.packages[dep]) {
            offenders.push(
              `workspace "${ws.dir}" ${dep}@${range} targets unknown workspace package`,
            );
          }
          continue;
        }
        const pkgEntry = lockData.packages[dep];
        const installed = pkgEntry ? versionOf(pkgEntry.resolved) : null;
        if (!installed) {
          offenders.push(
            `workspace "${ws.dir}" dependency ${dep}@${range} is missing from bun.lock packages`,
          );
        } else if (
          !/^(file:|link:|git\+|github:|https?:)/.test(range) &&
          !satisfiesFn(installed, range)
        ) {
          offenders.push(
            `workspace "${ws.dir}" ${dep}@${range} is not satisfied by bun.lock ${installed}`,
          );
        }
      }
    }
  }

  return offenders;
}

/** Verifies `package.json` `overrides` match `bun.lock` `overrides`. */
export function findOverridesOffenders(
  declaredOverrides: Record<string, string> | undefined,
  lockOverrides: Record<string, string> | undefined,
): string[] {
  const offenders: string[] = [];
  const declared = declaredOverrides ?? {};
  const locked = lockOverrides ?? {};

  for (const [pkg, spec] of Object.entries(declared)) {
    if (locked[pkg] !== spec) {
      offenders.push(
        `override ${pkg}@${spec} does not match bun.lock overrides ("${locked[pkg] ?? "<missing>"}")`,
      );
    }
  }
  for (const [pkg, spec] of Object.entries(locked)) {
    if (!(pkg in declared)) {
      offenders.push(`stale override ${pkg}@${spec} in bun.lock is missing from package.json`);
    }
  }
  return offenders;
}

/** Extracts the resolved version from a `name@version` lock entry. */
export function versionOf(resolved: string): string {
  const at = resolved.lastIndexOf("@");
  return at > 0 ? resolved.slice(at + 1) : resolved;
}

/**
 * Compares declared ranges against the lockfile.
 *
 * `satisfies` is injected so the caller supplies `Bun.semver.satisfies` (the
 * CLI runs under Bun) while unit tests can exercise the comparison plumbing
 * without depending on a global runtime.
 */
export function findLockfileOffenders(
  declared: readonly DeclaredDependency[],
  lock: Readonly<Record<string, LockEntry>>,
  satisfies: (version: string, range: string) => boolean,
): string[] {
  const offenders: string[] = [];

  for (const [name, range] of declared) {
    const entry = lock[name];
    if (!entry) {
      offenders.push(`${name}@${range} — missing from bun.lock (run: bun install)`);
      continue;
    }

    const version = versionOf(entry.resolved);
    if (version === range || /^(http|file:|git|link:|workspace:)/.test(version)) {
      continue; // exact pin or non-registry source — nothing to satisfy
    }

    if (!satisfies(version, range)) {
      offenders.push(
        `${name}@${range} — bun.lock resolves ${version} (run: bun install to sync the lockfile)`,
      );
    }
  }

  return offenders;
}

function main(): number {
  const pkgRaw = readFileSync("package.json", "utf-8");
  const lockRaw = readFileSync("bun.lock", "utf-8");
  const pkgJson = JSON.parse(pkgRaw) as {
    workspaces?: unknown;
    overrides?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const lockData = parseBunLockData(lockRaw);
  const lock = lockData.packages;

  const extraOffenders: string[] = [
    ...findDuplicateJsonKeys(pkgRaw).map((msg) => `package.json: ${msg}`),
    ...findOverridesOffenders(pkgJson.overrides, lockData.overrides),
  ];

  const workspaceDirs = resolveWorkspaceDirs(".", pkgJson.workspaces);
  const workspaceInputs: WorkspaceManifestInput[] = workspaceDirs.map((dir) => {
    const raw = readFileSync(join(dir, "package.json"), "utf-8");
    return {
      dir,
      raw,
      manifest: JSON.parse(raw) as WorkspaceManifestDeps,
    };
  });
  extraOffenders.push(...findWorkspaceLockfileOffenders(workspaceInputs, lockData));
  if (extraOffenders.length > 0) {
    console.error("✖ Workspace/manifest lockfile parity check failed:");
    for (const offender of extraOffenders) console.error(`  • ${offender}`);
    console.error("\nRun `bun install --lockfile-only` (or `bun install`) and fix package.json.");
    return 1;
  }

  const declared: DeclaredDependency[] = [
    ...Object.entries(pkgJson.dependencies ?? {}),
    ...Object.entries(pkgJson.devDependencies ?? {}),
    ...Object.entries(pkgJson.optionalDependencies ?? {}),
  ];

  const offenders = findLockfileOffenders(declared, lock, (version, range) =>
    Bun.semver.satisfies(version, range),
  );

  if (offenders.length > 0) {
    console.error(
      `${FAIL_PREFIX}: package.json and bun.lock are out of sync (${offenders.length}):`,
    );
    for (const line of offenders) console.error(`  - ${line}`);
    return 1;
  }

  console.log(`✅ lockfile-sync: ${declared.length} direct dependencies in sync with bun.lock`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
