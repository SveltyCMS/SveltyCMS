// this file is generated — do not edit it

declare module 'svelte/elements' {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?: true | '' | 'eager' | 'viewport' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};

declare module '$app/types' {
	export interface AppTypes {
		RouteId():
			| '/'
			| '/api'
			| '/api/complete'
			| '/api/email-test'
			| '/api/install-driver'
			| '/api/reset'
			| '/api/seed'
			| '/api/status'
			| '/api/test-database';
		RouteParams(): {};
		LayoutParams(): {
			'/': Record<string, never>;
			'/api': Record<string, never>;
			'/api/complete': Record<string, never>;
			'/api/email-test': Record<string, never>;
			'/api/install-driver': Record<string, never>;
			'/api/reset': Record<string, never>;
			'/api/seed': Record<string, never>;
			'/api/status': Record<string, never>;
			'/api/test-database': Record<string, never>;
		};
		Pathname():
			| '/'
			| '/api'
			| '/api/'
			| '/api/complete'
			| '/api/complete/'
			| '/api/email-test'
			| '/api/email-test/'
			| '/api/install-driver'
			| '/api/install-driver/'
			| '/api/reset'
			| '/api/reset/'
			| '/api/seed'
			| '/api/seed/'
			| '/api/status'
			| '/api/status/'
			| '/api/test-database'
			| '/api/test-database/';
		ResolvedPathname(): `${'' | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): '/Default_User.svg' | '/Spinner.svg' | '/SveltyCMS.png' | '/SveltyCMS_Logo.svg' | '/robots.txt' | (string & {});
	}
}
