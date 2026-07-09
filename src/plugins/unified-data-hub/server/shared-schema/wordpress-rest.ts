/**
 * @file src/plugins/unified-data-hub/server/shared-schema/wordpress-rest.ts
 * @description WordPress REST API field mappings — shared with Smart Importer semantics.
 *
 * Federation uses live REST JSON (not WXR). Field names align with
 * smart-importer WordPress post/page mapping for consistency.
 *
 * Features:
 * - Default Articles/Categories/Tags virtual collection schemas
 * - Post type aware endpoint paths
 */

import type { VirtualFieldMapping } from "../../types";

/** WordPress REST v2 post shape (rendered fields) */
export const WORDPRESS_POST_FIELDS: VirtualFieldMapping[] = [
  { name: "title", label: "Title", sourceField: "title", type: "text" },
  { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
  { name: "status", label: "Status", sourceField: "status", type: "text" },
  { name: "content", label: "Content", sourceField: "content", type: "richtext" },
  { name: "excerpt", label: "Excerpt", sourceField: "excerpt", type: "text" },
  { name: "date", label: "Published", sourceField: "date", type: "date" },
  { name: "modified", label: "Modified", sourceField: "modified", type: "date" },
  { name: "author", label: "Author", sourceField: "author", type: "number" },
  { name: "featuredMedia", label: "Featured Media", sourceField: "featured_media", type: "number" },
];

export const WORDPRESS_CATEGORY_FIELDS: VirtualFieldMapping[] = [
  { name: "name", label: "Name", sourceField: "name", type: "text" },
  { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
  { name: "description", label: "Description", sourceField: "description", type: "text" },
  { name: "count", label: "Post Count", sourceField: "count", type: "number" },
];

export const WORDPRESS_TAG_FIELDS: VirtualFieldMapping[] = [
  { name: "name", label: "Name", sourceField: "name", type: "text" },
  { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
  { name: "description", label: "Description", sourceField: "description", type: "text" },
];

export type WordPressRestResource = "posts" | "pages" | "categories" | "tags" | "media";

export function getWordPressRestEndpoint(resource: WordPressRestResource): string {
  return `/wp-json/wp/v2/${resource}`;
}

export function getWordPressRestFields(resource: WordPressRestResource): VirtualFieldMapping[] {
  switch (resource) {
    case "categories":
      return WORDPRESS_CATEGORY_FIELDS;
    case "tags":
      return WORDPRESS_TAG_FIELDS;
    case "pages":
    case "posts":
    case "media":
    default:
      return WORDPRESS_POST_FIELDS;
  }
}

/**
 * Builds a virtual collection definition for WordPress REST federation.
 * Mirrors Smart Importer post type naming (Articles = posts, Pages = pages).
 */
export function buildWordPressVirtualCollection(
  resource: WordPressRestResource,
  connectorId: string,
  tenantId: string,
): {
  name: string;
  slug: string;
  connectorId: string;
  tenantId: string;
  source: { endpoint: string; platform: "wordpress" };
  fields: VirtualFieldMapping[];
} {
  const labels: Record<WordPressRestResource, { name: string; slug: string }> = {
    posts: { name: "Articles", slug: "wp-articles" },
    pages: { name: "Pages", slug: "wp-pages" },
    categories: { name: "Categories", slug: "wp-categories" },
    tags: { name: "Tags", slug: "wp-tags" },
    media: { name: "Media", slug: "wp-media" },
  };
  const meta = labels[resource];
  return {
    name: meta.name,
    slug: meta.slug,
    connectorId,
    tenantId,
    source: { endpoint: getWordPressRestEndpoint(resource), platform: "wordpress" },
    fields: getWordPressRestFields(resource),
  };
}
