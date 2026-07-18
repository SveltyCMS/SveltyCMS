/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "OpenApiTarget" | "pages" | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  OpenApiTarget: CollectionEntry & { title: string };
  pages: CollectionEntry & {
    title: string;
    slug: string;
    pageType: "static" | "template";
    template: "homepage" | "default" | "search" | "product-detail";
    heroHeading: string;
    heroSubheading: string;
    body: string;
    ctaText: string;
    ctaHref: string;
    content: string;
    seo: string;
  };
}
/* AUTOGEN_END: ContentTypes */
