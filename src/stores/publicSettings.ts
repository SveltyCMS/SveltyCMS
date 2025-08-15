/**
 * @file src/stores/publicSettings.ts
 * @description Client-side store for public settings only
 *
 * This store handles:
 * - Public settings from server load function
 * - Reactive updates when settings change
 * - Type safety for public settings
 * - No access to private settings (security)
 */

import { writable, type Writable, get } from 'svelte/store';
import type { PublicSettings } from '@src/lib/settings.server';

// Create a writable store for public settings
export const publicSettings: Writable<PublicSettings> = writable({});

// Helper function to get a specific public setting
export function getPublicSetting<K extends keyof PublicSettings>(key: K): PublicSettings[K] | undefined {
	const currentSettings = get(publicSettings);
	return currentSettings[key];
}

// Helper function to update public settings
export function updatePublicSettings(newSettings: Partial<PublicSettings>): void {
	publicSettings.update((settings) => ({
		...settings,
		...newSettings
	}));
}

// Helper function to set all public settings
export function setPublicSettings(settings: PublicSettings): void {
	publicSettings.set(settings);
}

// Convenience functions for common settings
export const getSiteName = () => getPublicSetting('SITE_NAME');
export const getBaseLocale = () => getPublicSetting('BASE_LOCALE');
export const getLocales = () => getPublicSetting('LOCALES');
export const getDefaultLanguage = () => getPublicSetting('DEFAULT_CONTENT_LANGUAGE');
export const getAvailableLanguages = () => getPublicSetting('AVAILABLE_CONTENT_LANGUAGES');
export const getMaxFileSize = () => getPublicSetting('MAX_FILE_SIZE');
export const getBodySizeLimit = () => getPublicSetting('BODY_SIZE_LIMIT');
export const getPasswordLength = () => getPublicSetting('PASSWORD_LENGTH');
export const isDemoMode = () => getPublicSetting('DEMO');
export const isSeasonsEnabled = () => getPublicSetting('SEASONS');
export const isSetupCompleted = () => getPublicSetting('SETUP_COMPLETED');
export const isMapboxEnabled = () => getPublicSetting('USE_MAPBOX');
export const getMapboxToken = () => getPublicSetting('MAPBOX_API_TOKEN');

// Legacy compatibility - redirect to new function
export function getGlobalSetting<T = string>(key: string): T | undefined {
	return getPublicSetting(key as keyof PublicSettings) as T | undefined;
}
