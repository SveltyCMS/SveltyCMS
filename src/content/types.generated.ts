/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "test_collection" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  test_collection: CollectionEntry & { title: string; content: string };
}
/* AUTOGEN_END: ContentTypes */
