/**
 * @file tests/unit/utils/transformers.test.ts
 * @description Unit tests for TypeScript AST transformers used in compilation
 */

import { describe, expect, it } from 'bun:test';
import { addJsExtensionTransformer, schemaTenantIdTransformer, schemaUuidTransformer } from '../../../src/utils/compilation/transformers';
import * as ts from 'typescript';

function transform(code: string, transformers: ts.TransformerFactory<ts.SourceFile>[]) {
	const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.ESNext, true);
	const result = ts.transform(sourceFile, transformers);
	const printer = ts.createPrinter();
	return printer.printFile(result.transformed[0]);
}

describe('AST Transformers', () => {
	describe('schemaUuidTransformer', () => {
		it('should inject _id into schema objects', () => {
			const code = 'export const schema = { fields: [] };';
			const uuid = 'test-uuid-123';
			const output = transform(code, [schemaUuidTransformer(uuid)]);

			expect(output).toContain('_id: "test-uuid-123"');
			expect(output).toContain('fields: []');
		});

		it('should not override existing _id', () => {
			const code = 'export const schema = { _id: "existing", fields: [] };';
			const output = transform(code, [schemaUuidTransformer('new-uuid')]);

			expect(output).toContain('_id: "existing"');
			expect(output).not.toContain('new-uuid');
		});
	});

	describe('schemaTenantIdTransformer', () => {
		it('should inject tenantId into schema objects', () => {
			const code = 'export const schema = { fields: [] };';
			const output = transform(code, [schemaTenantIdTransformer('tenant-1')]);

			expect(output).toContain('tenantId: "tenant-1"');
		});

		it('should inject null for global tenantId', () => {
			const code = 'export const schema = { fields: [] };';
			const output = transform(code, [schemaTenantIdTransformer(null)]);

			expect(output).toContain('tenantId: null');
		});
	});

	describe('addJsExtensionTransformer', () => {
		it('should add .js extension to relative imports', () => {
			const code = 'import { something } from "./module";';
			const output = transform(code, [addJsExtensionTransformer]);

			expect(output).toContain('"./module.js"');
		});

		it('should not add extension to non-relative imports', () => {
			const code = 'import { something } from "@api/module";';
			const output = transform(code, [addJsExtensionTransformer]);

			expect(output).toContain('"@api/module"');
		});
	});
});
