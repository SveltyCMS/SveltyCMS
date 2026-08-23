#!/usr/bin/env bun
/**
 * @file scripts/check-bundle-size.ts
 * @description CI gate: fails if TipTap/prosemirror leaks into the critical
 * entry chunk or if the admin shell exceeds size thresholds.
 *
 * Run after build:
 *   bun run build
 *   bun run scripts/check-bundle-size.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, ".svelte-kit", "output", "client", "_app", "immutable");

// ── Thresholds ──────────────────────────────────────────────────────────
const MAX_ENTRY_KB = 80; // entry chunk must stay under 80 KB
const MAX_LAYOUT_KB = 180; // admin shell node (sidebars + chrome) stays under 180 KB

// Marker unique to the (app) admin shell layout node — SvelteKit compiles it
// to `nodes/N.js`, not a `layout*.js` file, so the old name filter missed it.
const ADMIN_SHELL_MARKERS = ["floating-nav", "command-palette", "left-sidebar"];

// ── Heuristics ──────────────────────────────────────────────────────────
const TIPTAP_MARKERS = ["@tiptap/core", "@tiptap/starter-kit", "prosemirror-", "ProseMirror"];
const LARGE_LIB_MARKERS = [
  { pattern: "@better-svelte-email", label: "email preview" },
  { pattern: "ollama", label: "ollama (AI)" },
  { pattern: "node:events", label: "node:events (server leak)" },
];

interface Issue {
  file: string;
  size: number;
  reason: string;
}

function collectJsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name.startsWith(".")) continue;
    try {
      const st = statSync(full);
      if (st.isDirectory()) out.push(...collectJsFiles(full));
      else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(full);
    } catch {
      /* skip */
    }
  }
  return out;
}

function isAdminShellNode(file: string, content: string): boolean {
  // The (app) layout compiles to `_app/immutable/nodes/N.<hash>.js`.
  if (!file.includes(`${join("immutable", "nodes")}`)) return false;
  return ADMIN_SHELL_MARKERS.some((marker) => content.includes(marker));
}

function checkFile(path: string, size: number): Issue | null {
  const rel = path.replace(ROOT, "").replace(/\\/g, "/").replace(/^\/+/, "");
  const name = rel.split("/").pop() || rel;

  // Only check entry chunks + layout files (loaded on every page).
  // SvelteKit compiles the (app) shell to nodes/N.js, so also match that.
  const content = readFileSync(path, "utf8");
  const isEntry = name.startsWith("entry");
  const isLayout = name.includes("layout") || isAdminShellNode(path, content);
  if (!isEntry && !isLayout) return null;

  // Check size threshold
  const kb = Math.round(size / 1024);
  const max = isEntry ? MAX_ENTRY_KB : MAX_LAYOUT_KB;
  if (kb > max) {
    return { file: rel, size: kb, reason: `exceeds ${max} KB threshold` };
  }

  // Check for accidental TipTap leak
  for (const marker of TIPTAP_MARKERS) {
    if (content.includes(marker)) {
      return {
        file: rel,
        size: kb,
        reason: `contains "${marker}" — TipTap leaked into critical chunk (should be lazy-loaded in rich-text widget only)`,
      };
    }
  }

  // Check for large lib leaks
  for (const lib of LARGE_LIB_MARKERS) {
    if (content.includes(lib.pattern)) {
      console.warn(`  ⚠️ ${rel}: contains ${lib.label} (${kb} KB) — verify lazy-load`);
    }
  }

  return null;
}

function main(): number {
  console.log("🔍 Checking critical chunk sizes...\n");

  const allFiles = collectJsFiles(CLIENT_DIR);
  const issues: Issue[] = [];

  for (const file of allFiles) {
    const size = statSync(file).size;
    const issue = checkFile(file, size);
    if (issue) issues.push(issue);
  }

  // ── Report ──────────────────────────────────────────────────────────
  const entryFiles = allFiles.filter((f) => f.includes("entry"));
  const layoutFiles = allFiles.filter((f) => f.includes("layout"));
  const shellNodes = allFiles.filter((f) => {
    const content = readFileSync(f, "utf8");
    return isAdminShellNode(f, content);
  });

  console.log(`  Entry chunks:  ${entryFiles.length} file(s)`);
  for (const f of entryFiles) {
    const kb = Math.round(statSync(f).size / 1024);
    console.log(`    ${kb} KB  ${f.replace(CLIENT_DIR, "")}`);
  }

  console.log(`  Layout chunks: ${layoutFiles.length + shellNodes.length} file(s)`);
  for (const f of [...layoutFiles, ...shellNodes]) {
    const kb = Math.round(statSync(f).size / 1024);
    const tag = shellNodes.includes(f) ? " (admin shell)" : "";
    console.log(`    ${kb} KB${tag}  ${f.replace(CLIENT_DIR, "")}`);
  }

  if (issues.length === 0) {
    console.log("\n✅ All critical chunks within limits — TipTap lazy-load intact.");
    return 0;
  }

  console.log("\n❌ Bundle size violations:\n");
  for (const issue of issues) {
    console.log(`  ${issue.file}: ${issue.size} KB — ${issue.reason}`);
  }
  console.log("\nFix: ensure TipTap is only loaded via dynamic import() in the rich-text widget.");
  return 1;
}

process.exit(main());
