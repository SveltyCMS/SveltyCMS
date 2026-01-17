/**
 * @file shared/stores/src/configStore.svelte.ts
 * @description Global store for configuration UI state
 *
 * ### Features
 * - Track which settings groups need configuration (empty required fields)
 */

import { writable } from 'svelte/store';

// Track which settings groups need configuration (empty required fields)
export const groupsNeedingConfig = writable<Set<string>>(new Set());
