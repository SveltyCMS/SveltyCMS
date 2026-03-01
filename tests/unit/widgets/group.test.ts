/**
 * @file tests/unit/widgets/group.test.ts
 * @description Unit tests for the Group widget
 */

import { describe, expect, it } from 'bun:test';
import GroupWidget from '../../../src/widgets/core/group';
import { safeParse } from 'valibot';

describe('Group Widget - Creation', () => {
	it('should initialize with default values', () => {
		const field = GroupWidget({ label: 'Basic Group' });

		expect(field.collapsible).toBe(false);
		expect(field.collapsed).toBe(false);
		expect(field.variant).toBe('default');
	});

	it('should allow custom configuration', () => {
		const field = GroupWidget({
			label: 'Custom Group',
			collapsible: true,
			collapsed: true,
			variant: 'card'
		});

		expect(field.collapsible).toBe(true);
		expect(field.collapsed).toBe(true);
		expect(field.variant).toBe('card');
	});

	it('should support nested fields definition', () => {
		const subFields = [
			{ label: 'Sub 1', type: 'text' },
			{ label: 'Sub 2', type: 'text' }
		] as any[];

		const field = GroupWidget({
			label: 'Parent Group',
			fields: subFields as import('@src/content/types').FieldInstance[]
		});

		expect(field.fields).toEqual(subFields as any);
	});

	it('should validate as an empty object by default', () => {
		const field = GroupWidget({ label: 'Test' });
		const schema = field.widget.validationSchema as any;

		expect(safeParse(schema, {}).success).toBe(true);
		expect(safeParse(schema, { any: 'data' }).success).toBe(true);
	});
});
