/**
 * @file tests/unit/widgets/relation.test.ts
 * @description Unit tests for the Relation widget validation logic
 */

import { describe, expect, it } from 'bun:test';
import RelationWidget from '@src/widgets/core/Relation';
import { safeParse } from 'valibot';

describe('Relation Widget - Validation', () => {
	it('should validate a single ID when required', () => {
		const field = RelationWidget({
			label: 'Owner',
			collection: 'users',
			displayField: 'username',
			required: true
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, 'user-123').success).toBe(true);
		expect(safeParse(schema, '').success).toBe(false);
		expect(safeParse(schema, null).success).toBe(false);
	});

	it('should allow empty string if not required', () => {
		const field = RelationWidget({
			label: 'Owner',
			collection: 'users',
			displayField: 'username',
			required: false
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, '').success).toBe(true);
	});

	it('should validate multiple IDs when enabled', () => {
		const field = RelationWidget({
			label: 'Tags',
			collection: 'tags',
			displayField: 'name',
			multiple: true
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, ['tag-1', 'tag-2']).success).toBe(true);
		expect(safeParse(schema, []).success).toBe(true);
		expect(safeParse(schema, 'not-an-array').success).toBe(false);
	});

	it('should enforce min items when multiple is true', () => {
		const field = RelationWidget({
			label: 'Tags',
			collection: 'tags',
			displayField: 'name',
			multiple: true,
			min: 2
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, ['tag-1', 'tag-2']).success).toBe(true);
		expect(safeParse(schema, ['tag-1']).success).toBe(false);
	});

	it('should enforce max items when multiple is true', () => {
		const field = RelationWidget({
			label: 'Tags',
			collection: 'tags',
			displayField: 'name',
			multiple: true,
			max: 2
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, ['tag-1', 'tag-2']).success).toBe(true);
		expect(safeParse(schema, ['tag-1', 'tag-2', 'tag-3']).success).toBe(false);
	});

	it('should enforce required with multiple enabled', () => {
		const field = RelationWidget({
			label: 'Tags',
			collection: 'tags',
			displayField: 'name',
			multiple: true,
			required: true
		});
		const schema = (field.widget.validationSchema as any)(field);

		expect(safeParse(schema, ['tag-1']).success).toBe(true);
		expect(safeParse(schema, []).success).toBe(false);
	});
});
