/**
 * @file src/utils/localeStatus.ts
 * @description Utilities for per-locale publishing status management
 */

import type { CollectionEntry, StatusType, LocaleStatusMap, LocaleStatus, FallbackStrategy } from '@src/content/types';
import { StatusTypes, FallbackStrategies } from '@src/content/types';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { logger } from './logger';

/**
 * Get the status for a specific locale from an entry
 * Falls back to global status if localeStatus not present (backward compatibility)
 */
export function getLocaleStatus(entry: CollectionEntry | null | undefined, locale: string): StatusType {
	if (!entry) return StatusTypes.unpublish;

	// Check for locale-specific status
	if (entry.localeStatus && entry.localeStatus[locale]) {
		return entry.localeStatus[locale].status;
	}

	// Fallback to global status for backward compatibility
	return entry.status || StatusTypes.unpublish;
}

/**
 * Get the scheduled timestamp for a specific locale
 * Falls back to global _scheduled if localeStatus not present
 */
export function getLocaleSchedule(entry: CollectionEntry | null | undefined, locale: string): number | undefined {
	if (!entry) return undefined;

	// Check for locale-specific schedule
	if (entry.localeStatus && entry.localeStatus[locale]) {
		return entry.localeStatus[locale].scheduledAt;
	}

	// Fallback to global _scheduled for backward compatibility
	return entry._scheduled;
}

/**
 * Set status for a specific locale in an entry
 * Initializes localeStatus map if it doesn't exist
 */
export function setLocaleStatus(entry: CollectionEntry, locale: string, status: StatusType, scheduledAt?: number): CollectionEntry {
	const localeStatus = entry.localeStatus || {};

	localeStatus[locale] = {
		status,
		...(scheduledAt !== undefined && { scheduledAt })
	};

	return {
		...entry,
		localeStatus,
		// Update global status for backward compatibility (use default locale status)
		status: localeStatus[getDefaultContentLanguage()]?.status || status
	};
}

/**
 * Initialize localeStatus for all available languages from global status
 * Used for migrating existing entries
 */
export function initializeLocaleStatus(entry: CollectionEntry, availableLanguages: string[]): CollectionEntry {
	// Skip if already initialized
	if (entry.localeStatus && Object.keys(entry.localeStatus).length > 0) {
		return entry;
	}

	const globalStatus = entry.status || StatusTypes.unpublish;
	const globalSchedule = entry._scheduled;
	const localeStatus: LocaleStatusMap = {};

	// Initialize all languages with the same status
	availableLanguages.forEach((lang) => {
		localeStatus[lang] = {
			status: globalStatus,
			...(globalSchedule !== undefined && { scheduledAt: globalSchedule })
		};
	});

	return {
		...entry,
		localeStatus
	};
}

/**
 * Get the default content language from settings
 */
export function getDefaultContentLanguage(): string {
	return publicEnv?.DEFAULT_CONTENT_LANGUAGE || 'en';
}

/**
 * Get available content languages from settings
 */
export function getAvailableContentLanguages(): string[] {
	return publicEnv?.AVAILABLE_CONTENT_LANGUAGES || ['en'];
}

/**
 * Get the fallback strategy from system settings
 */
export function getFallbackStrategy(): FallbackStrategy {
	// TODO: Load from system preferences when configuration UI is implemented
	// For now, default to 'default' (fallback to DEFAULT_CONTENT_LANGUAGE)
	return FallbackStrategies.default;
}

/**
 * Get translation completion percentage for a locale
 */
export function getLocaleCompletionPercentage(
	entry: CollectionEntry | null | undefined,
	locale: string,
	translatableFields: string[]
): number {
	if (!entry || !translatableFields.length) return 0;

	let completed = 0;
	let total = translatableFields.length;

	for (const fieldName of translatableFields) {
		const fieldValue = entry[fieldName];

		// Check if field is translated for this locale
		if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
			const localeValue = (fieldValue as Record<string, unknown>)[locale];
			if (localeValue && (typeof localeValue === 'string' ? localeValue.trim() !== '' : true)) {
				completed++;
			}
		}
	}

	return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/**
 * Find the best fallback locale based on strategy
 */
export function findFallbackLocale(
	entry: CollectionEntry | null | undefined,
	requestedLocale: string,
	strategy: FallbackStrategy,
	translatableFields: string[]
): string {
	if (!entry) return getDefaultContentLanguage();

	const availableLanguages = getAvailableContentLanguages();
	const defaultLanguage = getDefaultContentLanguage();

	// If requested locale is available and published, use it
	const requestedStatus = getLocaleStatus(entry, requestedLocale);
	if (requestedStatus === StatusTypes.publish && availableLanguages.includes(requestedLocale)) {
		return requestedLocale;
	}

	switch (strategy) {
		case FallbackStrategies.strict:
			// No fallback - return requested locale even if unpublished
			return requestedLocale;

		case FallbackStrategies.bestComplete:
			// Find the locale with highest completion that is published
			let bestLocale = defaultLanguage;
			let bestCompletion = 0;

			for (const locale of availableLanguages) {
				const status = getLocaleStatus(entry, locale);
				if (status === StatusTypes.publish) {
					const completion = getLocaleCompletionPercentage(entry, locale, translatableFields);
					if (completion > bestCompletion) {
						bestCompletion = completion;
						bestLocale = locale;
					}
				}
			}

			return bestLocale;

		case FallbackStrategies.default:
		default:
			// Fallback to default content language
			return defaultLanguage;
	}
}

/**
 * Check if an entry is published for a specific locale
 */
export function isLocalePublished(entry: CollectionEntry | null | undefined, locale: string): boolean {
	const status = getLocaleStatus(entry, locale);
	return status === StatusTypes.publish;
}

/**
 * Check if an entry is scheduled for a specific locale
 */
export function isLocaleScheduled(entry: CollectionEntry | null | undefined, locale: string): boolean {
	const status = getLocaleStatus(entry, locale);
	const scheduledAt = getLocaleSchedule(entry, locale);
	return status === StatusTypes.schedule && scheduledAt !== undefined;
}

/**
 * Get all locale statuses for an entry
 * Returns a map of locale -> status for display purposes
 */
export function getAllLocaleStatuses(entry: CollectionEntry | null | undefined): Record<string, StatusType> {
	if (!entry) return {};

	const availableLanguages = getAvailableContentLanguages();
	const result: Record<string, StatusType> = {};

	availableLanguages.forEach((locale) => {
		result[locale] = getLocaleStatus(entry, locale);
	});

	return result;
}

/**
 * Validate locale status map
 * Ensures all available languages have valid status entries
 */
export function validateLocaleStatus(localeStatus: LocaleStatusMap | undefined): boolean {
	if (!localeStatus || typeof localeStatus !== 'object') return false;

	const availableLanguages = getAvailableContentLanguages();
	return availableLanguages.every(
		(lang) => localeStatus[lang] !== undefined && typeof localeStatus[lang] === 'object' && 'status' in localeStatus[lang]
	);
}

/**
 * Log locale status information for debugging
 */
export function logLocaleStatus(entry: CollectionEntry | null | undefined, context: string): void {
	if (!entry) {
		logger.debug(`[${context}] No entry provided`);
		return;
	}

	const availableLanguages = getAvailableContentLanguages();
	const statuses: Record<string, string> = {};

	availableLanguages.forEach((locale) => {
		const status = getLocaleStatus(entry, locale);
		const scheduled = getLocaleSchedule(entry, locale);
		statuses[locale] = scheduled ? `${status} (scheduled: ${new Date(scheduled).toISOString()})` : status;
	});

	logger.debug(`[${context}] Locale statuses:`, statuses);
}
