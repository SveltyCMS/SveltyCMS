/**
 * @file src/hooks/handleSystemState.ts
 * @description A SvelteKit hook to manage and expose system state (ready/healthy) for other hooks and routes.
 */

import { isSystemReady, isServiceHealthy } from '@stores/systemState';
import type { Handle } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

export const handleSystemState: Handle = async ({ event, resolve }) => {
	const { url } = event;

	// Fast path for setup routes - skip all system checks
	if (url.pathname.startsWith('/setup') || url.pathname.startsWith('/api/setup')) {
		event.locals.__skipSystemHooks = true;
		event.locals.__systemReady = false;
		event.locals.__authReady = false;
		event.locals.__themeReady = false;
		return resolve(event);
	}

	// Single state check for all hooks to use
	const systemReady = isSystemReady(); // Fast, non-blocking
	const authReady = isServiceHealthy('auth');
	const themeReady = isServiceHealthy('themeManager');

	// Attach to locals for hooks to consume
	event.locals.__skipSystemHooks = false;
	event.locals.__systemReady = systemReady;
	event.locals.__authReady = authReady;
	event.locals.__themeReady = themeReady;

	// Log once if system not ready (instead of in every hook)
	if (!systemReady) {
		logger.trace('System not ready, some hooks will be skipped');
	}

	return resolve(event);
};
