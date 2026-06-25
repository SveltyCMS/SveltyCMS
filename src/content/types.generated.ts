/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry, DatabaseId } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "authors" | "categories" | "posts" | "test_collection" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  authors: CollectionEntry & {
    name: string;
    bio: string;
    avatar: string | string[];
    email: string;
  };
  categories: CollectionEntry & {
    name: string;
    slug: string;
    description: string;
  };
  posts: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    featuredImage: string | string[];
    author: DatabaseId;
    categories: DatabaseId;
    tags: string;
    seo: string;
  };
  test_collection: CollectionEntry & { title: string; content: string };
}
/* AUTOGEN_END: ContentTypes */
