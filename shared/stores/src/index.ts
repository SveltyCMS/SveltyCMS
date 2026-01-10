/**
 * @fileoverview Shared state management for SveltyCMS
 * 
 * Provides Svelte stores for cross-workspace state sharing.
 * All stores are reactive and can be persisted to localStorage.
 * 
 * @module @shared/stores
 */

import { writable, derived } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';

// Export all stores
export { userStore } from './user';
export { themeStore } from './theme';
export { languageStore, isRTL } from './language';
export { notificationStore } from './notifications';
export { configStore, isDatabaseMongoDB, isDatabaseSQL } from './config';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export type Theme = 'light' | 'dark' | 'auto';
export type Language = 'en' | 'de' | 'fr' | 'es';

/**
 * Placeholder user store
 */
export const userStore: Writable<User | null> = writable(null);

/**
 * Placeholder theme store
 */
export const themeStore: Writable<Theme> = writable('auto');

/**
 * Placeholder language store
 */
export const languageStore: Writable<Language> = writable('en');

/**
 * Derived store for RTL detection
 */
export const isRTL: Readable<boolean> = derived(
  languageStore,
  $lang => ['ar', 'he', 'fa'].includes($lang)
);
