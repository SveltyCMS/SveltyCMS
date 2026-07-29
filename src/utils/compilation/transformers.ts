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
 */

import * as ts from "typescript";
import path from "node:path";
import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathAliases } from "../../../path-aliases.ts";

// ─── Compile-time aliases (strip ./ prefix for specifier matching) ──────
const compileAliases: Record<string, string> = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, value.replace(/^\.\//, "")]),
);

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

// ─── Guard: is this identifier a declaration name (don't rewrite)? ──────
function isDeclarationPosition(node: ts.Identifier): boolean {
  const p = node.parent;
  return (
    (ts.isVariableDeclaration(p) && p.name === node) ||
    (ts.isParameter(p) && p.name === node) ||
    (ts.isBindingElement(p) && p.name === node) ||
    (ts.isPropertyAssignment(p) && p.name === node) ||
    ts.isImportSpecifier(p) ||
    ts.isImportClause(p) ||
    ts.isNamespaceImport(p) ||
    ts.isExportSpecifier(p) ||
    (ts.isPropertyAccessExpression(p) && p.name === node)
  );
}

// ─── Individual transformers (backward compatible) ──────────────────────

export const widgetTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    const getUuid = makeUuidFactory(sourceFile.fileName);
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleSpecifier = node.moduleSpecifier.text;
        if (
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings)
        ) {
          const hasWidgetsAlias = node.importClause.namedBindings.elements.some(
            (element) => element.name.text === "widgets",
          );
          if (
            hasWidgetsAlias &&
            (moduleSpecifier.includes("@src/stores/widget-store.svelte.ts") ||
              moduleSpecifier.includes("@src/widgets/proxy") ||
              moduleSpecifier.includes("widgets/proxy") ||
              /widgets/.test(moduleSpecifier))
          ) {
            return [];
          }
        }
      }

      // Rewrite `widgets` identifier → `globalThis.widgets` (skip declarations)
      if (ts.isIdentifier(node) && node.text === "widgets" && !isDeclarationPosition(node)) {
        return ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier("globalThis"),
          ts.factory.createIdentifier("widgets"),
        );
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const isWidgetCall =
          ts.isPropertyAccessExpression(node.expression.expression) &&
          ts.isIdentifier(node.expression.expression.expression) &&
          node.expression.expression.expression.text === "globalThis" &&
          ts.isIdentifier(node.expression.expression.name) &&
          node.expression.expression.name.text === "widgets";
        if (
          isWidgetCall &&
          node.arguments.length > 0 &&
          ts.isObjectLiteralExpression(node.arguments[0])
        ) {
          const objectLiteral = node.arguments[0];
          const hasUuid = objectLiteral.properties.some(
            (prop) =>
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === "uuid",
          );
          if (!hasUuid) {
            const uuidProperty = ts.factory.createPropertyAssignment(
              "uuid",
              ts.factory.createStringLiteral(getUuid()),
            );
            const updatedProperties = [uuidProperty, ...objectLiteral.properties];
            const updatedObjectLiteral = ts.factory.updateObjectLiteralExpression(
              objectLiteral,
              updatedProperties,
            );
            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              updatedObjectLiteral,
              ...node.arguments.slice(1),
            ]);
          }
        }
      }

      return ts.visitEachChild(node, visitor, context);
    };
    return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  };

export const addJsExtensionTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith(".") && !SKIP_JS_EXT.test(specifier)) {
          const resolved = resolveDirImport(sourceFile.fileName, specifier);
          const ns = ts.factory.createStringLiteral(resolved);
          if (ts.isImportDeclaration(node)) {
            return ts.factory.updateImportDeclaration(
              node,
              node.modifiers,
              node.importClause,
              ns,
              node.assertClause,
            );
          }
          return ts.factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ns,
            node.assertClause,
          );
        }
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  };

export const commonjsToEsModuleTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    let needsFileURLToPath = false;
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isIdentifier(node) && node.text === "__filename") {
        needsFileURLToPath = true;
        return ts.factory.createCallExpression(
          ts.factory.createIdentifier("fileURLToPath"),
          undefined,
          [],
        );
      }
      if (ts.isIdentifier(node) && node.text === "__dirname") {
        needsFileURLToPath = true;
        return ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("path"), "dirname"),
          undefined,
          [],
        );
      }
      return ts.visitEachChild(node, visitor, context);
    };
    let transformedFile = ts.visitNode(sourceFile, visitor) as ts.SourceFile;

    if (needsFileURLToPath) {
      const urlImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier("fileURLToPath"),
            ),
          ]),
        ),
        ts.factory.createStringLiteral("url"),
      );
      const pathImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(false, ts.factory.createIdentifier("path"), undefined),
        ts.factory.createStringLiteral("path"),
      );
      transformedFile = ts.factory.updateSourceFile(transformedFile, [
        urlImport,
        pathImport,
        ...transformedFile.statements,
      ]);
    }

    return transformedFile;
  };

export const aliasResolverTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
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
            const newSpecifier = ts.factory.createStringLiteral(relativePath + remaining);

            if (ts.isImportDeclaration(node)) {
              return ts.factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                newSpecifier,
                node.assertClause,
              );
            }
            return ts.factory.updateExportDeclaration(
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
      return ts.visitEachChild(node, visitor, context);
    };
    return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  };

/**
 * Unified transformer for schema objects.
 * ONLY injects _id/tenantId on EXPORTED object literals
 * (ExportAssignment or ExportDeclaration ancestor).
 */
export const schemaTransformer =
  (tenantId?: string | null): ts.TransformerFactory<ts.SourceFile> =>
  (context) =>
  (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isObjectLiteralExpression(node) && isExportedObject(node)) {
        const hasSchemaMarkers = node.properties.some(
          (prop) =>
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            SCHEMA_MARKERS.has(prop.name.text),
        );

        if (hasSchemaMarkers) {
          let updated = node;
          const hasProp = (name: string) =>
            updated.properties.some(
              (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
            );

          if (!hasProp("_id")) {
            const fileName = sourceFile.fileName;
            const baseName = fileName.split(/[\\/]/).pop() || "unknown";
            const slugId = baseName
              .replace(/\.(ts|js|svelte)$/, "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");

            updated = ts.factory.updateObjectLiteralExpression(updated, [
              ts.factory.createPropertyAssignment("_id", ts.factory.createStringLiteral(slugId)),
              ...updated.properties,
            ]);
          }

          if (tenantId !== undefined && !hasProp("tenantId")) {
            const tenantValue =
              tenantId === null
                ? ts.factory.createNull()
                : ts.factory.createStringLiteral(tenantId);

            updated = ts.factory.updateObjectLiteralExpression(updated, [
              ts.factory.createPropertyAssignment("tenantId", tenantValue),
              ...updated.properties,
            ]);
          }

          return updated;
        }
      }

      return ts.visitEachChild(node, visitor, context);
    };

    return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  };

// ─── Helpers ────────────────────────────────────────────────────────────

/** True when this object literal belongs to an exported declaration (export default/const/let/var). */
function isExportedObject(node: ts.ObjectLiteralExpression): boolean {
  // export default { ... }
  if (ts.isExportAssignment(node.parent) && node.parent.expression === node) return true;
  // export const schema = { ... }  /  export let x = { ... }  /  export var y = { ... }
  if (ts.isVariableDeclaration(node.parent) && node.parent.initializer === node) {
    const gparent = node.parent.parent;
    if (ts.isVariableDeclarationList(gparent) && gparent.declarations[0] === node.parent) {
      const ggparent = gparent.parent;
      if (ts.isVariableStatement(ggparent)) {
        return ggparent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      }
    }
  }
  return false;
}

/** Resolves directory imports to index.js, bare specifiers get .js */
function resolveDirImport(sourceFileName: string, specifier: string): string {
  const resolved = path.resolve(path.dirname(sourceFileName), specifier);
  try {
    if (statSync(resolved).isDirectory()) return `${specifier.replace(/\/$/, "")}/index.js`;
  } catch {
    /* path doesn't exist on disk (virtual resolve) — append .js */
  }
  return `${specifier}.js`;
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
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile) => {
    const sourceFileName = sourceFile.fileName;
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

    const visitor: ts.Visitor = (node) => {
      // ── Import/Export declarations ────────────────────────────────
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;

        // 1. Widget proxy removal
        if (
          ts.isImportDeclaration(node) &&
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.some((el) => el.name.text === "widgets") &&
          (specifier.includes("@src/stores/widget-store.svelte.ts") ||
            specifier.includes("@src/widgets/proxy") ||
            specifier.includes("widgets/proxy") ||
            /widgets/.test(specifier))
        ) {
          return [];
        }

        // 2. Alias resolution — rewrite then fall through to .js extension
        let rewriting = specifier;
        for (const [alias, target] of Object.entries(compileAliases)) {
          if (!rewriting.startsWith(alias)) continue;
          const sourceDir = path.dirname(path.resolve(sourceFileName));
          let relativePath = path
            .relative(sourceDir, path.resolve(process.cwd(), target))
            .replace(/\\/g, "/");
          if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
          rewriting = relativePath + rewriting.slice(alias.length);
          break; // only one alias matches
        }

        // 3. .js extension (safe) — after alias resolution so rewritten paths get .js too
        if (rewriting.startsWith(".") && !SKIP_JS_EXT.test(rewriting)) {
          rewriting = resolveDirImport(sourceFileName, rewriting);
        }

        if (rewriting !== specifier) {
          const ns = ts.factory.createStringLiteral(rewriting);
          return ts.isImportDeclaration(node)
            ? ts.factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                ns,
                node.assertClause,
              )
            : ts.factory.updateExportDeclaration(
                node,
                node.modifiers,
                node.isTypeOnly,
                node.exportClause,
                ns,
                node.assertClause,
              );
        }

        return ts.visitEachChild(node, visitor, context);
      }

      // ── Identifiers ──────────────────────────────────────────────
      if (ts.isIdentifier(node)) {
        // 4. `widgets` → `globalThis.widgets` (skip declarations & property names)
        if (node.text === "widgets" && !isDeclarationPosition(node)) {
          return ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("globalThis"),
            ts.factory.createIdentifier("widgets"),
          );
        }

        // 5. __filename / __dirname → ESM equivalents
        if (node.text === "__filename" || node.text === "__dirname") {
          needsUrlImports = true;
          const urlExpr = ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createMetaProperty(
                ts.SyntaxKind.ImportKeyword,
                ts.factory.createIdentifier("meta"),
              ),
              "url",
            ),
            undefined,
            [],
          );
          if (node.text === "__filename") {
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("fileURLToPath"),
              undefined,
              [urlExpr],
            );
          }
          return ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier("path"),
              "dirname",
            ),
            undefined,
            [urlExpr],
          );
        }
      }

      // ── Schema object literals (exported only) ───────────────────
      if (ts.isObjectLiteralExpression(node) && isExportedObject(node)) {
        const hasMarker = node.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            SCHEMA_MARKERS.has(p.name.text),
        );
        if (hasMarker) {
          let obj = node;
          const hp = (n: string) =>
            obj.properties.some(
              (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === n,
            );

          if (!hp("_id")) {
            const slugId = getStableId();
            obj = ts.factory.updateObjectLiteralExpression(obj, [
              ts.factory.createPropertyAssignment("_id", ts.factory.createStringLiteral(slugId)),
              ...obj.properties,
            ]);
          }
          if (tenantId !== undefined && !hp("tenantId")) {
            obj = ts.factory.updateObjectLiteralExpression(obj, [
              ts.factory.createPropertyAssignment(
                "tenantId",
                tenantId === null
                  ? ts.factory.createNull()
                  : ts.factory.createStringLiteral(tenantId),
              ),
              ...obj.properties,
            ]);
          }
          return obj;
        }
      }

      // ── Widget call UUID injection (deterministic) ───────────────
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const e = node.expression;
        if (
          ts.isPropertyAccessExpression(e.expression) &&
          ts.isIdentifier(e.expression.expression) &&
          e.expression.expression.text === "globalThis" &&
          ts.isIdentifier(e.expression.name) &&
          e.expression.name.text === "widgets" &&
          node.arguments.length > 0 &&
          ts.isObjectLiteralExpression(node.arguments[0])
        ) {
          const obj = node.arguments[0];
          if (
            !obj.properties.some(
              (p) =>
                ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "uuid",
            )
          ) {
            const updatedObj = ts.factory.updateObjectLiteralExpression(obj, [
              ts.factory.createPropertyAssignment(
                "uuid",
                ts.factory.createStringLiteral(getUuid()),
              ),
              ...obj.properties,
            ]);
            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              updatedObj,
              ...node.arguments.slice(1),
            ]);
          }
        }
      }

      return ts.visitEachChild(node, visitor, context);
    };

    let result = ts.visitNode(sourceFile, visitor) as ts.SourceFile;

    if (needsUrlImports) {
      const urlImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier("fileURLToPath"),
            ),
          ]),
        ),
        ts.factory.createStringLiteral("url"),
      );
      const pathImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(false, ts.factory.createIdentifier("path"), undefined),
        ts.factory.createStringLiteral("path"),
      );
      result = ts.factory.updateSourceFile(result, [urlImport, pathImport, ...result.statements]);
    }

    return result;
  };
}
