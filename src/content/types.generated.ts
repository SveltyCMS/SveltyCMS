/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = 'Names' | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  Names: CollectionEntry & { first_name: string; last_name: string }
}
/* AUTOGEN_END: ContentTypes */
