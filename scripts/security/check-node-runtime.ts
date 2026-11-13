/**
 * @file scripts/security/check-node-runtime.ts
 * @description Fail-closed Node.js runtime floor for security releases.
 *
 * Node compiles its own Brotli snapshot into the binary (`node:zlib`), so
 * **CVE-2026-111497** (Brotli decoder out-of-bounds write → memory corruption /
 * RCE) is fixed only by upgrading Node itself:
 *   - Node 22.23.4+, 24.22.1+, 26.12.1+
 * Updating a system brotli used by another process (e.g. Plesk/nginx) does not
 * change the decoder inside the Node runtime.
 *
 * The floor is read from `package.json` → `engines.node` (single source of
 * truth) and compared against the live `process.version`; a pre-release suffix
 * is ignored.
 *
 * ### Features:
 * - Reads the floor from `engines.node` so the manifest and the gate cannot drift
 * - Compares the running Node binary, not a system/shared library
 * - Explains the nginx-brotli misconception in the failure output
 * - `SKIP_NODE_RUNTIME_CHECK` is honoured for local dev only — CI and production
 *   always verify the runtime and say why the override was ignored
 * - Import-safe: `main()` only runs when the file is executed directly
 *
 * Usage: `node scripts/security/check-node-runtime.ts`
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Parse `v24.22.1`, `24.22.1`, `24.22.1-rc.1` → { major, minor, patch }. */
export function parseVersion(input: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(input.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Standard semver precedence for the three numeric components. */
export function compareVersions(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Extract the minimum version from an engines range such as `>=24.22.1`. */
export function parseNodeFloor(enginesNode: string | undefined): Semver | null {
  if (!enginesNode) return null;
  const match = />=\s*v?(\d+\.\d+\.\d+)/.exec(enginesNode);
  return match?.[1] ? parseVersion(match[1]) : null;
}

function formatVersion(version: Semver): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** True when the operator asked to skip the runtime floor check. */
export function isSkipRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.SKIP_NODE_RUNTIME_CHECK === "true" ||
    env.SKIP_NODE_RUNTIME_CHECK === "1" ||
    env.SKIP_NODE_CHECK === "1"
  );
}

/**
 * The skip override is a local-dev convenience. CI and production are the two
 * places the floor actually protects, so neither may talk its way out of it.
 */
export function skipOverrideAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !(env.CI === "true" || env.NODE_ENV === "production");
}

/** Whether the skip override applies (requested AND not CI/production). */
export function shouldSkipNodeRuntimeCheck(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSkipRequested(env) && skipOverrideAllowed(env);
}

/** Returns a process exit code (0 = runtime is at or above the floor). */
export function checkNodeRuntime(
  currentVersion: string,
  enginesNode: string | undefined,
  isBun = false,
): { ok: boolean; message: string } {
  const floor = parseNodeFloor(enginesNode);
  if (!floor) {
    return {
      ok: false,
      message:
        "✖ package.json engines.node is missing or is not a `>=x.y.z` floor — cannot verify the runtime.",
    };
  }

  // Bun is a different engine with its own bundled zlib/brotli; the Node CVE
  // does not apply. This script is invoked with `node` in the gates.
  if (isBun) {
    return {
      ok: true,
      message: `ℹ Bun runtime detected — Node floor v${formatVersion(floor)} does not apply; verify Bun's own bundled-brotli advisory.`,
    };
  }

  const current = parseVersion(currentVersion);
  if (!current) {
    return {
      ok: false,
      message: `✖ Unrecognised Node version "${currentVersion}" — cannot verify the security floor.`,
    };
  }

  if (compareVersions(current, floor) < 0) {
    return {
      ok: false,
      message: [
        `✖ Node v${formatVersion(current)} is below the security floor v${formatVersion(floor)}.`,
        "  CVE-2026-111497: the Brotli decoder bundled in Node allows an out-of-bounds write",
        "  (crash / memory disclosure / RCE) when the process decompresses hostile Brotli data —",
        "  including undici's automatic decoding of outbound `Content-Encoding: br` responses.",
        "  The decoder is compiled INTO the Node binary: patching a system brotli (nginx, Plesk)",
        "  does not patch `node:zlib`.",
        `  Fix: install Node v${formatVersion(floor)} or newer (22.23.4+ / 26.12.1+ on those lines), then restart the app.`,
      ].join("\n"),
    };
  }

  return {
    ok: true,
    message: `✓ Node v${formatVersion(current)} meets the security floor v${formatVersion(floor)} (bundled brotli ${String((process.versions as Record<string, string | undefined>).brotli ?? "unknown")}).`,
  };
}

function main(): number {
  if (isSkipRequested()) {
    if (skipOverrideAllowed()) {
      console.log("ℹ Node runtime check skipped via SKIP_NODE_RUNTIME_CHECK.");
      return 0;
    }
    console.error(
      "✖ SKIP_NODE_RUNTIME_CHECK / SKIP_NODE_CHECK is ignored in CI and production —\n" +
        "  CVE-2026-111497 (Brotli decoder in the Node binary) must be verified on every deploy,\n" +
        "  so the runtime check runs anyway.",
    );
  }

  let enginesNode: string | undefined;
  try {
    const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    enginesNode = (
      JSON.parse(readFileSync(packageJsonPath, "utf8")) as { engines?: { node?: string } }
    ).engines?.node;
  } catch (err) {
    console.error(
      `✖ Could not read package.json: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const result = checkNodeRuntime(
    process.versions.node,
    enginesNode,
    Boolean((process.versions as Record<string, string | undefined>).bun),
  );
  const write = result.ok ? console.log : console.error;
  write(result.message);
  return result.ok ? 0 : 1;
}

const entry = process.argv[1];
const invokedDirectly =
  Boolean(entry) &&
  (() => {
    try {
      return pathToFileURL(entry).href === import.meta.url;
    } catch {
      return false;
    }
  })();

if (invokedDirectly) {
  process.exit(main());
}
