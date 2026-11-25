#!/usr/bin/env bun
/**
 * @file scripts/check/check-workflow-yaml.ts
 * @description Validates YAML syntax and structural integrity for all GitHub Actions workflows
 * and composite actions under `.github/workflows/` and `.github/actions/`.
 *
 * Features:
 * - Parses every `.yml` / `.yaml` under `.github/workflows` and `.github/actions` via `yaml`
 * - Fails closed on syntax errors, duplicate mapping keys, or non-mapping workflow roots
 * - Exposes a pure `validateWorkflowYaml(root)` core for deterministic unit testing
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export interface WorkflowYamlError {
  file: string;
  line: number | null;
  column: number | null;
  message: string;
}

export interface WorkflowYamlResult {
  scannedFiles: number;
  errors: WorkflowYamlError[];
}

function collectYamlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectYamlFiles(full, out);
    } else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pure core: parses all GitHub workflow and action YAML files under `root` and returns
 * any syntax or structural errors found.
 */
export function validateWorkflowYaml(root: string = REPO_ROOT): WorkflowYamlResult {
  const dirs = [join(root, ".github", "workflows"), join(root, ".github", "actions")];
  const files: string[] = [];
  for (const dir of dirs) collectYamlFiles(dir, files);
  files.sort();

  const errors: WorkflowYamlError[] = [];

  for (const file of files) {
    const relPath = relative(root, file).replaceAll("\\", "/");
    const content = readFileSync(file, "utf8");
    const docs = parseAllDocuments(content, { strict: true, uniqueKeys: true });

    if (docs.length === 0) {
      errors.push({ file: relPath, line: 1, column: 1, message: "Empty YAML workflow file" });
      continue;
    }

    for (const doc of docs) {
      for (const err of doc.errors) {
        const pos = err.linePos?.[0];
        errors.push({
          file: relPath,
          line: pos?.line ?? null,
          column: pos?.col ?? null,
          message: err.message.split("\n")[0] ?? "YAML parse error",
        });
      }

      if (doc.errors.length === 0) {
        const value: unknown = doc.toJS();
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          errors.push({
            file: relPath,
            line: 1,
            column: 1,
            message: "Workflow/action root must be a YAML mapping",
          });
        }
      }
    }
  }

  return {
    scannedFiles: files.length,
    errors,
  };
}

export function main(root: string = REPO_ROOT): number {
  const result = validateWorkflowYaml(root);
  if (result.errors.length === 0) {
    console.log(`✓ All ${result.scannedFiles} GitHub workflow/action YAML files parsed cleanly.`);
    return 0;
  }

  console.error(`✖ Found ${result.errors.length} GitHub workflow/action YAML error(s):`);
  for (const err of result.errors) {
    const loc = err.line !== null ? `:${err.line}:${err.column ?? 1}` : "";
    console.error(`  • ${err.file}${loc}: ${err.message}`);
  }
  return 1;
}

if (import.meta.main) {
  process.exit(main());
}
