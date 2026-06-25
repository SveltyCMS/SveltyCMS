/**
 * @file src/plugins/smart-importer/known-mappings.ts
 * @description Default field mappings per source platform for wizard and CLI.
 */

export interface KnownFieldMapping {
  source: string;
  target: string;
  confidence: number;
  type: string;
}

/** Heuristic source→target mappings used when AI analysis is unavailable */
export const KNOWN_MAPPINGS: Record<string, KnownFieldMapping[]> = {
  wordpress: [
    { source: "post_title", target: "title", confidence: 95, type: "text" },
    {
      source: "content:encoded",
      target: "content",
      confidence: 90,
      type: "richtext",
    },
    {
      source: "excerpt:encoded",
      target: "excerpt",
      confidence: 85,
      type: "text",
    },
    { source: "wp:post_name", target: "slug", confidence: 90, type: "text" },
    { source: "wp:status", target: "status", confidence: 85, type: "select" },
    {
      source: "wp:post_date",
      target: "createdAt",
      confidence: 90,
      type: "date",
    },
    {
      source: "wp:post_modified",
      target: "updatedAt",
      confidence: 90,
      type: "date",
    },
    { source: "dc:creator", target: "author", confidence: 75, type: "text" },
    {
      source: "wp:post_parent",
      target: "parentId",
      confidence: 70,
      type: "relation",
    },
    {
      source: "wp:menu_order",
      target: "order",
      confidence: 70,
      type: "number",
    },
    {
      source: "_thumbnail_id",
      target: "featuredImage",
      confidence: 80,
      type: "media",
    },
    {
      source: "category",
      target: "categories",
      confidence: 85,
      type: "taxonomy",
    },
    { source: "post_tag", target: "tags", confidence: 85, type: "taxonomy" },
  ],
  drupal: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "body", target: "content", confidence: 90, type: "richtext" },
    {
      source: "field_summary",
      target: "excerpt",
      confidence: 80,
      type: "text",
    },
    { source: "path", target: "slug", confidence: 85, type: "text" },
    { source: "status", target: "status", confidence: 80, type: "select" },
    { source: "created", target: "createdAt", confidence: 90, type: "date" },
    { source: "changed", target: "updatedAt", confidence: 90, type: "date" },
    { source: "uid", target: "author", confidence: 75, type: "text" },
    { source: "langcode", target: "language", confidence: 80, type: "text" },
    { source: "field_tags", target: "tags", confidence: 85, type: "taxonomy" },
    {
      source: "field_category",
      target: "categories",
      confidence: 85,
      type: "taxonomy",
    },
    {
      source: "field_image",
      target: "featuredImage",
      confidence: 80,
      type: "media",
    },
    {
      source: "field_media",
      target: "featuredImage",
      confidence: 75,
      type: "media",
    },
  ],
  strapi: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "content", target: "content", confidence: 90, type: "richtext" },
    { source: "description", target: "excerpt", confidence: 80, type: "text" },
    { source: "slug", target: "slug", confidence: 90, type: "text" },
    { source: "created_at", target: "createdAt", confidence: 90, type: "date" },
    { source: "updated_at", target: "updatedAt", confidence: 90, type: "date" },
    {
      source: "published_at",
      target: "publishedAt",
      confidence: 85,
      type: "date",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
  ],
  directus: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "content", target: "content", confidence: 90, type: "richtext" },
    { source: "description", target: "excerpt", confidence: 80, type: "text" },
    { source: "slug", target: "slug", confidence: 90, type: "text" },
    { source: "status", target: "status", confidence: 85, type: "select" },
    {
      source: "date_created",
      target: "createdAt",
      confidence: 90,
      type: "date",
    },
    {
      source: "date_updated",
      target: "updatedAt",
      confidence: 90,
      type: "date",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
  ],
  sveltycms: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "content", target: "content", confidence: 90, type: "richtext" },
    { source: "slug", target: "slug", confidence: 90, type: "text" },
    { source: "status", target: "status", confidence: 85, type: "select" },
    { source: "createdAt", target: "createdAt", confidence: 90, type: "date" },
    { source: "updatedAt", target: "updatedAt", confidence: 90, type: "date" },
  ],
  shopify: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    {
      source: "body_html",
      target: "content",
      confidence: 85,
      type: "richtext",
    },
    { source: "handle", target: "slug", confidence: 90, type: "text" },
    { source: "vendor", target: "vendor", confidence: 85, type: "text" },
    {
      source: "product_type",
      target: "productType",
      confidence: 85,
      type: "text",
    },
    { source: "price", target: "price", confidence: 90, type: "number" },
    { source: "sku", target: "sku", confidence: 90, type: "text" },
    {
      source: "inventory_quantity",
      target: "inventory",
      confidence: 85,
      type: "number",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
    { source: "tags", target: "tags", confidence: 85, type: "taxonomy" },
  ],
};

/** Returns platform default mappings (empty array when unknown) */
export function getKnownMappingsForFormat(format: string): KnownFieldMapping[] {
  return KNOWN_MAPPINGS[format.toLowerCase()] ?? [];
}
