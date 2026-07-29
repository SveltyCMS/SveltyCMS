/**
 * @file src/routes/(app)/config/queue/queue.remote.ts
 * @description Queue management remote functions for client-side actions.
 *
 * ### Features:
 * - Admin-only mutations (retry / delete / clear completed)
 */

import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

function requireAdmin() {
  const event = getRequestEvent();
  if (!event.locals.user) {
    throw error(401, "Unauthorized");
  }
  if (!event.locals.isAdmin) {
    throw error(403, "Admin privileges required");
  }
}

export const retryJob = command("unchecked", async (jobId: string) => {
  requireAdmin();
  const { retryJob: fn } = await import("./queue-actions.server");
  return fn(jobId);
});

export const deleteJob = command("unchecked", async (jobId: string) => {
  requireAdmin();
  const { deleteJob: fn } = await import("./queue-actions.server");
  return fn(jobId);
});

export const clearCompleted = command("unchecked", async (_input: Record<string, never>) => {
  requireAdmin();
  const { clearCompleted: fn } = await import("./queue-actions.server");
  return fn();
});
