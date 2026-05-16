/**
 * @file tests/unit/utils/transformers.test.ts
 * @description Unit tests for TypeScript AST transformers used in compilation
 *
 * Tests:
 * - Schema UUID injection
 * - Schema tenant ID injection
 * - Import path transformation
 */

import { addJsExtensionTransformer, schemaTransformer } from "@src/utils/compilation/transformers";
import * as ts from "typescript";

function transform(code: string, transformers: ts.TransformerFactory<ts.SourceFile>[]) {
  const sourceFile = ts.createSourceFile("test.ts", code, ts.ScriptTarget.ESNext, true);
  const result = ts.transform(sourceFile, transformers);
  const printer = ts.createPrinter();
  return printer.printFile(result.transformed[0]);
}

describe("AST Transformers", () => {
  describe("schemaTransformer", () => {
    it("should inject _id and tenantId into schema objects", () => {
      const code = "export const schema = { fields: [] };";
      const output = transform(code, [schemaTransformer("tenant-1")]);

      // Verify deterministic ID generation (from "test.ts")
      expect(output).toContain('_id: "test"');
      expect(output).toContain('tenantId: "tenant-1"');
      expect(output).toContain("fields: []");
    });

    it("should not override existing _id", () => {
      const code = 'export const schema = { _id: "existing", fields: [] };';
      const output = transform(code, [schemaTransformer("tenant-1")]);

      expect(output).toContain('_id: "existing"');
      expect(output).toContain('tenantId: "tenant-1"');
    });

    it("should inject null for global tenantId", () => {
      const code = "export const schema = { fields: [] };";
      const output = transform(code, [schemaTransformer(null)]);

      expect(output).toContain("tenantId: null");
    });

    it("should skip tenantId if not provided", () => {
      const code = "export const schema = { fields: [] };";
      const output = transform(code, [schemaTransformer(undefined)]);

      expect(output).not.toContain("tenantId");
      expect(output).toMatch(/_id: "test"/i);
    });
  });

  describe("addJsExtensionTransformer", () => {
    it("should add .js extension to relative imports", () => {
      const code = 'import { something } from "./module";';
      const output = transform(code, [addJsExtensionTransformer]);

      expect(output).toContain('"./module.js"');
    });

    it("should not add extension to non-relative imports", () => {
      const code = 'import { something } from "@api/module";';
      const output = transform(code, [addJsExtensionTransformer]);

      expect(output).toContain('"@api/module"');
    });
  });
});
