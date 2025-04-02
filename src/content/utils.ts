/**
 * @file src/content/utils.ts
 * @description Utility function to safely process content modules using TypeScript AST parsing.
 */

import * as ts from 'typescript';
import { logger } from '../utils/logger.svelte';
import type { Schema } from './types';
import type { WidgetPlaceholder, ParsedSchemaObject, ParsedSchemaValue } from './types';

async function processModule(
	content: string,
	options: {
		filename?: string;
	} = {}
): Promise<{ schema?: Schema } | null> {
	const { filename = 'schema.ts' } = options;

	logger.debug('Starting AST Prossessing...');

	try {
		// Extract UUID from file content
		const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
		const uuid = uuidMatch ? uuidMatch[1] : null;

		// Create an AST Source File
		const sourceFile = ts.createSourceFile(
			filename,
			content,
			ts.ScriptTarget.Latest,
			true, // Set parent pointers
			ts.ScriptKind.TS
		);

		let extractedSchemaObject: ParsedSchemaObject | null = null;

		// Traverse the AST
		ts.forEachChild(sourceFile, (node) => {
			// Prevent multiple extractions
			if (extractedSchemaObject) return;

			// Look for top-level export const schema = { ... }
			if (ts.isVariableStatement(node)) {
				const isExported = node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);

				if (isExported) {
					node.declarationList.declarations.forEach((declaration) => {
						if (
							ts.isIdentifier(declaration.name) &&
							declaration.name.escapedText === 'schema' &&
							declaration.initializer &&
							ts.isObjectLiteralExpression(declaration.initializer)
						) {
							try {
								// Pass the sourceFile to helpers
								extractedSchemaObject = parseObjectLiteral(declaration.initializer as ts.ObjectLiteralExpression, sourceFile);
								logger.debug('Successfully AST extracted schema object.');
							} catch (parseError) {
								logger.error('AST Schema extraction error:', {
									error: parseError instanceof Error ? parseError.message : String(parseError),
									nodeText: declaration.initializer.getText(sourceFile)
								});
							}
						}
					});
				}
			}
		});

		// Handle schema extraction
		if (extractedSchemaObject) {
			const finalSchema = {
				...extractedSchemaObject,
				_id: uuid
			} as Schema;

			logger.debug('AST Schema extraction completed.');
			return { schema: finalSchema };
		} else {
			logger.warn('AST Schema extraction failed.');
			return null;
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('AST processing error:', {
			error: errorMessage,
			filename
		});
		return null;
	}
}

// Helper function to recursively parse the AST Object Literal
function parseObjectLiteral(
	objNode: ts.ObjectLiteralExpression,
	sourceFile: ts.SourceFile // Pass sourceFile for getText
): ParsedSchemaObject {
	const result: ParsedSchemaObject = {};

	objNode.properties.forEach((prop) => {
		try {
			// Handle standard property assignments
			if (ts.isPropertyAssignment(prop)) {
				const propName = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;

				if (propName) {
					// Pass sourceFile down
					const value = parseNodeValue(prop.initializer, sourceFile);
					// Only add property if value parsing was successful (not undefined)
					if (value !== undefined) {
						result[propName] = value as ParsedSchemaValue;
					} else {
						// Log that the property value was ignored (e.g., because it was a function)
						logger.debug(`Undefined value for property '${propName}' ignored.`);
					}
				}
			}
			// Handle shorthand property assignments
			else if (ts.isShorthandPropertyAssignment(prop)) {
				logger.warn(`Cannot safely evaluate shorthand property assignment '${prop.name.text}' as it resolves to a variable. Ignoring.`);
				// Shorthand properties resolve to variables, which we can't safely evaluate. Ignore them.
			}
		} catch (error) {
			logger.error('Error parsing property:', {
				propertyName: prop.name?.getText(sourceFile),
				error: error instanceof Error ? error.message : String(error)
			});
		}
	});

	return result;
}

// Helper function to parse different kinds of values within the object
function parseNodeValue(node: ts.Expression, sourceFile: ts.SourceFile): unknown {
	// Basic literal type parsing
	if (ts.isStringLiteral(node)) return node.text;
	if (ts.isNumericLiteral(node)) return parseFloat(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;

	// Array literal parsing
	if (ts.isArrayLiteralExpression(node)) {
		return (
			node.elements
				// Pass sourceFile down recursively
				.map((element) => parseNodeValue(element, sourceFile))
				.filter((v) => v !== undefined)
		); // Filter out ignored values (like functions)
	}

	// Nested object literal parsing
	if (ts.isObjectLiteralExpression(node)) {
		// Pass sourceFile down recursively
		return parseObjectLiteral(node, sourceFile);
	}

	// Handle template expressions (using sourceFile)
	if (ts.isTemplateExpression(node)) {
		return node.getText(sourceFile);
	}

	// Handle type assertions and parenthesized expressions
	if (ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node)) {
		// Pass sourceFile down recursively
		return parseNodeValue(node.expression, sourceFile);
	}

	// --- UPDATED: Handle Function Types (Ignore for Safety) ---
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
		// Functions are code, not static data. Ignoring for safety.
		// Recommend removing functions from static schema definitions.
		logger.warn(`Ignoring function node for safety: ${ts.SyntaxKind[node.kind]} (${node.getText(sourceFile).substring(0, 80)}...)`);
		return undefined; // Treat as unhandled/unsafe, effectively removing it
	}
	// Note: FunctionDeclarations are statements, not expressions, less likely directly inside an object literal value

	// Robust widget function call parsing
	if (ts.isCallExpression(node)) {
		// Carefully check for globalThis.widgets.WidgetName pattern
		if (
			ts.isPropertyAccessExpression(node.expression) && // Check for 'globalThis.widgets.SomeName'
			ts.isPropertyAccessExpression(node.expression.expression) && // Check for 'globalThis.widgets'
			ts.isIdentifier(node.expression.expression.expression) &&
			node.expression.expression.expression.escapedText === 'globalThis' &&
			ts.isIdentifier(node.expression.expression.name) &&
			node.expression.expression.name.escapedText === 'widgets' &&
			ts.isIdentifier(node.expression.name)
		) {
			const widgetName = node.expression.name.escapedText.toString();
			let widgetConfig: Record<string, unknown> = {};

			// Parse widget configuration if present
			if (node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
				try {
					// Pass sourceFile down
					widgetConfig = parseObjectLiteral(node.arguments[0] as ts.ObjectLiteralExpression, sourceFile);
				} catch (configError) {
					logger.error(`[parseNodeValue] Error parsing config for widget '${widgetName}':`, configError);
				}
			}
			const placeholder: WidgetPlaceholder = {
				widgetName: widgetName,
				widgetConfig: widgetConfig
			};
			return placeholder;
		}
	}

	// Fallback for unhandled types
	logger.warn(`[parseNodeValue] Unhandled node kind: ${ts.SyntaxKind[node.kind]} (${node.getText(sourceFile)})`);
	return undefined;
}

export { processModule };
