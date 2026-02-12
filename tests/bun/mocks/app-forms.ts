/**
 * @file tests/bun/mocks/app-forms.ts
 * @description Mocks for SvelteKit's $app/forms
 */
export function enhance(): { destroy: () => void } {
	return { destroy: () => {} };
}

export async function applyAction(): Promise<void> {}

export function deserialize(data: string): any {
	return JSON.parse(data);
}
