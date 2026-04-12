/**
 * @file src/content/types.generated.ts
 * @description
 * Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = "Authors" | "Categories" | "Posts" | "test_posts" | (string & {});

export interface CollectionMap {
  Authors: { name: string; email: string; bio: string; avatar: string };
  Categories: { name: string; slug: string; description: string };
  Posts: {
    title: string;
    slug: string;
    author: string;
    categories: string;
    publishedDate: string;
    content: string;
    seo: string;
  };
  test_posts: { Title: string; Content: string; Status: string };
}
/* AUTOGEN_END: ContentTypes */
