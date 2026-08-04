/**
 * @file src/routes/(app)/plugin/+page.server.ts
 * @description Plugin pages index — redirects to the first available page.
 */

import { redirect } from "@sveltejs/kit";
import { pluginPageRegistry } from "@src/plugins/plugin-page-registry.svelte.ts";

export const load = async () => {
  const items = pluginPageRegistry.getNavItems();
  if (items.length > 0) {
    throw redirect(302, items[0]!.path);
  }
  throw redirect(302, "/config");
};
