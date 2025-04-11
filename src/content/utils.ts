/**
 * @file src/content/utils.ts
 * @description Utility function to safely process content modules using TypeScript AST parsing.
 */

import * as ts from 'typescript';
import type { Schema } from './types';
import { ensureWidgetsInitialized } from '@src/widgets';

// System Logger
import { logger } from '../utils/logger.svelte';

// Helper function to safely evaluate the schema object string
async function evaluateSchemaObject(schemaString: string): Promise<Record<string, unknown> | null> {
	try {
		// Wrap in an async function to handle potential awaits inside the schema definition (e.g., widget calls)
		const func = new Function(`return (async () => { return ${schemaString}; })();`);
		return await func();
	} catch (error) {
		logger.error('Failed to evaluate schema object string:', { error: error instanceof Error ? error.message : String(error), schemaString });
		return null;
	}
}

async function processModule(content: string): Promise<{ schema?: Schema } | null> {
	try {
		// Ensure widgets are initialized before processing module
		await ensureWidgetsInitialized();

		const sourceFile = ts.createSourceFile(
			'module.js', // Temporary filename, doesn't affect parsing
			content,
			ts.ScriptTarget.ESNext,
			true // setParentNodes
		);

		let schemaObjectString: string | null = null;
		let uuid: string | null = null;

		// 1. Extract UUID from leading comments
		const firstStatement = sourceFile.statements[0];
		if (firstStatement) {
			const comments = ts.getLeadingCommentRanges(content, firstStatement.pos);
			if (comments) {
				for (const comment of comments) {
					const commentText = content.substring(comment.pos, comment.end);
					const uuidMatch = commentText.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
					if (uuidMatch) {
						uuid = uuidMatch[1];
						break; // Found UUID, stop searching comments
					}
				}
			}
		}
		// Fallback: Check full text if not found in leading comments (less efficient)
		if (!uuid) {
			const uuidMatchGlobal = content.match(/^\/\/\s*UUID:\s*([a-f0-9-]{36})/im);
			if (uuidMatchGlobal) {
				uuid = uuidMatchGlobal[1];
			}
		}

		// 2. Find the exported schema object
		ts.forEachChild(sourceFile, (node) => {
			if (schemaObjectString) return; // Stop searching once found

			// Check for `export default { ... }`
			if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
				schemaObjectString = node.expression.getText(sourceFile);
			}
			// Check for `export const schema = { ... }` or `const schema = { ... }; export { schema };` etc.
			else if (ts.isVariableStatement(node)) {
				for (const declaration of node.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
						// Check if this variable is exported
						let isExported = false;
						if (node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) {
							isExported = true;
						} else {
							// Check for separate `export { schema }`
							ts.forEachChild(sourceFile, (exportNode) => {
								if (ts.isExportDeclaration(exportNode) && exportNode.exportClause && ts.isNamedExports(exportNode.exportClause)) {
									if (exportNode.exportClause.elements.some((el) => el.name.text === declaration.name.text)) {
										isExported = true;
									}
								}
							});
						}

						if (isExported) {
							schemaObjectString = declaration.initializer.getText(sourceFile);
							break; // Found schema variable
						}
					}
				}
			}
		});

		if (!schemaObjectString) {
			logger.warn('Could not find exported schema object literal in the module content.');
			return null;
		}

		if (!uuid) {
			logger.warn('Could not find // UUID: comment in the module content.');
			return null;
		}

		// 3. Evaluate the extracted schema object string
		const evaluatedSchema = await evaluateSchemaObject(schemaObjectString);

		if (!evaluatedSchema) {
			logger.error('Failed to evaluate the extracted schema object.');
			return null;
		}

		// 4. Combine evaluated schema with UUID
		// Ensure _id is present and is the extracted UUID
		const finalSchema: Schema = {
			...evaluatedSchema,
			_id: uuid
		};

		// Basic validation (optional but recommended)
		if (!finalSchema.fields || !Array.isArray(finalSchema.fields)) {
			logger.warn('Evaluated schema is missing or has invalid "fields" property.', { uuid });
			// Handle invalid schema structure, maybe return null or throw
			return null;
		}

		logger.debug(`Successfully processed module with UUID: ${uuid}`);
		return { schema: finalSchema };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to process module using AST:', { error: errorMessage });
		return null;
	}
}

export { processModule };
