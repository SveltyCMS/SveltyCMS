/**
 * @file tests/unit/routes/endpoint-exports.test.ts
 * @description Fail-closed guard for SvelteKit endpoint export rules.
 *
 * `+server.ts` may only export HTTP verbs + the SvelteKit route options. Anything
 * else passes unit tests and dev, then fails the **production build** in the
 * postbuild route analysis:
 *
 *   Error: Invalid export 'assertCollaborationAccess' in /api/collaboration/yjs
 *
 * Helper functions therefore belong in a sibling module (e.g. `yjs-access.ts`,
 * matching the `handlers/*.ts` pattern), never in the endpoint file itself.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = join(ROOT, "src/routes");

/** Valid runtime exports for `+server.ts` (SvelteKit route analysis allowlist). */
const ALLOWED_EXPORTS = new Set([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "QUERY",
  "fallback",
  "prerender",
  "trailingSlash",
  "config",
  "entries",
]);

const VALUE_EXPORT_RE =
  /^\s*export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\}/gm;
const DEFAULT_EXPORT_RE = /^\s*export\s+default\b/m;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walkEndpoints(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkEndpoints(full, out);
    } else if (name === "+server.ts") {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Exported value names (type-only exports are erased before route analysis). */
function exportedNames(source: string): string[] {
  const src = stripComments(source);
  const names: string[] = [];

  for (const match of src.matchAll(VALUE_EXPORT_RE)) {
    names.push(match[1]);
  }

  for (const block of src.matchAll(EXPORT_LIST_RE)) {
    for (const raw of block[1].split(",")) {
      const entry = raw.trim();
      if (!entry || entry.startsWith("type ")) continue;
      const alias = entry.split(/\s+as\s+/);
      const exported = (alias[1] ?? alias[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(exported)) names.push(exported);
    }
  }

  if (DEFAULT_EXPORT_RE.test(src)) names.push("default");
  return names;
}

describe("+server.ts export rules (build-time parity)", () => {
  const endpoints = walkEndpoints(ROUTES_DIR);

  it("classifies exports like SvelteKit (self-check)", () => {
    const sample = `
      export function assertCollaborationAccess() {}
      export const GET = 1;
      export async function POST() {}
      export const _internal = 1;
      export type Foo = { a: string };
      export interface Bar {}
      export { parseEntryDocId as _parse };
      export { type Baz, qux } from "./helpers.ts";
    `;

    expect(exportedNames(sample).sort()).toEqual(
      ["GET", "POST", "_internal", "_parse", "assertCollaborationAccess", "qux"].sort(),
    );
  });

  it("discovers the API endpoints", () => {
    expect(endpoints.length).toBeGreaterThan(8);
  });

  it("exports only HTTP verbs and route options", () => {
    const violations: string[] = [];

    for (const file of endpoints) {
      const rel = toPosix(relative(ROOT, file));
      for (const name of exportedNames(readFileSync(file, "utf8"))) {
        if (ALLOWED_EXPORTS.has(name) || name.startsWith("_")) continue;
        violations.push(`${rel}: invalid export '${name}'`);
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `SvelteKit rejects these endpoint exports at build time (${violations.length}).\n` +
          `Move helpers to a sibling module.\n` +
          violations.map((v) => `  - ${v}`).join("\n"),
      );
    }
  });
});
