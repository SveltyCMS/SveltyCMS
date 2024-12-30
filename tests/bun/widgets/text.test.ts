// tests/widgets/text.test.ts
// @ts-expect-error - Bun types are not available in TypeScript
import { expect, test, describe, beforeEach, mock } from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Text from '@src/widgets/text/Text.svelte';
import widget from '@src/widgets/text';
import { contentLanguage, validationStore } from '@stores/store';
import { mode, collectionValue } from '@stores/collectionStore.svelte';

// Mock config
const publicEnv = {
	DEFAULT_CONTENT_LANGUAGE: 'EN',
	AVAILABLE_CONTENT_LANGUAGES: ['EN', 'DE', 'FR'],
	LOG_LEVELS: ['info', 'warn', 'error']
};

// Mock modules
mock('@root/config/public', () => publicEnv);
mock('@src/paraglide/messages', () => ({
	widgets_nodata: () => 'No data',
	widget_text_description: () => 'Text widget description'
}));

describe('Text Widget', () => {
	beforeEach(() => {
		cleanup();
		// Reset stores
		mode.set('create');
		contentLanguage.set(publicEnv.DEFAULT_CONTENT_LANGUAGE);
		collectionValue.set({});
		validationStore.clearError('test_field');
	});

	test('should create widget with default parameters', () => {
		const params = {
			label: 'Test Field',
			db_fieldName: 'test_field'
		};

		const result = widget(params);

		expect(result.widget.Name).toBe('Text');
		expect(result.label).toBe('Test Field');
		expect(result.db_fieldName).toBe('test_field');
		expect(result.display.default).toBe(true);
	});

	test('should handle validation errors', async () => {
		const field = widget({
			label: 'Test Field',
			db_fieldName: 'test_field',
			minlength: 3
		});

		const { getByTestId, findByRole } = render(Text, { field });

		const input = getByTestId('text-input');
		await fireEvent.input(input, { target: { value: 'ab' } });
		await fireEvent.blur(input);

		const errorMessage = await findByRole('alert');
		expect(errorMessage).toBeDefined();
		expect(input.getAttribute('aria-invalid')).toBe('true');
	});

	test('should handle multilingual data', async () => {
		const field = widget({
			label: 'Test Field',
			db_fieldName: 'test_field',
			translated: true
		});

		const { getByTestId } = render(Text, { field });
		const input = getByTestId('text-input');

		// Test multiple languages
		for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
			contentLanguage.set(lang);
			await fireEvent.input(input, { target: { value: `test-${lang}` } });
		}

		const data = get(collectionValue);
		expect(Object.keys(data.test_field).length).toBe(publicEnv.AVAILABLE_CONTENT_LANGUAGES.length);
	});

	test('should update character count', async () => {
		const field = widget({
			label: 'Test Field',
			db_fieldName: 'test_field',
			maxlength: 10
		});

		const { getByTestId, getByRole } = render(Text, { field });

		const input = getByTestId('text-input');
		await fireEvent.input(input, { target: { value: 'test' } });

		const status = getByRole('status');
		expect(status).toBeDefined();
		expect(status.textContent).toContain('4/10');
	});

	test('should handle store cleanup', async () => {
		const field = widget({
			label: 'Test Field',
			db_fieldName: 'test_field'
		});

		const { unmount } = render(Text, { field });
		await unmount();

		const validationErrors = get(validationStore);
		expect(validationErrors instanceof Map && validationErrors.size).toBe(0);
	});
});
