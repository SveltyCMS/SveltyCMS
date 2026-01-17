/**
 * @file shared/utils/src/server/settingsVersion.ts
 * @description Settings change notification system using Server-Sent Events
 *
 * When settings are updated in the database, this broadcasts the change
 * to all connected clients via SSE for instant UI updates.
 *
 * ### Features
 * - Simple version tracking
 * - Thread-safe operations
 * - Error handling
 */

import { logger } from '@shared/utils/logger.server';

let currentVersion = 0;
type VersionListener = (version: number) => void;
const listeners = new Set<VersionListener>();

/**
 * Increment the settings version and notify all connected clients.
 * Should be called whenever settings are updated in the database.
 */
export function updateVersion(): void {
	currentVersion++;
	// Notify all SSE listeners
	listeners.forEach((listener) => {
		try {
			listener(currentVersion);
		} catch (error) {
			logger.error('Error notifying settings listener:', error);
		}
	});
}

/**
 * Subscribe to settings changes for real-time notifications.
 * Used by SSE endpoint to push updates to connected clients.
 * @param listener Callback function that receives the new version number
 * @returns Unsubscribe function
 */
export function subscribeToSettingsChanges(listener: VersionListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
