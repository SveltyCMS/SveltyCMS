// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			theme: string | null; // Theme preference
			darkMode: boolean; // Dark mode preference from cookies
			// Setup hook caching
			__setupConfigExists?: boolean;
			__setupComplete?: boolean;
			__setupLogged?: boolean;
			__setupRedirectLogged?: boolean;
			__setupLoginRedirectLogged?: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
