#!/usr/bin/env bun
/**
 * @file scripts/lint-admin-theme.ts
 * @description
 * CI gate for admin theme structural compliance.
 * Fails on layout anti-patterns in src/routes/(app)/.
 *
 * Usage: bun run scripts/lint-admin-theme.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APP_ROUTES = join(ROOT, "src", "routes", "(app)");

const PAGE_SHELL_MARKERS = ["AdminPageShell", "admin-page-shell.svelte"];

// Collection routes use their own dynamic shell — not AdminPageShell
const SKIP_SHELL_CHECK = ["[language]/[...collection]/+page.svelte"];
const LEGACY_ANTI_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /container\s+mx-auto/,
    message: "Use AdminPageShell instead of container mx-auto",
  },
  {
    pattern: /table-container/,
    message: "Use overflow-x-auto + divide-y table pattern",
  },
  { pattern: /table-hover/, message: "Remove legacy table-hover class" },
  {
    pattern: /<h1\s+class="text-3xl/,
    message: "Use PageTitle via AdminPageShell instead of inline h1",
  },
  {
    pattern: /bg-surface-50\/50/,
    message: "Use solid bg-surface-50 dark:bg-surface-950 shell",
  },
  {
    pattern: /class="input"/,
    message: 'Use Input/Select components instead of legacy class="input"',
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".svelte")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(APP_ROUTES);
const violations: string[] = [];
const missingShell: string[] = [];

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const content = readFileSync(file, "utf-8");

  if (file.endsWith("+page.svelte")) {
    if (SKIP_SHELL_CHECK.some((p) => rel.endsWith(p))) continue;
    const hasShell = PAGE_SHELL_MARKERS.some((m) => content.includes(m));
    const hasLegacyShell =
      content.includes("admin-theme-container") ||
      (content.includes("absolute inset-0") && content.includes("PageTitle"));

    if (!hasShell && !hasLegacyShell) {
      missingShell.push(rel);
    }
  }

  for (const { pattern, message } of LEGACY_ANTI_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${rel}: ${message}`);
    }
  }
}

let failed = false;

if (missingShell.length > 0) {
  failed = true;
  console.error("\n❌ Pages without AdminPageShell (required — use admin-page-shell.svelte):\n");
  for (const f of missingShell) console.error(`   - ${f}`);
}

if (violations.length > 0) {
  failed = true;
  console.error("\n❌ Admin theme lint violations:\n");
  for (const v of violations) console.error(`   ${v}`);
}

if (failed) {
  process.exit(1);
}

console.log("\n✅ Admin theme structural lint passed.");
