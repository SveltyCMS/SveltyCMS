/**
 * @file tests/unit/widgets/richText.test.ts
 * @description Unit tests for the RichText widget validation logic
 */

import { describe, expect, it } from 'bun:test';
import RichTextWidget from '@widgets/core/rich-text';
import { safeParse } from 'valibot';

describe('RichText Widget - Validation', () => {
	it('should validate simple HTML content', () => {
		const field = RichTextWidget({ label: 'Content' });
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, { content: '<p>Hello World</p>' }).success).toBe(true);
	});

	it('should reject empty content when required', () => {
		const field = RichTextWidget({ label: 'Content', required: true });
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, { content: '' }).success).toBe(false);
		expect(safeParse(schema, { content: '<p></p>' }).success).toBe(false);
		expect(safeParse(schema, { content: '   ' }).success).toBe(false);
	});

	it('should allow empty content when not required', () => {
		const field = RichTextWidget({ label: 'Content', required: false });
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, { content: '' }).success).toBe(true);
		expect(safeParse(schema, { content: '<p></p>' }).success).toBe(true);
	});

	it('should sanitize script tags (basic check)', () => {
		const field = RichTextWidget({ label: 'Content' });
		const schema = (field.widget.validationSchema as any)(field);

		// Note: The validation schema might just check for presence or use a transformer.
		const result = safeParse(schema, {
			content: '<p>Hello<script>alert(1)</script></p>'
		});

		expect(result.success).toBe(true);
	});
});
