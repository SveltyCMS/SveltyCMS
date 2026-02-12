/**
 * @file tests/bun/mocks/app-navigation.ts
 * @description Mocks for SvelteKit's $app/navigation
 */

export function goto(): Promise<void> {
	return Promise.resolve();
}

export function invalidate(): Promise<void> {
	return Promise.resolve();
}

export function invalidateAll(): Promise<void> {
	return Promise.resolve();
}

export function beforeNavigate(): void {}
export function afterNavigate(): void {}
export function disableScrollHandling(): void {}
export function pushState(): void {}
export function replaceState(): void {}
