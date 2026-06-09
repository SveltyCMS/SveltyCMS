/**
 * @file src/routes/(app)/config/queue/queue.remote.ts
 * @description Queue management remote functions for client-side actions.
 */

import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

function requireUser() {
  const event = getRequestEvent();
  if (!event.locals.user) {
    throw error(401, "Unauthorized");
  }
}

export const retryJob = command("unchecked", async (jobId: string) => {
  requireUser();
  const { retryJob: fn } = await import("./queue-actions.server");
  return fn(jobId);
});

export const deleteJob = command("unchecked", async (jobId: string) => {
  requireUser();
  const { deleteJob: fn } = await import("./queue-actions.server");
  return fn(jobId);
});

export const clearCompleted = command("unchecked", async (_input: Record<string, never>) => {
  requireUser();
  const { clearCompleted: fn } = await import("./queue-actions.server");
  return fn();
});
