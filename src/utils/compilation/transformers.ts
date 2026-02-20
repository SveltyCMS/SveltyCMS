/**
 * @file src/utils/compilation/transformers.ts
 * @description TypeScript AST transformers for ensuring schema integrity and runtime compatibility.
 */

import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';

// Transformer factory for widget-related changes
export const widgetTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		// 1. Remove widget imports that shouldn't be in the final output
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const moduleSpecifier = node.moduleSpecifier.text;
			let removeImport = false;

			// Check named imports for 'widgets' alias
			if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
				const hasWidgetsAlias = node.importClause.namedBindings.elements.some((element) => element.name.text === 'widgets');
				if (
					hasWidgetsAlias &&
					(moduleSpecifier.includes('@src/stores/widget-store.svelte.ts') ||
						moduleSpecifier.includes('@src/widgets/proxy') ||
						moduleSpecifier.includes('widgets/proxy') ||
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
			node.text === 'widgets' &&
			(!ts.isPropertyAccessExpression(node.parent) ||
				(ts.isPropertyAccessExpression(node.parent) && node.parent.name !== node) ||
				(ts.isPropertyAccessExpression(node.parent) &&
					node.parent.expression.kind !== ts.SyntaxKind.ThisKeyword &&
					(!ts.isIdentifier(node.parent.expression) || node.parent.expression.text !== 'globalThis')))
		) {
			return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('globalThis'), ts.factory.createIdentifier('widgets'));
		}

		// 3. Inject UUID into widget calls
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const isWidgetCall =
				ts.isPropertyAccessExpression(node.expression.expression) &&
				ts.isIdentifier(node.expression.expression.expression) &&
				node.expression.expression.expression.text === 'globalThis' &&
				ts.isIdentifier(node.expression.expression.name) &&
				node.expression.expression.name.text === 'widgets';
			if (isWidgetCall && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
				const objectLiteral = node.arguments[0];
				const hasUuid = objectLiteral.properties.some(
					(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'uuid'
				);
				if (!hasUuid) {
					const uuidProperty = ts.factory.createPropertyAssignment('uuid', ts.factory.createStringLiteral(uuidv4()));
					const updatedProperties = [uuidProperty, ...objectLiteral.properties];
					const updatedObjectLiteral = ts.factory.updateObjectLiteralExpression(objectLiteral, updatedProperties);
					return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [updatedObjectLiteral, ...node.arguments.slice(1)]);
				}
			}
		}

		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
};

// Transformer factory specifically for adding .js extensions to relative imports/exports
export const addJsExtensionTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			const specifier = node.moduleSpecifier.text;
			if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
				const newSpecifier = ts.factory.createStringLiteral(`${specifier}.js`);
				if (ts.isImportDeclaration(node)) {
					return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, newSpecifier, node.assertClause);
				}
				return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, newSpecifier, node.assertClause);
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
};

// Transformer factory for converting CommonJS globals to ES module equivalents
export const commonjsToEsModuleTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	let needsFileURLToPath = false;
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		if (ts.isIdentifier(node) && node.text === '__filename') {
			needsFileURLToPath = true;
			return ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
				ts.factory.createPropertyAccessExpression(
					ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
					'url'
				)
			]);
		}

		if (ts.isIdentifier(node) && node.text === '__dirname') {
			needsFileURLToPath = true;
			return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('path'), 'dirname'), undefined, [
				ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
					ts.factory.createPropertyAccessExpression(
						ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
						'url'
					)
				])
			]);
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
				ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('fileURLToPath'))])
			),
			ts.factory.createStringLiteral('url')
		);
		const pathImport = ts.factory.createImportDeclaration(
			undefined,
			ts.factory.createImportClause(false, ts.factory.createIdentifier('path'), undefined),
			ts.factory.createStringLiteral('path')
		);
		transformedFile = ts.factory.updateSourceFile(transformedFile, [urlImport, pathImport, ...transformedFile.statements]);
	}
	return transformedFile;
};

export const schemaUuidTransformer =
	(uuid: string): ts.TransformerFactory<ts.SourceFile> =>
	(context) =>
	(sourceFile) => {
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			if (ts.isObjectLiteralExpression(node)) {
				const hasSchemaProperties = node.properties.some(
					(prop) =>
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						['fields', 'icon', 'status', 'revision', 'livePreview'].includes(prop.name.text)
				);
				if (hasSchemaProperties) {
					const hasIdProperty = node.properties.some(
						(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === '_id'
					);
					if (!hasIdProperty) {
						const idProperty = ts.factory.createPropertyAssignment('_id', ts.factory.createStringLiteral(uuid));
						return ts.factory.updateObjectLiteralExpression(node, [idProperty, ...node.properties]);
					}
				}
			}
			return ts.visitEachChild(node, visitor, context);
		};
		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};

/**
 * Transformer to inject tenantId into schema objects for multi-tenant support
 * @param tenantId - The tenant ID to inject (null/undefined = global resource)
 */
export const schemaTenantIdTransformer =
	(tenantId?: string | null): ts.TransformerFactory<ts.SourceFile> =>
	(context) =>
	(sourceFile) => {
		// Skip transformation if tenantId is not provided
		if (tenantId === undefined) {
			return sourceFile;
		}

		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			if (ts.isObjectLiteralExpression(node)) {
				const hasSchemaProperties = node.properties.some(
					(prop) =>
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						['fields', 'icon', 'status', 'revision', 'livePreview'].includes(prop.name.text)
				);
				if (hasSchemaProperties) {
					const hasTenantIdProperty = node.properties.some(
						(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'tenantId'
					);
					if (!hasTenantIdProperty) {
						// Create tenantId property with appropriate value
						const tenantIdProperty = ts.factory.createPropertyAssignment(
							'tenantId',
							tenantId === null
								? ts.factory.createNull() // Global resource
								: ts.factory.createStringLiteral(tenantId) // Tenant-specific
						);
						return ts.factory.updateObjectLiteralExpression(node, [tenantIdProperty, ...node.properties]);
					}
				}
			}
			return ts.visitEachChild(node, visitor, context);
		};
		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};
