/**
 * @file src/stores/statusStore.svelte.ts
 * @description Centralized status logic for collection entries.
 * simplifies status management by deriving state directly from collectionValue.
 * Supports per-locale publication status when enabled.
 */

import { collections } from '@src/stores/collectionStore.svelte';
import { updateEntryStatus } from '@src/utils/apiClient';
import { showToast } from '@utils/toast';
import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { logger } from '@utils/logger';
import { contentLanguage } from '@src/stores/store.svelte';
import { publicEnv } from '@src/stores/globalSettings.svelte';

// Only track transient UI state
const statusState = $state({
	isLoading: false,
	lastToggleTime: 0
});

/**
 * Check if per-locale publishing is enabled at both system and collection level
 */
function isPerLocaleEnabled(): boolean {
	const systemEnabled = publicEnv.ENABLE_PER_LOCALE_PUBLISHING ?? false;
	const collectionEnabled = collections.active?.perLocalePublishing ?? false;
	return systemEnabled && collectionEnabled;
}

/**
 * Get the effective status for the current locale (or global if per-locale disabled)
 */
function getEffectiveStatus(): StatusType {
	const cv = collections.activeValue;
	
	// If per-locale is enabled, check locale-specific status first
	if (isPerLocaleEnabled() && cv?.statusByLocale) {
		const localeStatus = cv.statusByLocale[contentLanguage.value];
		if (localeStatus) {
			return localeStatus as StatusType;
		}
	}

	// Fall back to global status
	if (cv?.status) {
		return cv.status as StatusType;
	}

	// Fall back to collection default status
	const collectionStatus = collections.active?.status;
	return (collectionStatus || StatusTypes.unpublish) as StatusType;
}

/**
 * Helper to determine if entry is published (for current locale if per-locale enabled)
 */
function getIsPublish(): boolean {
	return getEffectiveStatus() === StatusTypes.publish;
}

// Reactively derive the publish state
const isPublish = $derived.by(getIsPublish);

/**
 * Get current status as StatusType enum
 */
function getCurrentStatus(): StatusType {
	return getEffectiveStatus();
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
	 * Toggle entry status between publish/unpublish
	 * Handles per-locale publishing when enabled
	 *
	 * @param newValue - true for publish, false for unpublish
	 * @param componentName - Name of calling component (for logging)
	 * @returns Promise<boolean> - true if successful
	 */
	async toggleStatus(newValue: boolean, componentName: string = 'Component'): Promise<boolean> {
		// Prevent redundant toggles
		if (newValue === isPublish) {
			logger.debug(`[StatusStore] Status already ${newValue ? 'published' : 'unpublished'}`);
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
		const locale = contentLanguage.value;
		const perLocale = isPerLocaleEnabled();
		
		logger.debug(`[StatusStore] Toggling status to ${newStatus} (from ${componentName}, locale: ${locale}, per-locale: ${perLocale})`);

		try {
			// Case 1: Entry exists - update via API
			if (collections.activeValue?._id && collections.active?._id) {
				const payload = perLocale ? { locale } : undefined;
				const result = await updateEntryStatus(
					String(collections.active._id), 
					String(collections.activeValue._id), 
					newStatus,
					payload
				);

				if (result.success) {
					// Update local state
					const updatedValue = { ...collections.activeValue };
					
					if (perLocale) {
						// Update locale-specific status
						updatedValue.statusByLocale = {
							...(updatedValue.statusByLocale as Record<string, StatusType> || {}),
							[locale]: newStatus
						};
						// Clear locale-specific schedule
						if (updatedValue._scheduledByLocale) {
							const schedules = { ...(updatedValue._scheduledByLocale as Record<string, string>) };
							delete schedules[locale];
							updatedValue._scheduledByLocale = schedules;
						}
					} else {
						// Update global status
						updatedValue.status = newStatus;
						// Clear global schedule
						updatedValue._scheduled = undefined;
					}
					
					collections.setCollectionValue(updatedValue);

					showToast(
						newValue 
							? perLocale ? `Entry published for ${locale}` : 'Entry published successfully'
							: perLocale ? `Entry unpublished for ${locale}` : 'Entry unpublished successfully',
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
				const updatedValue = { ...collections.activeValue };
				
				if (perLocale) {
					updatedValue.statusByLocale = {
						...(updatedValue.statusByLocale as Record<string, StatusType> || {}),
						[locale]: newStatus
					};
				} else {
					updatedValue.status = newStatus;
				}
				
				collections.setCollectionValue(updatedValue);

				logger.debug(`[StatusStore] Status set to ${newStatus} (unsaved entry, per-locale: ${perLocale})`);
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
	 * Get status value for save operations
	 * Useful when preparing data to send to API
	 */
	getStatusForSave(): StatusType {
		return getCurrentStatus();
	},

	/**
	 * Set status directly (without API call)
	 * Use for initialization or when status is set as part of larger save
	 * Handles per-locale publishing when enabled
	 */
	setStatusLocal(status: StatusType): void {
		const locale = contentLanguage.value;
		const perLocale = isPerLocaleEnabled();
		
		logger.debug(`[StatusStore] Setting status locally to ${status} (locale: ${locale}, per-locale: ${perLocale})`);
		
		const updatedValue = { ...collections.activeValue };
		
		if (perLocale) {
			updatedValue.statusByLocale = {
				...(updatedValue.statusByLocale as Record<string, StatusType> || {}),
				[locale]: status
			};
		} else {
			updatedValue.status = status;
		}
		
		collections.setCollectionValue(updatedValue);
	},

	/**
	 * Check if entry is in a specific status
	 */
	hasStatus(status: StatusType): boolean {
		return getCurrentStatus() === status;
	},

	/**
	 * Check if entry is scheduled (for current locale if per-locale enabled)
	 */
	get isScheduled(): boolean {
		const status = getCurrentStatus();
		if (status !== StatusTypes.schedule) return false;
		
		const cv = collections.activeValue;
		const perLocale = isPerLocaleEnabled();
		
		if (perLocale && cv?._scheduledByLocale) {
			return !!cv._scheduledByLocale[contentLanguage.value];
		}
		
		return !!cv?._scheduled;
	},
	
	/**
	 * Get scheduled time for current locale (if per-locale enabled) or global
	 */
	getScheduledTime(): string | undefined {
		const cv = collections.activeValue;
		const perLocale = isPerLocaleEnabled();
		
		if (perLocale && cv?._scheduledByLocale) {
			return cv._scheduledByLocale[contentLanguage.value];
		}
		
		return cv?._scheduled as string | undefined;
	}
};
