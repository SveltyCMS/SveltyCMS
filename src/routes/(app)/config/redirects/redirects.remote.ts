/**
 * @file src/routes/(app)/config/redirects/redirects.remote.ts
 * @description Redirect Manager Remote Functions — SvelteKit command wrappers.
 *
 * ### Features:
 * - saveRedirect — upsert a redirect rule
 * - deleteRedirect — delete a redirect rule
 *
 * @remarks All exports are SvelteKit remote functions (command wrappers).
 */

import { command } from "$app/server";

export const saveRedirect = command(
  "unchecked",
  async (rule: {
    id?: string;
    from: string;
    to: string;
    type: number;
    active: boolean;
    isRegex: boolean;
  }) => {
    const { saveRedirect: fn } = await import("./redirects.server");
    const { getRequestEvent } = await import("$app/server");
    const event = getRequestEvent();
    return fn(event.locals as App.Locals, rule);
  },
);

export const deleteRedirect = command("unchecked", async (id: string) => {
  const { deleteRedirect: fn } = await import("./redirects.server");
  const { getRequestEvent } = await import("$app/server");
  const event = getRequestEvent();
  return fn(event.locals as App.Locals, id);
});
