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
	goto: async () => {},
	invalidate: async () => {},
	invalidateAll: async () => {},
	prefetch: async () => {},
	prefetchRoutes: async () => {},
	beforeNavigate: () => {},
	afterNavigate: () => {},
	disableScrollHandling: () => {},
	onNavigate: () => () => {},
	pushState: () => {},
	replaceState: () => {}
};

// $app/forms mock
export const appForms = {
	enhance: () => ({ destroy: () => {} }),
	applyAction: async () => {},
	deserialize: (data: string) => JSON.parse(data)
};
