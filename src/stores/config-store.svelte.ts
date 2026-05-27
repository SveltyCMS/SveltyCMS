/**
 * @file src/stores/config-store.svelte.ts
 * @description Global store for configuration UI state
 */

import { SvelteSet } from 'svelte/reactivity';

// Track which settings groups need configuration (empty required fields)
export const groupsNeedingConfig = new SvelteSet<string>();
