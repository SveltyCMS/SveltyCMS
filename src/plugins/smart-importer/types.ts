/**
 * @file src/plugins/smart-importer/types.ts
 * @description Standardized data models for SveltyCMS Normalized Content (SNC).
 *
 * Provides a universal abstract intermediate structure for over 36+ traditional,
 * SaaS, and headless CMS platforms.
 *
 * ### Features:
 * - unified intermediate schema (SNC)
 * - platform-aware field mapping descriptors
 * - e-commerce variant model
 * - transactional ledger tracking
 */

// ============================================================================
// SNC — SveltyCMS Normalized Content
// ============================================================================

export interface SNCEnvelope {
  /** Source platform identifier (e.g., 'wordpress', 'drupal', 'contentful', 'shopify', etc.) */
  sourcePlatform:
    | "wordpress"
    | "drupal"
    | "joomla"
    | "typo3"
    | "magento"
    | "prestashop"
    | "opencart"
    | "october"
    | "contao"
    | "silverstripe"
    | "concrete"
    | "processwire"
    | "grav"
    | "bolt"
    | "expressionengine"
    | "backdrop"
    | "craft"
    | "statamic"
    | "pimcore"
    | "cockpit"
    | "shopify"
    | "wix"
    | "squarespace"
    | "webflow"
    | "hubspot"
    | "duda"
    | "tilda"
    | "strapi"
    | "payload"
    | "directus"
    | "sanity"
    | "contentful"
    | "storyblok"
    | "prismic"
    | "hygraph"
    | "contentstack"
    | "kontent"
    | "builder"
    | "dato"
    | "ghost"
    | "sveltycms";
  /** Source platform version */
  version: string;
  /** Unique transaction token for idempotency and rollback */
  transactionToken: string;
  /** Normalized entries */
  entries: SNCEntry[];
}

export interface SNCEntry {
  /** Original primary key, node ID, or UUID from source platform */
  externalId: string;
  title: string;
  slug: string;
  status: "published" | "draft" | "pending" | "archived";
  /** Compiled semantic HTML or Markdown string */
  content?: string;
  excerpt?: string;
  createdAt?: string;
  updatedAt?: string;
  authorName?: string;
  languageCode?: string;

  /** Hierarchical structural attributes */
  parentExternalId?: string;
  menuOrder?: number;

  /** Taxonomy mapping parameters */
  taxonomies: {
    vocabularies: string[];
    terms: Record<string, string[]>;
  };

  /** Complex unmapped parameters for AI mapping engines */
  rawCustomFields: Record<string, unknown>;

  /** E-Commerce specific schema additions */
  ecommerce?: {
    sku?: string;
    price: number;
    compareAtPrice?: number;
    inventoryQuantity: number;
    weight?: number;
    variants: ProductVariant[];
  };

  /** Remote asset binaries requiring local mirroring */
  assetsToMirror: {
    externalUrl: string;
    originalId: string;
    fieldTarget: string;
    altText?: string;
  }[];
}

export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  price: number;
  inventoryQuantity: number;
  options: { name: string; value: string }[];
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  widgetType: string;
  confidence: "high" | "medium" | "low";
  action: "map" | "merge" | "scaffold" | "ignore";
  reason?: string;
}

export interface LedgerRecord {
  _id: string;
  transactionToken: string;
  sourcePlatform: string;
  targetCollection: string;
  timestamp: string;
  importedCount: number;
  mirroredAssetPaths: string[];
}

/** Progress descriptor for real-time SSE/UI updates */
export interface MigrationProgress {
  current: number;
  total: number;
  currentItem: string;
  phase: "extracting" | "validating" | "processing" | "loading" | "completed";
}
