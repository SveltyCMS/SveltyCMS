/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.remote.ts
 * @description Collection Builder Remote Functions — mutating `command` wrappers.
 *
 * Writes must be commands (not queries) so they are never GET-cached and always
 * post a body. Server logic lives in collectionbuilder.server.ts.
 */

import { command, getRequestEvent } from "$app/server";

export const saveContentStructure = command(
  "unchecked",
  async (operations: import("@src/content/types").ContentNodeOperation[]) => {
    const { saveContentStructure: fn } = await import("./collectionbuilder.server");
    return fn(getRequestEvent(), operations);
  },
);

export const deleteContentNodes = command("unchecked", async (ids: string[]) => {
  const { deleteContentNodes: fn } = await import("./collectionbuilder.server");
  return fn(getRequestEvent(), ids);
});

export const installPreset = command("unchecked", async (presetId: string) => {
  const { installPreset: fn } = await import("./collectionbuilder.server");
  return fn(getRequestEvent(), presetId);
});

export const installTemplateCollections = command("unchecked", async (presetId: string) => {
  const { installTemplateCollections: fn } = await import("./collectionbuilder.server");
  return fn(getRequestEvent(), presetId);
});
