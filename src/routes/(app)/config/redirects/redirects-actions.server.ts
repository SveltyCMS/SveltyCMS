/**
 * @file src/routes/(app)/config/redirects/redirects.remote.ts
 * @description Redirect Manager Remote Functions.
 * Wraps redirects.server.ts for use as SvelteKit actions.
 */

export const saveRedirect = async (data: any) => {
  const { saveRedirect: fn } = await import("./redirects.server");
  const { getRequestEvent } = await import("$app/server");
  return fn(getRequestEvent().locals as App.Locals, data);
};

export const deleteRedirect = async (data: any) => {
  const { deleteRedirect: fn } = await import("./redirects.server");
  const { getRequestEvent } = await import("$app/server");
  return fn(getRequestEvent().locals as App.Locals, data);
};
