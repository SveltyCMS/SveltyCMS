/**
 * @file src/utils/statusToggle.ts
 * @description Hardened status toggle operations with concurrency protection.
 *
 * ### Hardening (audit 2026-07):
 * - Concurrency protection: pendingToggles Set prevents rapid double-click API spam
 * - Type safety: explicit StatusType typing on newStatus computation
 * - Error handling: try/finally ensures lock is always released
 *
 * Utility functions for toggling entry status between publish and unpublish.
 */

import type { StatusType } from "@src/content/types";

export interface StatusToggleOptions {
  collectionId: string;
  currentStatus: StatusType;
  entryId?: string;
  onError?: (error: string) => void;
  onSuccess?: (newStatus: StatusType) => void;
}

// 🛡️ Track in-flight operations to prevent concurrent API calls for the same entry
const pendingToggles = new Set<string>();

/**
 * Toggle entry status between publish/unpublish with race-condition protection.
 */
export async function toggleEntryStatus(options: StatusToggleOptions): Promise<{
  success: boolean;
  newStatus?: StatusType;
  error?: string;
}> {
  const { collectionId, entryId, currentStatus, onSuccess, onError } = options;

  // 1. Concurrency Protection: Generate unique ID for this specific entry
  const lockId = `${collectionId}:${entryId || "new"}`;
  if (pendingToggles.has(lockId)) {
    return { success: false, error: "Operation already in progress." };
  }

  const nextStatus: StatusType = currentStatus === "publish" ? "unpublish" : "publish";

  // If entryId exists, perform API update
  if (entryId) {
    pendingToggles.add(lockId);
    try {
      const { updateEntryStatus } = await import("@src/utils/api");
      const result = await updateEntryStatus(collectionId, entryId, nextStatus);

      if (result.success) {
        onSuccess?.(nextStatus);
        return { success: true, newStatus: nextStatus };
      }

      const errMsg = result.error ?? `Failed to ${nextStatus} entry.`;
      onError?.(errMsg);
      return { success: false, error: errMsg };
    } catch (e) {
      const errorMsg = `Error ${nextStatus === "publish" ? "publishing" : "unpublishing"} entry: ${(e as Error).message}`;
      onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      pendingToggles.delete(lockId);
    }
  }

  // New entry logic (Atomic update without API)
  onSuccess?.(nextStatus);
  return { success: true, newStatus: nextStatus };
}

/**
 * Get initial publish status based on mode and state hierarchy.
 */
export function getInitialPublishStatus(
  mode: string,
  collectionStatus?: StatusType,
  entryStatus?: StatusType,
): boolean {
  // Coalesce status with clear priority: Entry > Collection > Default
  const status =
    mode === "create"
      ? (collectionStatus ?? "unpublish")
      : (entryStatus ?? collectionStatus ?? "unpublish");

  return status === "publish";
}
