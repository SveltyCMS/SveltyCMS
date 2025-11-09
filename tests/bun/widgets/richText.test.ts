// tests/bun/widgets/richText.test.ts
// @ts-expect-error - Bun types are not available in TypeScript
import { expect, test, describe } from 'bun:test';
import { safeParse } from 'valibot';
import RichTextWidget from '../../../src/widgets/core/richText';
import type { FieldInstance } from '../../../src/content/types';

describe('RichText Widget Validation', () => {
	const requiredField: FieldInstance = {
		label: 'Test RichText',
		db_fieldName: 'test_rich_text',
		required: true,
		widget: RichTextWidget,
		options: {},
		translated: false,
		display: () => ''
	};

	const optionalField: FieldInstance = {
		label: 'Test RichText',
		db_fieldName: 'test_rich_text',
		required: false,
		widget: RichTextWidget,
		options: {},
		translated: false,
		display: () => ''
	};

	const schemaWithRequired = RichTextWidget.validationSchema(requiredField);
	const schemaOptional = RichTextWidget.validationSchema(optionalField);

	test('should fail validation if content is empty when required', () => {
		const data = { title: 'A title', content: '' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues[0].message).toBe('Content is required.');
		}
	});

	test('should fail validation if content only contains empty html tags when required', () => {
		const data = { title: 'A title', content: '<p>  </p><h1></h1>' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues[0].message).toBe('Content is required.');
		}
	});

	test('should pass validation if content has text when required', () => {
		const data = { title: 'A title', content: '<p>Some content</p>' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(true);
	});

	test('should fail validation if content contains only a script tag', () => {
		const data = { title: 'A title', content: '<script>alert("xss")</script>' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(false);
	});

	test('should fail validation with tricky script tag', () => {
		const data = { title: 'A title', content: '<script type="text/javascript">console.log("<p>hello</p>")</script>' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(false);
	});

	test('should fail validation with tricky script tag 2', () => {
		const data = { title: 'A title', content: '<SCRIPT SRC=http://xss.rocks/xss.js></SCRIPT>' };
		const result = safeParse(schemaWithRequired, data);
		expect(result.success).toBe(false);
	});

	test('should pass validation for optional field with empty content', () => {
		const data = { title: 'A title', content: '' };
		const result = safeParse(schemaOptional, data);
		expect(result.success).toBe(true);
	});

	test('should pass validation for optional field with no data', () => {
		const result = safeParse(schemaOptional, undefined);
		expect(result.success).toBe(true);
	});
});
