/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "Authors" | "Categories" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  Authors: CollectionEntry & { name: string; email: string; bio: string; avatar: string };
  Categories: CollectionEntry & { name: string; slug: string; description: string };
}
/* AUTOGEN_END: ContentTypes */
