/**
 * @file src/utils/compilation/transformers.ts
 * @description TypeScript AST transformers for ensuring schema integrity and runtime compatibility.
 */

import * as ts from "typescript";
import path from "node:path";
import { generateUUID } from "../native-utils.ts";

// Transformer factory for widget-related changes
export const widgetTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      // 1. Remove widget imports that shouldn't be in the final output
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleSpecifier = node.moduleSpecifier.text;
        let removeImport = false;

        // Check named imports for 'widgets' alias
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
            removeImport = true;
          }
        }

        if (removeImport) {
          return [];
        }
      }

      // 2. Replace standalone `widgets` identifier with `globalThis.widgets`
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

      // 3. Inject UUID into widget calls
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

// Transformer factory specifically for adding .js extensions to relative imports/exports
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

// Transformer factory for converting CommonJS globals to ES module equivalents
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
// Transformer factory for resolving aliases to relative paths
export const aliasResolverTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context) => (sourceFile) => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        const aliases: Record<string, string> = {
          "@src": "src",
          "@utils": "src/utils",
          "@stores": "src/stores",
          "@widgets": "src/widgets",
          "@databases": "src/databases",
          "@components": "src/components",
          "@config": "config",
        };

        for (const [alias, target] of Object.entries(aliases)) {
          if (specifier.startsWith(alias)) {
            const cwd = process.cwd();
            // Source file is in config/collections/... or similar
            // We need to resolve relative to the source file's directory
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
        // Robust detection: check for specific schema property markers
        const hasSchemaMarkers = node.properties.some(
          (prop) =>
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            [
              "fields",
              "icon",
              "title",
              "description",
              "status",
              "revision",
              "livePreview",
            ].includes(prop.name.text),
        );

        if (hasSchemaMarkers) {
          let updated = node;

          // 1. Ensure _id exists (Unique identity for this collection)
          if (!hasProperty(updated, "_id")) {
            // 🚀 DETERMINISTIC ID: Use the filename (slugified) instead of a random UUID
            // This ensures stable table names across compilations.
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

          // 2. Inject tenantId (Security isolation)
          // Skip if tenantId is undefined (global builder mode)
          if (tenantId !== undefined && !hasProperty(updated, "tenantId")) {
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

/** Helper to check if an object literal has a specific property */
function hasProperty(obj: ts.ObjectLiteralExpression, name: string): boolean {
  return obj.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === name,
  );
}
