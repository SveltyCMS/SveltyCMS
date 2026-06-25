/**
 * @file src/plugins/smart-importer/parsers/php-cms.ts
 * @description Traditional PHP CMS parsers — Joomla, TYPO3, Craft CMS, Grav, ProcessWire, Concrete CMS, etc.
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";

// ============================================================================
// Joomla Database Export (JSON/CSV)
// ============================================================================

export function parseJoomlaExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.articles || raw.content || raw.data || (Array.isArray(raw) ? raw : [raw]);
    const entries: SNCEntry[] = [];

    for (const item of Array.isArray(items) ? items : [items]) {
      entries.push({
        externalId: String(item.id || ""),
        title: String(item.title || "Untitled"),
        slug: String(item.alias || "").toLowerCase(),
        status: item.state === "1" || item.state === 1 ? "published" : "draft",
        content: String(item.introtext || "") + String(item.fulltext || ""),
        excerpt: String(item.introtext || item.metadesc || ""),
        createdAt: item.created || item.publish_up || nowISODateString(),
        updatedAt: item.modified || nowISODateString(),
        authorName: String(item.author || item.created_by_alias || ""),
        languageCode: String(item.language || "*"),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror: item.images ? extractJoomlaImages(item.images, String(item.id)) : [],
      });
    }

    return {
      sourcePlatform: "joomla",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function extractJoomlaImages(imagesJson: string, parentId: string): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  try {
    const parsed = typeof imagesJson === "string" ? JSON.parse(imagesJson) : imagesJson;
    if (parsed.image_intro)
      assets.push({
        externalUrl: parsed.image_intro,
        originalId: `${parentId}_intro`,
        fieldTarget: "featuredImage",
        altText: parsed.image_intro_alt || "",
      });
    if (parsed.image_fulltext)
      assets.push({
        externalUrl: parsed.image_fulltext,
        originalId: `${parentId}_full`,
        fieldTarget: "contentImage",
        altText: parsed.image_fulltext_alt || "",
      });
  } catch {
    /* images not JSON-parsable */
  }
  return assets;
}

// ============================================================================
// TYPO3 tt_content Export
// ============================================================================

export function parseTypo3Export(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.pages || raw.tt_content || raw.data || (Array.isArray(raw) ? raw : [raw]);
    const entries: SNCEntry[] = [];

    for (const item of Array.isArray(items) ? items : [items]) {
      entries.push({
        externalId: String(item.uid || item.id || ""),
        title: String(item.title || item.header || `TYPO3 ${item.uid || ""}`),
        slug: String(item.slug || item.title || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        status: item.hidden ? "draft" : "published",
        content: String(item.bodytext || ""),
        createdAt: item.crdate ? new Date(item.crdate * 1000).toISOString() : nowISODateString(),
        updatedAt: item.tstamp ? new Date(item.tstamp * 1000).toISOString() : nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {
          ...item,
          _ttContent: [item],
          _colPos: item.colPos,
          _CType: item.CType,
        },
        assetsToMirror:
          item.media || item.image
            ? [
                {
                  externalUrl: String(item.media || item.image),
                  originalId: String(item.uid),
                  fieldTarget: "featuredImage",
                },
              ]
            : [],
      });
    }

    return {
      sourcePlatform: "typo3",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Craft CMS JSON Export
// ============================================================================

export function parseCraftExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.entries || raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const fields = item.fields || item;
      const id = String(item.id || item.uid || "");

      entries.push({
        externalId: id,
        title: String(item.title || fields.title || "Untitled"),
        slug: String(item.slug || item.uri || "").replace(/^\/+/, ""),
        status: item.status === "enabled" || item.enabled ? "published" : "draft",
        content: String(fields.body || fields.richText || fields.text || ""),
        excerpt: String(fields.summary || fields.excerpt || ""),
        createdAt: item.dateCreated || item.postDate || nowISODateString(),
        updatedAt: item.dateUpdated || nowISODateString(),
        authorName: String(item.author?.username || item.author || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {
          ...item,
          _sectionId: item.sectionId,
          _typeId: item.typeId,
          _matrixFields: fields.matrix || [],
        },
        assetsToMirror: extractCraftAssets(fields, id),
      });
    }

    return {
      sourcePlatform: "craft",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function extractCraftAssets(fields: any, parentId: string): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (
      val &&
      typeof val === "object" &&
      (val as any).url &&
      (key.includes("image") || key.includes("asset") || key.includes("photo"))
    ) {
      assets.push({
        externalUrl: (val as any).url,
        originalId: `${parentId}_${key}`,
        fieldTarget: key,
        altText: (val as any).title || "",
      });
    }
  }
  return assets;
}

// ============================================================================
// Grav (flat-file CMS) Export
// ============================================================================

export function parseGravExport(jsonOrYaml: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonOrYaml);
    const items = raw.pages || raw.data || (Array.isArray(raw) ? raw : [raw]);
    const entries: SNCEntry[] = [];

    for (const item of Array.isArray(items) ? items : [items]) {
      const header = item.header || item.frontmatter || {};
      entries.push({
        externalId: String(item.slug || item.route || item.id || ""),
        title: String(header.title || item.title || "Untitled"),
        slug: String(item.slug || "").replace(/^\/+/, ""),
        status: header.published !== false ? "published" : "draft",
        content: String(item.content || item.markdown || ""),
        excerpt: String(header.summary || header.description || ""),
        createdAt: header.date || item.modified || nowISODateString(),
        updatedAt: item.modified || nowISODateString(),
        authorName: String(header.author || ""),
        taxonomies: {
          vocabularies: ["tags", "categories"],
          terms: {
            tags: Array.isArray(header.taxonomy?.tag) ? header.taxonomy.tag : header.tags || [],
            categories: Array.isArray(header.taxonomy?.category)
              ? header.taxonomy.category
              : header.categories || [],
          },
        },
        rawCustomFields: {
          ...header,
          _route: item.route,
          _template: item.template,
        },
        assetsToMirror: header.image
          ? [
              {
                externalUrl: String(header.image),
                originalId: String(item.slug),
                fieldTarget: "featuredImage",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "grav",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Generic PHP CMS JSON (ProcessWire, Concrete, October, Bolt, ExpressionEngine, etc.)
// ============================================================================

export function parseGenericPHPCMS(
  jsonText: string,
  platform: string,
  token: string,
): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items =
      raw.data ||
      raw.items ||
      raw.entries ||
      raw.pages ||
      raw.records ||
      (Array.isArray(raw) ? raw : [raw]);
    const entries: SNCEntry[] = (Array.isArray(items) ? items : [items]).map(
      (item: any, idx: number) => ({
        externalId: String(item.id || item._id || item.uid || `${platform}_${idx}`),
        title: String(item.title || item.name || item.label || item.headline || "Untitled"),
        slug: String(item.slug || item.url || item.path || item.alias || "")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/^\/+/, ""),
        status:
          item.status === "published" || item.status === "1" || item.status === 1 || item.published
            ? "published"
            : "draft",
        content: String(item.content || item.body || item.text || item.description || ""),
        excerpt: String(item.summary || item.excerpt || item.description || ""),
        createdAt:
          item.created_at || item.created || item.createdAt || item.date || nowISODateString(),
        updatedAt:
          item.updated_at || item.updated || item.updatedAt || item.modified || nowISODateString(),
        authorName: String(item.author || item.created_by || item.user || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror: [] as SNCEntry["assetsToMirror"],
      }),
    );

    return {
      sourcePlatform: platform as any,
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}
