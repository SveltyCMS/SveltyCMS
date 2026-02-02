/**
 * @file tests/bun/mocks/app-forms.ts
 * @description Mocks for SvelteKit's $app/forms
 */
export function enhance(_form: HTMLFormElement, _options?: any): { destroy: () => void } {
	return { destroy: () => {} };
}

export async function applyAction(_result: any): Promise<void> {}

export function deserialize(data: string): any {
	return JSON.parse(data);
}
