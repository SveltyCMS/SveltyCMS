/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "Authors" | "BenchmarkStable" | "Categories" | "Posts" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  Authors: CollectionEntry & { name: string; bio: string; avatar: string | string[] };
  BenchmarkStable: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    count: number;
    publishDate: ISODateString;
  };
  Categories: CollectionEntry & { name: string; slug: string; description: string };
  Posts: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    category: DatabaseId;
    author: DatabaseId;
    status: string;
    publishDate: ISODateString;
    seo: string;
  };
}
/* AUTOGEN_END: ContentTypes */
