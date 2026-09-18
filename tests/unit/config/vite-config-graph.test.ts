/**
 * @file tests/unit/config/vite-config-graph.test.ts
 * @description Guard: the module graph Vite's config loader (esbuild) bundles must stay
 * path-alias free for **value** imports.
 *
 * Vite bundles `vite.config.ts` / `vitest.config.ts` with esbuild, which does not apply
 * `pathAliases`. One value import of an alias in that graph makes every tool that loads
 * the config fail at once:
 *
 *   src/utils/tenant.ts (21:38) [UNRESOLVED_IMPORT] Could not resolve '@src/services/core/settings-service'
 *   failed to load config from vite.config.ts
 *
 * That breaks dev, build, `svelte-kit sync` and the whole unit suite. Modules in the graph
 * must use relative imports (`hardware-profile.ts` and `compile.ts` document this);
 * type-only imports are fine because esbuild erases them.
 *
 * Parsed with the TypeScript compiler API rather than regexes: glob literals such as
 * `src/**\/*.ts` otherwise look like block comments and `typeof import("…")` looks like a
 * runtime import.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { pathAliases } from "../../../path-aliases.ts";

const ROOT = process.cwd();

/** Entry points Vite's config loader bundles with esbuild. */
const ROOTS = ["vite.config.ts", "vitest.config.ts"];

const ALIAS_PREFIX_RE = new RegExp(
  `^(?:${Object.keys(pathAliases)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?:/|$)`,
);

/** Specifiers the bundle must resolve at config-load time (types erased). */
function runtimeSpecifiers(file: string, text = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const importsRuntimeValue =
        !clause?.isTypeOnly &&
        (clause === undefined ||
          clause.name !== undefined ||
          clause.namedBindings === undefined ||
          ts.isNamespaceImport(clause.namedBindings) ||
          clause.namedBindings.elements.some((element) => !element.isTypeOnly));
      if (importsRuntimeValue) specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [argument] = node.arguments;
      if (ts.isStringLiteral(argument)) specifiers.push(argument.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return specifiers;
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not a file — try the next extension
    }
  }
  return null;
}

interface GraphScan {
  visited: string[];
  aliasImports: string[];
}

function scanConfigGraph(): GraphScan {
  const queue = ROOTS.map((root) => join(ROOT, root));
  const visited = new Set<string>();
  const aliasImports: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;

    let specifiers: string[];
    try {
      specifiers = runtimeSpecifiers(file);
    } catch {
      continue; // unreadable entry — the sanity assertion below catches a broken walk
    }
    visited.add(file);

    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (resolved && !visited.has(resolved)) queue.push(resolved);
        continue;
      }
      if (!ALIAS_PREFIX_RE.test(specifier)) continue;

      aliasImports.push(
        `${file.replace(ROOT, "").replace(/\\/g, "/").replace(/^\//, "")} → "${specifier}"`,
      );
    }
  }

  return { visited: [...visited], aliasImports };
}

describe("vite config graph (esbuild-bundled)", () => {
  const { visited, aliasImports } = scanConfigGraph();
  const visitedRelative = visited.map((f) => f.replace(ROOT, "").replace(/\\/g, "/"));

  it("extracts runtime specifiers only (self-check)", () => {
    // Mirrors the real pitfalls in vite.config.ts: a glob literal that looks like a
    // block comment, a `typeof import("…")` type query, commented-out imports, and
    // type-only bindings.
    const sample = `
      import { existsSync } from "node:fs";
      import type { Plugin } from "vite";
      import { type DatabaseId, logger } from "@utils/logger";
      // import { dead } from "./commented-out.ts";
      const files = path.join(CWD, "src/**/*.ts");
      type X = (typeof import("./type-query-only.ts"))["x"];
      const m = await import("./real-dynamic.ts");
      export { helper } from "./re-export.ts";
      export type { T } from "./types-only.ts";
    `;

    expect(runtimeSpecifiers("fixture.ts", sample)).toEqual([
      "node:fs",
      "@utils/logger",
      "./real-dynamic.ts",
      "./re-export.ts",
    ]);
  });

  it("reaches the modules config loading depends on", () => {
    // Proof the walk follows vite.config.ts → dynamic import → compilation/compile.ts,
    // the edge that carried the 2026-09-18 alias regression into tenant.ts.
    expect(visitedRelative.some((f) => f.endsWith("compilation/compile.ts"))).toBe(true);
    expect(visitedRelative.some((f) => f.endsWith("utils/tenant.server.ts"))).toBe(true);
    expect(visitedRelative.some((f) => f.endsWith("utils/hardware-profile.ts"))).toBe(true);
    expect(visited.length).toBeGreaterThan(8);
  });

  it("has no value imports of path aliases", () => {
    if (aliasImports.length > 0) {
      expect.fail(
        `Path aliases are unresolvable in the config bundle (${aliasImports.length}).\n` +
          `Use a relative import, or keep it type-only.\n` +
          aliasImports.map((v) => `  - ${v}`).join("\n"),
      );
    }
  });
});
