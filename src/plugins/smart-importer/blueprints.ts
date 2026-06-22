/**
 * @file src/plugins/smart-importer/blueprints.ts
 * @description Import templates / blueprints — reusable full migration configurations.
 *
 * Blueprints go beyond simple field mappings by including:
 * - Platform-specific parser configuration
 * - Content type filters
 * - Transform rules
 * - Media handling strategy
 * - Post-import hooks
 * - Validation rules
 *
 * Blueprints can be saved, loaded, shared via marketplace, and applied via CLI.
 */

import type { FieldMapping } from "./types";

export interface ImportBlueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  sourcePlatform: string;
  targetCollection: string;
  contentTypes: string[];
  fieldMappings: FieldMapping[];
  conflictStrategy: "skip" | "overwrite" | "merge" | "keep_both";
  mediaStrategy: "download" | "reference" | "skip" | "optimize";
  mediaConfig?: {
    maxWidth: number;
    maxHeight: number;
    convertTo: "webp" | "avif" | "original";
    quality: number;
  };
  transformRules?: Array<{
    field: string;
    rule: string; // regex, dateFormat, numberFormat, etc.
    params: Record<string, any>;
  }>;
  postImportHooks?: string[]; // Hook IDs to run after import
  validateRules?: Array<{
    field: string;
    rule: string; // required, minLength, maxLength, pattern, email, url
    params: Record<string, any>;
    message: string;
  }>;
  metadata?: {
    author: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    usageCount: number;
    rating: number;
  };
}

// ============================================================================
// Built-in Blueprints
// ============================================================================

export const BUILT_IN_BLUEPRINTS: ImportBlueprint[] = [
  {
    id: "wp-blog-to-posts",
    name: "WordPress Blog → Posts",
    description:
      "Standard WordPress blog import: posts, categories, tags, featured images, and comments.",
    version: "2.1.0",
    sourcePlatform: "wordpress",
    targetCollection: "posts",
    contentTypes: ["post"],
    fieldMappings: [
      {
        sourceField: "post_title",
        targetField: "title",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "content:encoded",
        targetField: "content",
        widgetType: "richtext",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "excerpt:encoded",
        targetField: "excerpt",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "wp:post_name",
        targetField: "slug",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "wp:post_date",
        targetField: "createdAt",
        widgetType: "date",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "wp:post_modified",
        targetField: "updatedAt",
        widgetType: "date",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "dc:creator",
        targetField: "author",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "category",
        targetField: "categories",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "post_tag",
        targetField: "tags",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "_thumbnail_id",
        targetField: "featuredImage",
        widgetType: "media",
        confidence: "high",
        action: "map",
      },
    ],
    conflictStrategy: "skip",
    mediaStrategy: "optimize",
    mediaConfig: { maxWidth: 1920, maxHeight: 1080, convertTo: "webp", quality: 80 },
    metadata: {
      author: "SveltyCMS",
      tags: ["wordpress", "blog"],
      createdAt: "2026-06-22",
      updatedAt: "2026-06-22",
      usageCount: 0,
      rating: 0,
    },
  },
  {
    id: "drupal-articles-to-articles",
    name: "Drupal Articles → Articles",
    description: "Standard Drupal article import with taxonomy resolution, media, and revisions.",
    version: "2.1.0",
    sourcePlatform: "drupal",
    targetCollection: "articles",
    contentTypes: ["article"],
    fieldMappings: [
      {
        sourceField: "title",
        targetField: "title",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "body",
        targetField: "content",
        widgetType: "richtext",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "field_summary",
        targetField: "excerpt",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "path",
        targetField: "slug",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "created",
        targetField: "createdAt",
        widgetType: "date",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "changed",
        targetField: "updatedAt",
        widgetType: "date",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "uid",
        targetField: "author",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "langcode",
        targetField: "language",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "field_tags",
        targetField: "tags",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "field_image",
        targetField: "featuredImage",
        widgetType: "media",
        confidence: "high",
        action: "map",
      },
    ],
    conflictStrategy: "skip",
    mediaStrategy: "optimize",
    metadata: {
      author: "SveltyCMS",
      tags: ["drupal", "articles"],
      createdAt: "2026-06-22",
      updatedAt: "2026-06-22",
      usageCount: 0,
      rating: 0,
    },
  },
  {
    id: "shopify-products",
    name: "Shopify Products → Products",
    description: "Shopify product import with variants, SKU, pricing, and inventory.",
    version: "2.1.0",
    sourcePlatform: "shopify",
    targetCollection: "products",
    contentTypes: ["products"],
    fieldMappings: [
      {
        sourceField: "title",
        targetField: "title",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "body_html",
        targetField: "content",
        widgetType: "richtext",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "handle",
        targetField: "slug",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "price",
        targetField: "price",
        widgetType: "number",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "sku",
        targetField: "sku",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "vendor",
        targetField: "vendor",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "product_type",
        targetField: "productType",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "tags",
        targetField: "tags",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "image",
        targetField: "featuredImage",
        widgetType: "media",
        confidence: "high",
        action: "map",
      },
    ],
    conflictStrategy: "overwrite",
    mediaStrategy: "optimize",
    metadata: {
      author: "SveltyCMS",
      tags: ["shopify", "ecommerce"],
      createdAt: "2026-06-22",
      updatedAt: "2026-06-22",
      usageCount: 0,
      rating: 0,
    },
  },
  {
    id: "csv-to-collection",
    name: "CSV → Collection",
    description: "Generic CSV/TSV spreadsheet import with auto-detected columns and types.",
    version: "2.1.0",
    sourcePlatform: "csv",
    targetCollection: "imported_data",
    contentTypes: [],
    fieldMappings: [],
    conflictStrategy: "skip",
    mediaStrategy: "reference",
    metadata: {
      author: "SveltyCMS",
      tags: ["csv", "spreadsheet"],
      createdAt: "2026-06-22",
      updatedAt: "2026-06-22",
      usageCount: 0,
      rating: 0,
    },
  },
  {
    id: "markdown-to-pages",
    name: "Markdown Files → Pages",
    description: "Static site Markdown import with YAML frontmatter parsing.",
    version: "2.1.0",
    sourcePlatform: "markdown",
    targetCollection: "pages",
    contentTypes: [],
    fieldMappings: [
      {
        sourceField: "title",
        targetField: "title",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "date",
        targetField: "createdAt",
        widgetType: "date",
        confidence: "high",
        action: "transform",
      },
      {
        sourceField: "author",
        targetField: "author",
        widgetType: "text",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "tags",
        targetField: "tags",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "categories",
        targetField: "categories",
        widgetType: "tags",
        confidence: "high",
        action: "map",
      },
      {
        sourceField: "image",
        targetField: "featuredImage",
        widgetType: "media",
        confidence: "high",
        action: "map",
      },
    ],
    conflictStrategy: "skip",
    mediaStrategy: "reference",
    metadata: {
      author: "SveltyCMS",
      tags: ["markdown", "static"],
      createdAt: "2026-06-22",
      updatedAt: "2026-06-22",
      usageCount: 0,
      rating: 0,
    },
  },
];

// ============================================================================
// Blueprint Registry
// ============================================================================

class BlueprintRegistry {
  private blueprints = new Map<string, ImportBlueprint>();

  constructor() {
    for (const bp of BUILT_IN_BLUEPRINTS) {
      this.blueprints.set(bp.id, bp);
    }
  }

  get(id: string): ImportBlueprint | undefined {
    return this.blueprints.get(id);
  }

  getAll(): ImportBlueprint[] {
    return [...this.blueprints.values()];
  }

  getByPlatform(platform: string): ImportBlueprint[] {
    return this.getAll().filter((bp) => bp.sourcePlatform === platform);
  }

  register(blueprint: ImportBlueprint): void {
    this.blueprints.set(blueprint.id, blueprint);
  }

  remove(id: string): boolean {
    return this.blueprints.delete(id);
  }
}

export const blueprintRegistry = new BlueprintRegistry();
