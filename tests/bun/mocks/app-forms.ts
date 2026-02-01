/**
 * Mock for $app/forms
 */
export function enhance(form: HTMLFormElement, options?: any): { destroy: () => void } {
	return { destroy: () => {} };
}

export async function applyAction(result: any): Promise<void> {}

export function deserialize(data: string): any {
	return JSON.parse(data);
}
