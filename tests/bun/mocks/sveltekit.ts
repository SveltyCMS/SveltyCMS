/**
 * @file tests/bun/mocks/sveltekit.ts
 * @description Mocks for SvelteKit virtual modules used in tests
 */

// $app/environment mock
export const appEnvironment = {
	browser: false,
	dev: false,
	building: false,
	version: 'test'
};

// $app/stores mock (simplified)
export const appStores = {
	page: {
		subscribe: (fn: any) => {
			fn({ url: new URL('http://localhost:4173'), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null });
			return () => {};
		}
	},
	navigating: {
		subscribe: (fn: any) => {
			fn(null);
			return () => {};
		}
	},
	updated: {
		subscribe: (fn: any) => {
			fn(false);
			return () => {};
		},
		check: async () => false
	}
};

// $app/navigation mock
export const appNavigation = {
	goto: async (_url: string) => {},
	invalidate: async (_url: string) => {},
	invalidateAll: async () => {},
	prefetch: async (_url: string) => {},
	prefetchRoutes: async (_routes?: string[]) => {},
	beforeNavigate: (_fn: any) => {},
	afterNavigate: (_fn: any) => {},
	disableScrollHandling: () => {},
	onNavigate: (_fn: any) => () => {},
	pushState: (_url: string, _state: any) => {},
	replaceState: (_url: string, _state: any) => {}
};

// $app/forms mock
export const appForms = {
	enhance: (_form: any, _options?: any) => ({ destroy: () => {} }),
	applyAction: async (_result: any) => {},
	deserialize: (data: string) => JSON.parse(data)
};
