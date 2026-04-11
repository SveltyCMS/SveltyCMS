/**
 * @file src/utils/server/settings-sync.ts
 * @description Settings change notification system using Server-Sent Events
 *
 * When settings are updated in the database, this broadcasts the change
 * to all connected clients via SSE for instant UI updates.
 */

import { logger } from "@utils/logger.server";

let syncId = 0;
type SyncListener = (id: number) => void;
const listeners = new Set<SyncListener>();

/**
 * Trigger a settings synchronization event to notify all connected clients.
 * Should be called whenever settings are updated in the database.
 */
export function triggerSync(): void {
  syncId++;
  // Notify all SSE listeners
  listeners.forEach((listener) => {
    try {
      listener(syncId);
    } catch (error) {
      logger.error("Error notifying settings sync listener:", error);
    }
  });
}

/**
 * Subscribe to settings sync events for real-time notifications.
 * Used by SSE endpoint to push updates to connected clients.
 * @param listener Callback function that receives the new sync ID
 * @returns Unsubscribe function
 */
export function onSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
