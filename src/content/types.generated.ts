/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "documentation" | "pricing" | "projects" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  documentation: CollectionEntry & {
    title: string;
    slug: string;
    content: string;
    category: string;
    order: string;
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
