/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.remote.ts
 * @description Collection Builder Remote Functions — mutating `command` wrappers.
 *
 * Writes must be commands (not queries) so they are never GET-cached and always
 * post a body. Server logic lives in collectionbuilder.server.ts.
 */

import { command, getRequestEvent, query } from "$app/server";
import type { SchemaIngestionInput } from "./schema-ingestion";

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

export const installTemplateCollections = command("unchecked", async (presetId: string) => {
  const { installTemplateCollections: fn } = await import("./collectionbuilder.server");
  return fn(getRequestEvent(), presetId);
});

/**
 * Read-only server function: reverse-engineer SQL DDL / JSON into a collection
 * schema. Parsing runs server-side so relations resolve against the live
 * collection list.
 */
export const ingestSchema = query("unchecked", async (input: SchemaIngestionInput) => {
  const { parseSchemaIngestion: fn } = await import("./collectionbuilder.server");
  return fn(getRequestEvent(), input);
});
