/**
 * @file tests/unit/utils/transformers.test.ts
 * @description Unit tests for TypeScript AST transformers used in compilation
 *
 * Tests:
 * - Schema UUID injection
 * - Schema tenant ID injection
 * - Import path transformation
 * - Composite transformer: widget rewrite + UUID injection under exported schemas
 */

import {
  addJsExtensionTransformer,
  schemaTransformer,
  createCompositeTransformer,
} from "@src/utils/compilation/transformers";
import * as ts from "typescript";

function transform(code: string, transformers: ts.TransformerFactory<ts.SourceFile>[]) {
  const sourceFile = ts.createSourceFile("test.ts", code, ts.ScriptTarget.ESNext, true);
  const result = ts.transform(sourceFile, transformers);
  const printer = ts.createPrinter();
  return printer.printFile(result.transformed[0]);
}

/** Mirrors the production compile path (compile.ts): transpileModule + composite. */
function transpileComposite(code: string, tenantId?: string | null) {
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
    transformers: { before: [createCompositeTransformer(tenantId)] },
    fileName: "posts.ts",
  }).outputText;
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

  describe("composite transformer (production path)", () => {
    const WIDGET_SCHEMA = `import { widgets } from '@widgets/widget-manager.svelte';
import type { Schema } from '@src/content/types';

export const schema: Schema = {
  icon: 'mdi:post',
  status: 'published',
  slug: 'posts',
  fields: [
    widgets.text({ db_fieldName: 'title', label: 'Title', required: true }),
    widgets.textarea({ db_fieldName: 'body', label: 'Body' }),
  ],
};`;

    it("rewrites widgets identifiers under an exported schema (v6 descend fix)", () => {
      const output = transpileComposite(WIDGET_SCHEMA);

      // Pass 4 (identifier rewrite) must reach widget calls nested in fields.
      expect(output).toContain("globalThis.widgets.text({");
      expect(output).toContain("globalThis.widgets.textarea({");
      // Widget proxy import is still removed.
      expect(output).not.toContain("widget-manager");
      // Schema injection still applies.
      expect(output).toContain('_id: "posts"');
    });

    it("injects a deterministic uuid into every widget call argument (v6)", () => {
      const output = transpileComposite(WIDGET_SCHEMA);

      const uuidMatches = output.match(/uuid: "([0-9a-f-]{36})"/g) || [];
      expect(uuidMatches).toHaveLength(2);
      // Deterministic: same source + filename → identical output across runs.
      expect(transpileComposite(WIDGET_SCHEMA)).toBe(output);
      // uuid precedes the original options (call arg ordering preserved).
      expect(output.indexOf("uuid:")).toBeLessThan(output.indexOf("db_fieldName"));
    });

    it("processes nested widget calls (group/repeater shape) recursively", () => {
      const output = transpileComposite(`import { widgets } from '@widgets/widget-manager.svelte';
export const schema = {
  fields: [
    widgets.group({
      db_fieldName: 'seo',
      label: 'SEO',
      fields: [
        widgets.text({ db_fieldName: 'metaTitle', label: 'Meta title' }),
        widgets.textarea({ db_fieldName: 'metaDescription', label: 'Meta description' }),
      ],
    }),
  ],
};`);

      const uuidMatches = output.match(/uuid: "([0-9a-f-]{36})"/g) || [];
      expect(uuidMatches).toHaveLength(3);
      expect(output.match(/globalThis\.widgets\./g) || []).toHaveLength(3);
    });

    it("handles pre-written globalThis.widgets calls without double uuid", () => {
      const output = transpileComposite(`export const schema = {
  fields: [
    globalThis.widgets.text({ db_fieldName: 'title', label: 'Title' }),
  ],
};`);

      const uuidMatches = output.match(/uuid: "([0-9a-f-]{36})"/g) || [];
      expect(uuidMatches).toHaveLength(1);
      expect(output).toContain("globalThis.widgets.text({");
    });

    it("leaves non-widget code untouched under schema (no stray rewrites)", () => {
      const output = transpileComposite(`import { slugify } from './helpers';
export const schema = {
  icon: 'mdi:file',
  fields: [],
  beforeSave: async (doc: { data: { slug?: string } }) => {
    doc.data.slug = slugify(doc.data.slug || '');
    return doc;
  },
};`);

      expect(output).toContain("icon: 'mdi:file'");
      expect(output).toContain("slugify");
      expect(output).not.toContain("globalThis.");
      expect(output).not.toContain("uuid:");
    });
  });
});
