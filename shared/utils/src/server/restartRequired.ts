/**
 * @file shared/utils/src/server/restartRequired.ts
 * @description Utility to manage server restart state.
 * Tracks whether a server restart is needed after configuration changes
 *
 * ### Features
 * - Simple boolean flag management
 * - Thread-safe operations
 */

let restartNeeded = false;

/**
 * Check if a server restart is needed
 * @returns {boolean} True if restart is needed
 */
export function isRestartNeeded(): boolean {
	return restartNeeded;
}

/**
 * Set whether a server restart is needed
 * @param {boolean} needed - Whether restart is needed
 */
export function setRestartNeeded(needed: boolean): void {
	restartNeeded = needed;
}
