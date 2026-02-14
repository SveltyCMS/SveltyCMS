/**
 * @file tests/bun/preload.ts
 * @description Preload script to fix module resolution for packages that only export via "svelte" condition
 * and mock SvelteKit virtual modules for testing
 */

import { plugin } from 'bun';
import { join } from 'path';
import { readFileSync } from 'fs';

// Load .env.test for test environment
const envPath = join(process.cwd(), '.env.test');
try {
	const envFile = readFileSync(envPath, 'utf-8');
	envFile.split('\n').forEach(line => {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) {
			const [key, ...valueParts] = trimmed.split('=');
			if (key && valueParts.length > 0) {
				process.env[key.trim()] = valueParts.join('=').trim();
			}
		}
	});
} catch (error) {
	console.warn('Could not load .env.test:', error);
}

const mocksDir = join(import.meta.dir, 'mocks');

// Fix module resolution for packages that only have "svelte" exports
plugin({
	name: 'svelte-exports-resolver',
	setup(build) {
		// Handle sveltekit-rate-limiter/server
		build.onResolve({ filter: /^sveltekit-rate-limiter\/server$/ }, () => {
			return {
				path: require.resolve('sveltekit-rate-limiter/dist/server/index.js')
			};
		});

		// Handle sveltekit-rate-limiter/server/limiters
		build.onResolve({ filter: /^sveltekit-rate-limiter\/server\/limiters$/ }, () => {
			return {
				path: require.resolve('sveltekit-rate-limiter/dist/server/limiters/index.js')
			};
		});

		// Handle sveltekit-rate-limiter/server/stores
		build.onResolve({ filter: /^sveltekit-rate-limiter\/server\/stores$/ }, () => {
			return {
				path: require.resolve('sveltekit-rate-limiter/dist/server/stores/index.js')
			};
		});

		// Handle @zag-js/svelte
		build.onResolve({ filter: /^@zag-js\/svelte$/ }, () => {
			return {
				path: require.resolve('@zag-js/svelte/dist/index.js')
			};
		});

		// Mock SvelteKit virtual modules
		build.onResolve({ filter: /^\$app\/environment$/ }, () => {
			return { path: join(mocksDir, 'app-environment.ts') };
		});

		build.onResolve({ filter: /^\$app\/stores$/ }, () => {
			return { path: join(mocksDir, 'app-stores.ts') };
		});

		build.onResolve({ filter: /^\$app\/navigation$/ }, () => {
			return { path: join(mocksDir, 'app-navigation.ts') };
		});

		build.onResolve({ filter: /^\$app\/forms$/ }, () => {
			return { path: join(mocksDir, 'app-forms.ts') };
		});
	}
});
