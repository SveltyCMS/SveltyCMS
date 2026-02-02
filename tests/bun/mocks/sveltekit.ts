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
	goto: async (url: string) => {},
	invalidate: async (url: string) => {},
	invalidateAll: async () => {},
	prefetch: async (url: string) => {},
	prefetchRoutes: async (routes?: string[]) => {},
	beforeNavigate: (fn: any) => {},
	afterNavigate: (fn: any) => {},
	disableScrollHandling: () => {},
	onNavigate: (fn: any) => () => {},
	pushState: (url: string, state: any) => {},
	replaceState: (url: string, state: any) => {}
};

// $app/forms mock
export const appForms = {
	enhance: (form: any, options?: any) => ({ destroy: () => {} }),
	applyAction: async (result: any) => {},
	deserialize: (data: string) => JSON.parse(data)
};
