/**
 * @file src/utils/compilation/transformers.ts
 * @description TypeScript AST transformers for ensuring schema integrity and runtime compatibility.
 *
 * Provides both individual transformers (for external use) and an optimized
 * composite transformer that merges all passes into a single AST traversal.
 *
 * ### Transformer version history
 * v5 — Deterministic widget UUIDs, scoped schema injection, safe .js extensions,
 *       alias→extension fallthrough, declaration-position widget guard.
 * v6 — Widget UUID injection moved to the first-argument object literal (fires
 *       for both bare `widgets.X({...})` and `globalThis.widgets.X({...})`);
 *       composite now descends after schema _id/tenantId injection so passes
 *       nested under exported schema objects (widget calls in `fields`) run.
 */

import {
  SyntaxKind,
  factory,
  isBindingElement,
  isCallExpression,
  isExportAssignment,
  isExportDeclaration,
  isExportSpecifier,
  isIdentifier,
  isImportClause,
  isImportDeclaration,
  isImportSpecifier,
  isNamedImports,
  isNamespaceImport,
  isObjectLiteralExpression,
  isParameter,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  visitEachChild,
  visitNode,
  type CallExpression,
  type Identifier,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
  type TransformerFactory,
  type VisitResult,
  type Visitor,
} from "typescript";
import path from "node:path";
import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathAliases } from "../../../path-aliases.ts";

// ─── Compile-time aliases (strip ./ prefix for specifier matching) ──────
const compileAliases: Record<string, string> = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, value.replace(/^\.\//, "")]),
);

// 🚀 Performance: Pre-resolved alias entries avoid per-import Object.entries() + path.resolve()
const COMPILE_ALIAS_ENTRIES: Array<{ alias: string; resolvedTarget: string }> = Object.entries(
  compileAliases,
).map(([alias, target]) => ({
  alias,
  resolvedTarget: path.resolve(process.cwd(), target),
}));

// 🚀 Performance: Process-level directory stat cache avoids repeated sync disk syscalls in AST traversal
const dirStatCache = new Map<string, boolean>();

// ─── Schema property markers for _id/tenantId injection ─────────────────
// Only injected on EXPORTED object literals (ExportAssignment parent).
const SCHEMA_MARKERS = new Set([
  "fields",
  "icon",
  "title",
  "description",
  "status",
  "revision",
  "livePreview",
]);

// ─── Extensions that should NOT get .js appended ────────────────────────
const SKIP_JS_EXT = /\.(js|mjs|cjs|json|ts|svelte|svelte\.ts|css|svg|png|jpe?g|webp|wasm)$/;

// ─── Widget UUID counter (per-file, deterministic) ──────────────────────
function makeUuidFactory(sourceFileName: string) {
  let callIndex = 0;
  return () => {
    const seed = `${sourceFileName}#${callIndex++}`;
    const hex = createHash("sha256").update(seed).digest("hex");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `4${hex.slice(13, 16)}`, // UUID v4 variant bits
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  };
}

// ─── Widget factory call detection (shared) ────────────────────────────
/** True when the call is `widgets.X(...)` or `globalThis.widgets.X(...)`. */
function isWidgetFactoryCall(call: CallExpression): boolean {
  const callee = call.expression;
  if (!isPropertyAccessExpression(callee)) return false;
  const base = callee.expression;
  if (isIdentifier(base)) return base.text === "widgets";
  return (
    isPropertyAccessExpression(base) &&
    isIdentifier(base.expression) &&
    base.expression.text === "globalThis" &&
    isIdentifier(base.name) &&
    base.name.text === "widgets"
  );
}

/** True when an object literal already carries a `uuid` property. */
function hasUuidProperty(obj: ObjectLiteralExpression): boolean {
  return obj.properties.some(
    (prop) => isPropertyAssignment(prop) && isIdentifier(prop.name) && prop.name.text === "uuid",
  );
}

// ─── Guard: is this identifier a declaration name (don't rewrite)? ──────
function isDeclarationPosition(node: Identifier): boolean {
  const p = node.parent;
  return (
    (isVariableDeclaration(p) && p.name === node) ||
    (isParameter(p) && p.name === node) ||
    (isBindingElement(p) && p.name === node) ||
    (isPropertyAssignment(p) && p.name === node) ||
    isImportSpecifier(p) ||
    isImportClause(p) ||
    isNamespaceImport(p) ||
    isExportSpecifier(p) ||
    (isPropertyAccessExpression(p) && p.name === node)
  );
}

// ─── Individual transformers (backward compatible) ──────────────────────

export const widgetTransformer: TransformerFactory<SourceFile> = (context) => (sourceFile) => {
  const getUuid = makeUuidFactory(sourceFile.fileName);
  const visitor = (node: Node): VisitResult<Node> => {
    if (isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      if (node.importClause?.namedBindings && isNamedImports(node.importClause.namedBindings)) {
        const hasWidgetsAlias = node.importClause.namedBindings.elements.some(
          (element) => element.name.text === "widgets",
        );
        if (
          hasWidgetsAlias &&
          (moduleSpecifier.includes("@src/stores/widget-store.svelte.ts") ||
            /widgets/.test(moduleSpecifier))
        ) {
          return [];
        }
      }
    }

    // Rewrite `widgets` identifier → `globalThis.widgets` (skip declarations)
    if (isIdentifier(node) && node.text === "widgets" && !isDeclarationPosition(node)) {
      return factory.createPropertyAccessExpression(
        factory.createIdentifier("globalThis"),
        factory.createIdentifier("widgets"),
      );
    }

    // Widget call argument UUID injection (deterministic, hash-derived).
    // Fires on the FIRST-ARGUMENT object literal of a widget factory call
    // (`widgets.X({...})` or pre-written `globalThis.widgets.X({...})`), never
    // on the call node itself: in this pre-order traversal the callee
    // identifier is still bare `widgets` when the call is visited, so a
    // call-level check can never observe the rewritten `globalThis.widgets`.
    // Injecting on the argument lets the framework rebuild the call with the
    // enriched object; descend afterwards so nested widget calls (groups,
    // repeaters) are processed too.
    if (
      isObjectLiteralExpression(node) &&
      node.parent &&
      isCallExpression(node.parent) &&
      node.parent.arguments[0] === node &&
      isWidgetFactoryCall(node.parent) &&
      !hasUuidProperty(node)
    ) {
      const withUuid = factory.updateObjectLiteralExpression(node, [
        factory.createPropertyAssignment("uuid", factory.createStringLiteral(getUuid())),
        ...node.properties,
      ]);
      return visitEachChild(withUuid, visitor, context);
    }

    return visitEachChild(node, visitor, context);
  };
  return visitNode(sourceFile, visitor) as SourceFile;
};

export const addJsExtensionTransformer: TransformerFactory<SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: Node): VisitResult<Node> => {
      if (
        (isImportDeclaration(node) || isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith(".") && !SKIP_JS_EXT.test(specifier)) {
          const resolved = resolveDirImport(sourceFile.fileName, specifier);
          const ns = factory.createStringLiteral(resolved);
          if (isImportDeclaration(node)) {
            return factory.updateImportDeclaration(
              node,
              node.modifiers,
              node.importClause,
              ns,
              node.assertClause,
            );
          }
          return factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ns,
            node.assertClause,
          );
        }
      }
      return visitEachChild(node, visitor, context);
    };
    return visitNode(sourceFile, visitor) as SourceFile;
  };

export const commonjsToEsModuleTransformer: TransformerFactory<SourceFile> =
  (context) => (sourceFile) => {
    let needsFileURLToPath = false;
    const visitor = (node: Node): VisitResult<Node> => {
      if (isIdentifier(node) && node.text === "__filename") {
        needsFileURLToPath = true;
        return factory.createCallExpression(
          factory.createIdentifier("fileURLToPath"),
          undefined,
          [],
        );
      }
      if (isIdentifier(node) && node.text === "__dirname") {
        needsFileURLToPath = true;
        return factory.createCallExpression(
          factory.createPropertyAccessExpression(factory.createIdentifier("path"), "dirname"),
          undefined,
          [],
        );
      }
      return visitEachChild(node, visitor, context);
    };
    let transformedFile = visitNode(sourceFile, visitor) as SourceFile;

    if (needsFileURLToPath) {
      const urlImport = factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          false,
          undefined,
          factory.createNamedImports([
            factory.createImportSpecifier(
              false,
              undefined,
              factory.createIdentifier("fileURLToPath"),
            ),
          ]),
        ),
        factory.createStringLiteral("url"),
      );
      const pathImport = factory.createImportDeclaration(
        undefined,
        factory.createImportClause(false, factory.createIdentifier("path"), undefined),
        factory.createStringLiteral("path"),
      );
      transformedFile = factory.updateSourceFile(transformedFile, [
        urlImport,
        pathImport,
        ...transformedFile.statements,
      ]);
    }

    return transformedFile;
  };

export const aliasResolverTransformer: TransformerFactory<SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: Node): VisitResult<Node> => {
      if (
        (isImportDeclaration(node) || isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        for (const [alias, target] of Object.entries(compileAliases)) {
          if (specifier.startsWith(alias)) {
            const cwd = process.cwd();
            const sourceDir = path.dirname(path.resolve(sourceFile.fileName));
            const targetDir = path.resolve(cwd, target);

            let relativePath = path.relative(sourceDir, targetDir).replace(/\\/g, "/");
            if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;

            const remaining = specifier.slice(alias.length);
            const newSpecifier = factory.createStringLiteral(relativePath + remaining);

            if (isImportDeclaration(node)) {
              return factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                newSpecifier,
                node.assertClause,
              );
            }
            return factory.updateExportDeclaration(
              node,
              node.modifiers,
              node.isTypeOnly,
              node.exportClause,
              newSpecifier,
              node.assertClause,
            );
          }
        }
      }
      return visitEachChild(node, visitor, context);
    };
    return visitNode(sourceFile, visitor) as SourceFile;
  };

/**
 * Unified transformer for schema objects.
 * ONLY injects _id/tenantId on EXPORTED object literals
 * (ExportAssignment or ExportDeclaration ancestor).
 */
export const schemaTransformer =
  (tenantId?: string | null): TransformerFactory<SourceFile> =>
  (context) =>
  (sourceFile) => {
    const visitor = (node: Node): VisitResult<Node> => {
      if (isObjectLiteralExpression(node) && isExportedObject(node)) {
        const hasSchemaMarkers = node.properties.some(
          (prop) =>
            isPropertyAssignment(prop) &&
            isIdentifier(prop.name) &&
            SCHEMA_MARKERS.has(prop.name.text),
        );

        if (hasSchemaMarkers) {
          let updated = node;
          const hasProp = (name: string) =>
            updated.properties.some(
              (p) => isPropertyAssignment(p) && isIdentifier(p.name) && p.name.text === name,
            );

          if (!hasProp("_id")) {
            const fileName = sourceFile.fileName;
            const baseName = fileName.split(/[\\/]/).pop() || "unknown";
            const slugId = baseName
              .replace(/\.(ts|js|svelte)$/, "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");

            updated = factory.updateObjectLiteralExpression(updated, [
              factory.createPropertyAssignment("_id", factory.createStringLiteral(slugId)),
              ...updated.properties,
            ]);
          }

          if (tenantId !== undefined && !hasProp("tenantId")) {
            const tenantValue =
              tenantId === null ? factory.createNull() : factory.createStringLiteral(tenantId);

            updated = factory.updateObjectLiteralExpression(updated, [
              factory.createPropertyAssignment("tenantId", tenantValue),
              ...updated.properties,
            ]);
          }

          return updated;
        }
      }

      return visitEachChild(node, visitor, context);
    };

    return visitNode(sourceFile, visitor) as SourceFile;
  };

// ─── Helpers ────────────────────────────────────────────────────────────

/** True when this object literal belongs to an exported declaration (export default/const/let/var). */
function isExportedObject(node: ObjectLiteralExpression): boolean {
  // export default { ... }
  if (isExportAssignment(node.parent) && node.parent.expression === node) return true;
  // export const schema = { ... }  /  export let x = { ... }  /  export var y = { ... }
  if (isVariableDeclaration(node.parent) && node.parent.initializer === node) {
    const gparent = node.parent.parent;
    if (isVariableDeclarationList(gparent) && gparent.declarations[0] === node.parent) {
      const ggparent = gparent.parent;
      if (isVariableStatement(ggparent)) {
        return ggparent.modifiers?.some((m) => m.kind === SyntaxKind.ExportKeyword) ?? false;
      }
    }
  }
  return false;
}

/** Resolves directory imports to index.js, bare specifiers get .js */
function resolveDirImport(sourceFileName: string, specifier: string): string {
  const resolved = path.resolve(path.dirname(sourceFileName), specifier);
  let isDir = dirStatCache.get(resolved);
  if (isDir === undefined) {
    try {
      isDir = statSync(resolved).isDirectory();
    } catch {
      isDir = false;
    }
    dirStatCache.set(resolved, isDir);
  }
  return isDir ? `${specifier.replace(/\/$/, "")}/index.js` : `${specifier}.js`;
}

// ─── Optimized composite transformer (single AST pass) ─────────────────

/**
 * Merges all transformers into ONE traversal for ~5x faster compilation.
 *
 * ### Passes (in order within a single visitor):
 * 1. Widget proxy import removal
 * 2. Alias resolution → falls through to .js extension
 * 3. .js extension append (safe — skips svelte/json/css/svg etc., resolves dirs)
 * 4. `widgets` identifier → `globalThis.widgets` (skips declarations)
 * 5. `__filename` / `__dirname` → ESM equivalents
 * 6. Schema _id/tenantId injection (exported objects only)
 * 7. Widget call UUID injection (deterministic hash-derived)
 */
export function createCompositeTransformer(
  tenantId?: string | null,
  stableId?: string,
): TransformerFactory<SourceFile> {
  return (context) => (sourceFile) => {
    const sourceFileName = sourceFile.fileName;
    const sourceDir = path.dirname(path.resolve(sourceFileName));
    let needsUrlImports = false;
    const getUuid = makeUuidFactory(sourceFileName);

    const getStableId = (): string => {
      if (stableId) return stableId;
      const baseName = sourceFileName.split(/[\\/]/).pop() || "unknown";
      return baseName
        .replace(/\.(ts|js|svelte)$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    };

    const visitor: Visitor = (node) => {
      // ── Import/Export declarations ────────────────────────────────
      if (
        (isImportDeclaration(node) || isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;

        // 1. Widget proxy removal
        if (
          isImportDeclaration(node) &&
          node.importClause?.namedBindings &&
          isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.some((el) => el.name.text === "widgets") &&
          (specifier.includes("@src/stores/widget-store.svelte.ts") || /widgets/.test(specifier))
        ) {
          return [];
        }

        // 2. Alias resolution — rewrite then fall through to .js extension
        let rewriting = specifier;
        for (let i = 0; i < COMPILE_ALIAS_ENTRIES.length; i++) {
          const entry = COMPILE_ALIAS_ENTRIES[i];
          if (!rewriting.startsWith(entry.alias)) continue;
          let relativePath = path.relative(sourceDir, entry.resolvedTarget).replace(/\\/g, "/");
          if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
          rewriting = relativePath + rewriting.slice(entry.alias.length);
          break; // only one alias matches
        }

        // 3. .js extension (safe) — after alias resolution so rewritten paths get .js too
        if (rewriting.startsWith(".") && !SKIP_JS_EXT.test(rewriting)) {
          rewriting = resolveDirImport(sourceFileName, rewriting);
        }

        if (rewriting !== specifier) {
          const ns = factory.createStringLiteral(rewriting);
          return isImportDeclaration(node)
            ? factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                ns,
                node.assertClause,
              )
            : factory.updateExportDeclaration(
                node,
                node.modifiers,
                node.isTypeOnly,
                node.exportClause,
                ns,
                node.assertClause,
              );
        }

        return visitEachChild(node, visitor, context);
      }

      // ── Identifiers ──────────────────────────────────────────────
      if (isIdentifier(node)) {
        // 4. `widgets` → `globalThis.widgets` (skip declarations & property names)
        if (node.text === "widgets" && !isDeclarationPosition(node)) {
          return factory.createPropertyAccessExpression(
            factory.createIdentifier("globalThis"),
            factory.createIdentifier("widgets"),
          );
        }

        // 5. __filename / __dirname → ESM equivalents
        if (node.text === "__filename" || node.text === "__dirname") {
          needsUrlImports = true;
          const urlExpr = factory.createCallExpression(
            factory.createPropertyAccessExpression(
              factory.createMetaProperty(
                SyntaxKind.ImportKeyword,
                factory.createIdentifier("meta"),
              ),
              "url",
            ),
            undefined,
            [],
          );
          if (node.text === "__filename") {
            return factory.createCallExpression(
              factory.createIdentifier("fileURLToPath"),
              undefined,
              [urlExpr],
            );
          }
          return factory.createCallExpression(
            factory.createPropertyAccessExpression(factory.createIdentifier("path"), "dirname"),
            undefined,
            [urlExpr],
          );
        }
      }

      // ── Schema object literals (exported only) ───────────────────
      if (isObjectLiteralExpression(node) && isExportedObject(node)) {
        const hasMarker = node.properties.some(
          (p) => isPropertyAssignment(p) && isIdentifier(p.name) && SCHEMA_MARKERS.has(p.name.text),
        );
        if (hasMarker) {
          let obj = node;
          const hp = (n: string) =>
            obj.properties.some(
              (p) => isPropertyAssignment(p) && isIdentifier(p.name) && p.name.text === n,
            );

          if (!hp("_id")) {
            const slugId = getStableId();
            obj = factory.updateObjectLiteralExpression(obj, [
              factory.createPropertyAssignment("_id", factory.createStringLiteral(slugId)),
              ...obj.properties,
            ]);
          }
          if (tenantId !== undefined && !hp("tenantId")) {
            obj = factory.updateObjectLiteralExpression(obj, [
              factory.createPropertyAssignment(
                "tenantId",
                tenantId === null ? factory.createNull() : factory.createStringLiteral(tenantId),
              ),
              ...obj.properties,
            ]);
          }
          // 🐛 v6: DESCEND after injection. Returning the updated object here
          // without visiting its children skipped every later pass for content
          // nested under an exported schema (fields arrays hold the widget
          // factory calls): `widgets` identifiers stayed bare and no widget-call
          // UUID was ever injected for the canonical collection shape.
          return visitEachChild(obj, visitor, context);
        }
      }

      // ── Widget call argument UUID injection (deterministic) ────────
      // Fires on the FIRST-ARGUMENT object literal of `widgets.X({...})` or
      // `globalThis.widgets.X({...})` — never on the call node: in this
      // pre-order traversal the callee identifier is still bare `widgets` when
      // the call is visited, so a call-level check cannot observe the rewritten
      // `globalThis.widgets`. Injecting on the argument lets the framework
      // rebuild the call with the enriched object; descend afterwards so nested
      // widget calls (groups, repeaters) are processed too.
      if (
        isObjectLiteralExpression(node) &&
        node.parent &&
        isCallExpression(node.parent) &&
        node.parent.arguments[0] === node &&
        isWidgetFactoryCall(node.parent) &&
        !hasUuidProperty(node)
      ) {
        const withUuid = factory.updateObjectLiteralExpression(node, [
          factory.createPropertyAssignment("uuid", factory.createStringLiteral(getUuid())),
          ...node.properties,
        ]);
        return visitEachChild(withUuid, visitor, context);
      }

      return visitEachChild(node, visitor, context);
    };

    let result = visitNode(sourceFile, visitor) as SourceFile;

    if (needsUrlImports) {
      const urlImport = factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          false,
          undefined,
          factory.createNamedImports([
            factory.createImportSpecifier(
              false,
              undefined,
              factory.createIdentifier("fileURLToPath"),
            ),
          ]),
        ),
        factory.createStringLiteral("url"),
      );
      const pathImport = factory.createImportDeclaration(
        undefined,
        factory.createImportClause(false, factory.createIdentifier("path"), undefined),
        factory.createStringLiteral("path"),
      );
      result = factory.updateSourceFile(result, [urlImport, pathImport, ...result.statements]);
    }

    return result;
  };
}
