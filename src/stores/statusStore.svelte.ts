/**
 * @file src/stores/statusStore.svelte.ts
 * @description Centralized status logic for collection entries with per-locale support.
 * Manages both global status (backward compatibility) and per-locale status.
 */

import { collections } from '@src/stores/collectionStore.svelte';
import { app } from '@src/stores/store.svelte';
import { updateEntryStatus } from '@src/utils/apiClient';
import { showToast } from '@utils/toast';
import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { logger } from '@utils/logger';
import { getLocaleStatus, setLocaleStatus, initializeLocaleStatus, getAvailableContentLanguages, getLocaleSchedule } from '@utils/localeStatus';

// Only track transient UI state
const statusState = $state({
	isLoading: false,
	lastToggleTime: 0
});

/**
 * Helper to determine if entry is published for current locale
 * Supports both per-locale status (new) and global status (backward compatibility)
 */
function getIsPublish(): boolean {
	const cv = collections.activeValue;
	const currentLocale = app.contentLanguage;

	// Use locale-specific status if available
	const localeStatus = getLocaleStatus(cv, currentLocale);
	return localeStatus === StatusTypes.publish;
}

// Reactively derive the publish state
const isPublish = $derived.by(getIsPublish);

/**
 * Get current status for the active locale
 */
function getCurrentStatus(): StatusType {
	const cv = collections.activeValue;
	const currentLocale = app.contentLanguage;

	return getLocaleStatus(cv, currentLocale);
}

export const statusStore = {
	/**
	 * Check if current entry is published
	 */
	get isPublish() {
		return isPublish;
	},

	/**
	 * Check if status operation is in progress
	 */
	get isLoading() {
		return statusState.isLoading;
	},

	/**
	 * Get current status value
	 */
	get currentStatus(): StatusType {
		return getCurrentStatus();
	},

	/**
	 * Toggle entry status between publish/unpublish for current locale
	 *
	 * @param newValue - true for publish, false for unpublish
	 * @param componentName - Name of calling component (for logging)
	 * @param locale - Optional locale override (defaults to current contentLanguage)
	 * @returns Promise<boolean> - true if successful
	 */
	async toggleStatus(newValue: boolean, componentName: string = 'Component', locale?: string): Promise<boolean> {
		const currentLocale = locale || app.contentLanguage;

		// Prevent redundant toggles
		if (newValue === isPublish) {
			logger.debug(`[StatusStore] Status already ${newValue ? 'published' : 'unpublished'} for locale ${currentLocale}`);
			return true;
		}

		// Prevent concurrent toggles
		if (statusState.isLoading) {
			logger.warn('[StatusStore] Status toggle already in progress');
			return false;
		}

		// Throttle rapid toggles (prevent double-click issues)
		const now = Date.now();
		if (now - statusState.lastToggleTime < 500) {
			logger.debug('[StatusStore] Throttling rapid status toggle');
			return false;
		}

		statusState.isLoading = true;
		statusState.lastToggleTime = now;

		const newStatus = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		logger.debug(`[StatusStore] Toggling status to ${newStatus} for locale ${currentLocale} (from ${componentName})`);

		try {
			// Initialize localeStatus if not present (migration support)
			if (!collections.activeValue?.localeStatus) {
				// Ensure we have a valid entry before initializing
				if (!collections.activeValue) {
					logger.error('[StatusStore] Cannot toggle status: no active entry');
					return false;
				}

				const availableLanguages = getAvailableContentLanguages();
				const initialized = initializeLocaleStatus(collections.activeValue, availableLanguages);
				collections.setCollectionValue(initialized);
			}

			// Update locale-specific status - ensure we have a valid entry
			if (!collections.activeValue) {
				logger.error('[StatusStore] Cannot set locale status: no active entry');
				return false;
			}

			const updatedEntry = setLocaleStatus(collections.activeValue, currentLocale, newStatus);

			// Case 1: Entry exists - update via API
			if (collections.activeValue?._id && collections.active?._id) {
				const result = await updateEntryStatus(
					String(collections.active._id),
					String(collections.activeValue._id),
					newStatus,
					currentLocale
				);

				if (result.success) {
					// Update local state with locale-specific status
					collections.setCollectionValue(updatedEntry);

					showToast(
						`${newValue ? 'Published' : 'Unpublished'} for ${currentLocale.toUpperCase()}`,
						'success'
					);
					return true;
				} else {
					showToast(result.error || `Failed to ${newStatus} entry`, 'error');
					return false;
				}
			}
			// Case 2: New entry (no ID yet) - update local state only
			else {
				collections.setCollectionValue(updatedEntry);
				logger.debug(`[StatusStore] Status set to ${newStatus} for locale ${currentLocale} (unsaved entry)`);
				return true;
			}
		} catch (e) {
			const error = e as Error;
			showToast(`Error updating status: ${error.message}`, 'error');
			logger.error(`[StatusStore] Error in ${componentName}:`, error);
			return false;
		} finally {
			statusState.isLoading = false;
		}
	},

	/**
	 * Get status value for save operations (current locale)
	 * Useful when preparing data to send to API
	 */
	getStatusForSave(locale?: string): StatusType {
		const currentLocale = locale || app.contentLanguage;
		return getLocaleStatus(collections.activeValue, currentLocale);
	},

	/**
	 * Set status directly (without API call) for specific locale
	 * Use for initialization or when status is set as part of larger save
	 */
	setStatusLocal(status: StatusType, locale?: string): void {
		const currentLocale = locale || app.contentLanguage;
		logger.debug(`[StatusStore] Setting status locally to ${status} for locale ${currentLocale}`);

		// Ensure we have a valid entry
		if (!collections.activeValue) {
			logger.error('[StatusStore] Cannot set status: no active entry');
			return;
		}

		// Initialize localeStatus if not present
		if (!collections.activeValue.localeStatus) {
			const availableLanguages = getAvailableContentLanguages();
			const initialized = initializeLocaleStatus(collections.activeValue, availableLanguages);
			collections.setCollectionValue(initialized);
		}

		const updatedEntry = setLocaleStatus(collections.activeValue, currentLocale, status);
		collections.setCollectionValue(updatedEntry);
	},

	/**
	 * Set schedule for specific locale
	 */
	setScheduleLocal(scheduledAt: number, locale?: string): void {
		const currentLocale = locale || app.contentLanguage;
		logger.debug(`[StatusStore] Setting schedule to ${scheduledAt} for locale ${currentLocale}`);

		// Ensure we have a valid entry
		if (!collections.activeValue) {
			logger.error('[StatusStore] Cannot set schedule: no active entry');
			return;
		}

		// Initialize localeStatus if not present
		if (!collections.activeValue.localeStatus) {
			const availableLanguages = getAvailableContentLanguages();
			const initialized = initializeLocaleStatus(collections.activeValue, availableLanguages);
			collections.setCollectionValue(initialized);
		}

		const updatedEntry = setLocaleStatus(collections.activeValue, currentLocale, StatusTypes.schedule, scheduledAt);
		collections.setCollectionValue(updatedEntry);
	},

	/**
	 * Check if entry is in a specific status for current locale
	 */
	hasStatus(status: StatusType, locale?: string): boolean {
		const currentLocale = locale || app.contentLanguage;
		return getLocaleStatus(collections.activeValue, currentLocale) === status;
	},

	/**
	 * Check if entry is scheduled for current locale
	 */
	get isScheduled(): boolean {
		const currentLocale = app.contentLanguage;
		return (
			getLocaleStatus(collections.activeValue, currentLocale) === StatusTypes.schedule &&
			!!getLocaleSchedule(collections.activeValue, currentLocale)
		);
	},

	/**
	 * Get status for all locales
	 */
	getAllStatuses(): Record<string, StatusType> {
		const availableLanguages = getAvailableContentLanguages();
		const result: Record<string, StatusType> = {};

		availableLanguages.forEach((locale) => {
			result[locale] = getLocaleStatus(collections.activeValue, locale);
		});

		return result;
	}
};
