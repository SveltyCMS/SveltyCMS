/**
 * @file scripts/check/check-pinned-actions.ts
 * @description Validates that all third-party GitHub Actions references in workflow
 * and action YAML files are pinned by immutable 40-character commit SHAs.
 *
 * Features:
 * - Scans .github/workflows/*.yml, .github/workflows/*.yaml, and .github/actions subdirectories
 * - Enforces immutable commit SHAs on all third-party uses: declarations (OpenSSF Scorecard: Pinned-Dependencies)
 * - Ignores local repository actions (`./...`) and container images (`docker://...`)
 * - Pure scan core for unit testability
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

export interface PinnedActionViolation {
  file: string;
  line: number;
  raw: string;
  action: string;
  ref: string | null;
  reason: "missing-ref" | "not-sha";
}

export interface ActionPinningScanResult {
  scannedFiles: number;
  totalActions: number;
  violations: PinnedActionViolation[];
}

function collectYamlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectYamlFiles(full, out);
    } else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pure scan core: inspects all GitHub workflow and action definition files
 * under the provided root directory and returns any unpinned actions.
 */
export function scanPinnedActions(root: string = REPO_ROOT): ActionPinningScanResult {
  const targetDirs = [join(root, ".github", "workflows"), join(root, ".github", "actions")];

  const files: string[] = [];
  for (const dir of targetDirs) {
    collectYamlFiles(dir, files);
  }

  const violations: PinnedActionViolation[] = [];
  let totalActions = 0;

  for (const file of files) {
    const relPath = relative(root, file).replaceAll("\\", "/");
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      // Match `uses: <target>` or `- uses: <target>`
      const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
      if (!match) continue;

      const raw = (match[1] ?? "").replace(/^['"]+|['"]+$/g, "");
      // Skip local repository actions and docker actions
      if (raw.startsWith("./") || raw.startsWith("/") || raw.startsWith("docker://")) {
        continue;
      }

      totalActions++;
      const atIndex = raw.lastIndexOf("@");
      if (atIndex === -1) {
        violations.push({
          file: relPath,
          line: index + 1,
          raw,
          action: raw,
          ref: null,
          reason: "missing-ref",
        });
        continue;
      }

      const action = raw.slice(0, atIndex);
      const ref = raw.slice(atIndex + 1);

      if (!COMMIT_SHA_RE.test(ref)) {
        violations.push({
          file: relPath,
          line: index + 1,
          raw,
          action,
          ref,
          reason: "not-sha",
        });
      }
    }
  }

  return {
    scannedFiles: files.length,
    totalActions,
    violations,
  };
}

export function main(root: string = REPO_ROOT): number {
  const result = scanPinnedActions(root);

  if (result.violations.length === 0) {
    console.log(
      `✓ All ${result.totalActions} GitHub Actions across ${result.scannedFiles} workflow/action files are pinned by commit SHA.`,
    );
    return 0;
  }

  console.error(
    `✖ Found ${result.violations.length} unpinned GitHub Actions reference(s) (OpenSSF Scorecard: Pinned-Dependencies):`,
  );
  for (const v of result.violations) {
    const detail =
      v.reason === "missing-ref"
        ? "missing @<sha> reference"
        : `reference "${v.ref}" is not a 40-character commit SHA`;
    console.error(`  • ${v.file}:${v.line} -> ${v.raw} (${detail})`);
  }
  console.error(
    "\nFix: Pin third-party actions to full commit SHAs, e.g. `uses: actions/checkout@<sha> # v4`.",
  );
  return 1;
}

if (import.meta.main) {
  process.exit(main());
}
