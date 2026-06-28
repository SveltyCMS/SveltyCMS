/**
 * @file src/stores/settings-config-state.svelte.ts
 * @description Tracks which settings groups need configuration (empty required fields)
 */

import { SvelteSet } from "svelte/reactivity";

// Track which settings groups need configuration (empty required fields)
export const groupsNeedingConfig = new SvelteSet<string>();
