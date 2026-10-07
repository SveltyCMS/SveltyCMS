/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes =
  | "authors"
  | "categories"
  | "documentation"
  | "features"
  | "posts"
  | "pricing"
  | "projects"
  | (string & {});

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
  documentation: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    category: string;
    order: string;
  };
  features: CollectionEntry & {
    name: string;
    icon: string;
    description: string;
    screenshot: string;
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
  pricing: CollectionEntry & {
    name: string;
    price: string;
    currency: string;
    interval: string;
    features: string;
    highlighted: string;
  };
  projects: CollectionEntry & {
    title: string;
    slug: string;
    description: string;
    client: string;
    images: string;
    testimonial: string;
  };
}
/* AUTOGEN_END: ContentTypes */
