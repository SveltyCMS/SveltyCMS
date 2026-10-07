/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "authors" | "categories" | "pages" | "posts" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  authors: CollectionEntry & {
    name: string;
    bio: string;
    avatar: string;
    email: string;
  };
  categories: CollectionEntry & {
    name: string;
    slug: string;
    parent: string;
    description: string;
  };
  pages: CollectionEntry & {
    title: string;
    slug: string;
    pageType: string;
    template: string;
    heroHeading: string;
    heroSubheading: string;
    body: string;
    ctaText: string;
    ctaHref: string;
    content: string;
    seo: string;
  };
  posts: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    featuredImage: string;
    author: string;
    categories: string;
    tags: string;
    seo: string;
  };
}
/* AUTOGEN_END: ContentTypes */
