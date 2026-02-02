/**
 * Mock for $app/stores
 */
export const page = {
	subscribe: (fn: any) => {
		fn({
			url: new URL('http://localhost:4173'),
			params: {},
			route: { id: null },
			status: 200,
			error: null,
			data: {},
			form: null
		});
		return () => {};
	}
};

export const navigating = {
	subscribe: (fn: any) => {
		fn(null);
		return () => {};
	}
};

export const updated = {
	subscribe: (fn: any) => {
		fn(false);
		return () => {};
	},
	check: async () => false
};

export function getStores() {
	return { page, navigating, updated };
}
