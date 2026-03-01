/**
 * @file tests/unit/widgets/address.test.ts
 * @description Unit tests for the Address widget validation logic
 */

import { describe, expect, it } from 'bun:test';
import AddressWidget from '@widgets/custom/address';
import { safeParse } from 'valibot';

describe('Address Widget - Validation', () => {
	const validAddress = {
		street: 'Main St',
		houseNumber: '123',
		postalCode: '12345',
		city: 'Anytown',
		country: 'DE',
		latitude: 51.34,
		longitude: 6.57
	};

	it('should validate a correct address object', () => {
		const field = AddressWidget({ label: 'Home' });
		const schema = field.widget.validationSchema as any;
		const result = safeParse(schema, validAddress);
		expect(result.success).toBe(true);
	});

	it('should reject missing required fields', () => {
		const field = AddressWidget({ label: 'Home' });
		const schema = field.widget.validationSchema as any;

		const invalidAddress = { ...validAddress, street: '' };
		expect(safeParse(schema, invalidAddress).success).toBe(false);

		const missingCity = { ...validAddress };
		(missingCity as any).city = undefined;
		expect(safeParse(schema, missingCity).success).toBe(false);
	});

	it('should reject invalid types', () => {
		const field = AddressWidget({ label: 'Home' });
		const schema = field.widget.validationSchema as any;

		const invalidLat = { ...validAddress, latitude: 'not-a-number' };
		expect(safeParse(schema, invalidLat).success).toBe(false);
	});

	it('should validate 2-letter country code min length', () => {
		const field = AddressWidget({ label: 'Home' });
		const schema = field.widget.validationSchema as any;

		const shortCountry = { ...validAddress, country: 'D' };
		expect(safeParse(schema, shortCountry).success).toBe(false);
	});
});
