/**
 * @file tests/bun/mocks/app-navigation.ts
 * @description Mocks for SvelteKit's $app/navigation
 */

export function goto(_url: string | URL, _opts?: any): Promise<void> {
	return Promise.resolve();
}

export function invalidate(_url: string | URL): Promise<void> {
	return Promise.resolve();
}

export function invalidateAll(): Promise<void> {
	return Promise.resolve();
}

export function beforeNavigate(_fn: any): void {}
export function afterNavigate(_fn: any): void {}
export function disableScrollHandling(): void {}
export function pushState(_url: string | URL, _state: any): void {}
export function replaceState(_url: string | URL, _state: any): void {}
