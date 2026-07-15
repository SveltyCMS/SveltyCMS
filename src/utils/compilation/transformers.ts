/**
 * @file src/utils/compilation/transformers.ts
 * @description TypeScript AST transformers for ensuring schema integrity and runtime compatibility.
 *
 * Provides both individual transformers (for external use) and an optimized
 * composite transformer that merges all passes into a single AST traversal.
 */

import * as ts from "typescript";
import path from "node:path";
import { pathAliases } from "../../../path-aliases.ts";
import { generateUUID } from "../native-utils.ts";

const compileAliases: Record<string, string> = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, value.replace(/^\.\//, "")]),
);

// Hot-path: schema property markers for _id/tenantId injection
const SCHEMA_MARKERS = new Set([
  "fields",
  "icon",
  "title",
  "description",
  "status",
  "revision",
  "livePreview",
]);

// ─── Individual transformers (backward compatible) ────────────────────

export const widgetTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
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

      if (
        ts.isIdentifier(node) &&
        node.text === "widgets" &&
        (!ts.isPropertyAccessExpression(node.parent) ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name !== node) ||
          (ts.isPropertyAccessExpression(node.parent) &&
            node.parent.expression.kind !== ts.SyntaxKind.ThisKeyword &&
            (!ts.isIdentifier(node.parent.expression) ||
              node.parent.expression.text !== "globalThis")))
      ) {
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
              ts.factory.createStringLiteral(generateUUID()),
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
        if (
          specifier.startsWith(".") &&
          !specifier.endsWith(".js") &&
          !specifier.endsWith(".json")
        ) {
          const newSpecifier = ts.factory.createStringLiteral(`${specifier}.js`);
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
          [
            ts.factory.createPropertyAccessExpression(
              ts.factory.createMetaProperty(
                ts.SyntaxKind.ImportKeyword,
                ts.factory.createIdentifier("meta"),
              ),
              "url",
            ),
          ],
        );
      }

      if (ts.isIdentifier(node) && node.text === "__dirname") {
        needsFileURLToPath = true;
        return ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("path"), "dirname"),
          undefined,
          [
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("fileURLToPath"),
              undefined,
              [
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createMetaProperty(
                    ts.SyntaxKind.ImportKeyword,
                    ts.factory.createIdentifier("meta"),
                  ),
                  "url",
                ),
              ],
            ),
          ],
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
 * Handles _id injection and tenantId mapping.
 */
export const schemaTransformer =
  (tenantId?: string | null): ts.TransformerFactory<ts.SourceFile> =>
  (context) =>
  (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isObjectLiteralExpression(node)) {
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

// ─── Optimized composite transformer (single AST pass) ───────────────

/**
 * Merges all 5 transformers into ONE traversal for ~5x faster compilation.
 * Each sub-transformer is inlined into a single visitor switch.
 */
export function createCompositeTransformer(
  tenantId?: string | null,
  stableId?: string,
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile) => {
    const sourceFileName = sourceFile.fileName;
    let needsUrlImports = false;

    const getStableId = (): string => {
      if (stableId) return stableId;
      const baseName = sourceFileName.split(/[\\/]/).pop() || "unknown";
      return baseName
        .replace(/\.(ts|js|svelte)$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    };

    const visitor: ts.Visitor = (node) => {
      // ── Import/Export declarations ──────────────────────────────
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;

        // Widget proxy removal
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

        // Alias resolution
        for (const [alias, target] of Object.entries(compileAliases)) {
          if (!specifier.startsWith(alias)) continue;
          const sourceDir = path.dirname(path.resolve(sourceFileName));
          let relativePath = path
            .relative(sourceDir, path.resolve(process.cwd(), target))
            .replace(/\\/g, "/");
          if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
          const resolved = relativePath + specifier.slice(alias.length);
          const ns = ts.factory.createStringLiteral(resolved);
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

        // .js extension
        if (
          specifier.startsWith(".") &&
          !specifier.endsWith(".js") &&
          !specifier.endsWith(".json")
        ) {
          const ns = ts.factory.createStringLiteral(`${specifier}.js`);
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

      // ── Identifiers ─────────────────────────────────────────────
      if (ts.isIdentifier(node)) {
        // `widgets` → `globalThis.widgets`
        if (
          node.text === "widgets" &&
          (!ts.isPropertyAccessExpression(node.parent) ||
            (ts.isPropertyAccessExpression(node.parent) &&
              node.parent.name === node &&
              (!ts.isIdentifier(node.parent.expression) ||
                node.parent.expression.text !== "globalThis")))
        ) {
          return ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("globalThis"),
            ts.factory.createIdentifier("widgets"),
          );
        }

        // __filename / __dirname → ESM equivalents
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

      // ── Schema object literals ───────────────────────────────────
      if (ts.isObjectLiteralExpression(node)) {
        const hasMarker = node.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            SCHEMA_MARKERS.has(p.name.text),
        );
        if (!hasMarker) return ts.visitEachChild(node, visitor, context);

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

      // ── Widget calls (UUID injection) ─────────────────────────
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
                ts.factory.createStringLiteral(generateUUID()),
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
