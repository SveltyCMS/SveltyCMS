/**
 * @file src/routes/(app)/config/redirects/redirects.remote.ts
 * @description Redirect management remote functions for client-side actions.
 */

import { command, getRequestEvent } from "$app/server";

export const saveRedirect = command("unchecked", async (data: any) => {
  const { saveRedirect: fn } = await import("./redirects.server");
  return fn(getRequestEvent().locals as App.Locals, data);
});

export const deleteRedirect = command("unchecked", async (id: string) => {
  const { deleteRedirect: fn } = await import("./redirects.server");
  return fn(getRequestEvent().locals as App.Locals, id);
});
