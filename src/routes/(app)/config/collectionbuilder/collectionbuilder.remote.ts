/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.remote.ts
 * @description Collection Builder Remote Functions — SvelteKit query wrappers for typed
 * structure operations without JSON double-serialization.
 *
 * All exports MUST be SvelteKit remote functions (command/query wrappers).
 * Server logic is in collectionbuilder.server.ts.
 */

import { query } from "$app/server";

export const saveContentStructure = query(
  "unchecked",
  async (operations: import("@src/content/types").ContentNodeOperation[]) => {
    const { saveContentStructure: fn } = await import("./collectionbuilder.server");
    const event = (await import("$app/server")).getRequestEvent();
    return fn(event, operations);
  },
);

export const deleteContentNodes = query("unchecked", async (ids: string[]) => {
  const { deleteContentNodes: fn } = await import("./collectionbuilder.server");
  const event = (await import("$app/server")).getRequestEvent();
  return fn(event, ids);
});

export const installPreset = query("unchecked", async (presetId: string) => {
  const { installPreset: fn } = await import("./collectionbuilder.server");
  const event = (await import("$app/server")).getRequestEvent();
  return fn(event, presetId);
});

export const installTemplateCollections = query("unchecked", async (presetId: string) => {
  const { installTemplateCollections: fn } = await import("./collectionbuilder.server");
  const event = (await import("$app/server")).getRequestEvent();
  return fn(event, presetId);
});
