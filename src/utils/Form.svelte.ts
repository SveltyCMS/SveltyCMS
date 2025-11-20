/**
 * @file: src/utils/Form.svelte.ts
 * @description: Form class for handling form data and validation
 *
 * @requires @sveltejs/kit - For action and submit function types
 * @requires valibot - For schema definition and validation
 */

import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { safeParse, type BaseSchema, flatten } from 'valibot';

type EnhanceOptions = {
	onSubmit?: (input: Parameters<SubmitFunction>[0]) => void;
	onResult?: (input: { result: ActionResult; update: (opts?: { reset: boolean }) => Promise<void> }) => void | Promise<void>;
};

export class Form<T extends Record<string, any>> {
	data = $state<T>({} as T);
	errors = $state<Record<string, string[]>>({});
	submitting = $state(false);
	message = $state<string | undefined>(undefined);

	constructor(initialData: T, private schema?: BaseSchema<any, any, any>) {
		this.data = { ...initialData };
	}

	// Helper to reset form
	reset(newData?: T) {
		if (newData) {
			this.data = { ...newData };
		}
		this.errors = {};
		this.message = undefined;
		this.submitting = false;
	}

	// Validate form data against schema
	validate(): boolean {
		this.errors = {};
		this.message = undefined;

		if (this.schema) {
			const result = safeParse(this.schema, this.data);
			if (!result.success) {
				const flatErrors = flatten(result.issues).nested;
				this.errors = flatErrors as Record<string, string[]>;
				return false;
			}
		}
		return true;
	}

	// Enhance action for SvelteKit forms
	enhance(options?: EnhanceOptions): SubmitFunction {
		return (input) => {
			this.submitting = true;
			this.message = undefined;
			this.errors = {};

			if (options?.onSubmit) {
				options.onSubmit(input);
				// Note: We can't easily check if cancel() was called effectively unless we wrap it,
				// but standard SvelteKit cancel() throws or sets a flag.
				// For now we assume if onSubmit cancels, it handles it.
			}

			// Client-side validation
			if (this.schema) {
				const result = safeParse(this.schema, this.data);
				if (!result.success) {
					const flatErrors = flatten(result.issues).nested;
					this.errors = flatErrors as Record<string, string[]>;
					this.submitting = false;
					input.cancel();
					return;
				}
			}

			return async (resultInput) => {
				const { result, update } = resultInput;
				this.submitting = false;

				if (result.type === 'failure') {
					if (result.data?.errors) {
						this.errors = result.data.errors as Record<string, string[]>;
					}
					if (result.data?.message) {
						this.message = result.data.message as string;
					}
				} else if (result.type === 'success') {
					if (result.data?.message) {
						this.message = result.data.message as string;
					}
				}

				if (options?.onResult) {
					await options.onResult(resultInput);
				} else {
					await update();
				}
			};
		};
	}

	// Manual submit handler for standard API endpoints
	async submit(url: string, options: RequestInit = {}) {
		this.submitting = true;
		this.message = undefined;
		this.errors = {};

		// Client-side validation
		if (this.schema) {
			const result = safeParse(this.schema, this.data);
			if (!result.success) {
				const flatErrors = flatten(result.issues).nested;
				this.errors = flatErrors as Record<string, string[]>;
				this.submitting = false;
				return { success: false, errors: this.errors };
			}
		}

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				...options,
				body: JSON.stringify(this.data)
			});

			const data = await response.json();

			if (!response.ok) {
				this.errors = data.errors || {};
				this.message = data.message || 'An error occurred';
				return { success: false, data };
			}

			this.message = data.message;
			return { success: true, data };
		} catch (error) {
			this.message = error instanceof Error ? error.message : 'Network error';
			return { success: false, error };
		} finally {
			this.submitting = false;
		}
	}
}
