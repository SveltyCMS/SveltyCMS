/**
 * @file src/content/types.generated.ts
 * @description
 * Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry, DatabaseId, ISODateString } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "Authors" | "Categories" | "Posts" | (string & {});

export interface CollectionMap {
  Authors: CollectionEntry & { name: string; email: string; bio: string; avatar: string };
  Categories: CollectionEntry & { name: string; slug: string; description: string };
  Posts: CollectionEntry & {
    title: string;
    slug: string;
    author: DatabaseId;
    categories: DatabaseId;
    publishedDate: ISODateString;
    content: string;
    seo: string;
  };
}
/* AUTOGEN_END: ContentTypes */
