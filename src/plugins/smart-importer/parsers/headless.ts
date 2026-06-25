/**
 * @file src/plugins/smart-importer/parsers/headless.ts
 * @description Headless CMS parsers — Contentful, Sanity, Strapi, Directus, Payload, Storyblok, Prismic.
 *
 * Each parser handles the specific JSON export format of its platform,
 * extracting structured content, media references, and taxonomies.
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";

// ============================================================================
// Contentful Space Export JSON
// ============================================================================

export function parseContentfulExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const entries: SNCEntry[] = [];
    const assets = new Map<string, { url: string; title: string }>();

    // Index assets first
    for (const asset of raw.assets || []) {
      const file = asset.fields?.file?.["en-US"] || asset.fields?.file || {};
      const url = file.url || "";
      if (url && asset.sys?.id) {
        assets.set(asset.sys.id, {
          url: url.startsWith("//") ? `https:${url}` : url,
          title: asset.fields?.title?.["en-US"] || asset.fields?.title || "",
        });
      }
    }

    // Parse entries
    for (const item of raw.entries || []) {
      const sys = item.sys || {};
      const fields = item.fields || {};
      const locale = raw.locales?.[0]?.code || "en-US";

      const entry: SNCEntry = {
        externalId: String(sys.id || ""),
        title: getLocalized(fields.title, locale) || "Untitled",
        slug: getLocalized(fields.slug, locale) || "",
        status: sys.publishedAt ? "published" : "draft",
        content: "",
        createdAt: sys.createdAt || nowISODateString(),
        updatedAt: sys.updatedAt || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {
          ...fields,
          _astContent: fields.body?.[locale] || fields.richText?.[locale],
          _contentTypeId: sys.contentType?.sys?.id,
        },
        assetsToMirror: [] as SNCEntry["assetsToMirror"],
      };

      // Resolve referenced assets
      for (const [key, value] of Object.entries(fields)) {
        const localized = value?.[locale] || value;
        if (localized?.sys?.type === "Link" && localized.sys.linkType === "Asset") {
          const asset = assets.get(localized.sys.id);
          if (asset) {
            entry.assetsToMirror.push({
              externalUrl: asset.url,
              originalId: localized.sys.id,
              fieldTarget: key,
              altText: asset.title,
            });
          }
        }
      }

      entries.push(entry);
    }

    return {
      sourcePlatform: "contentful",
      version: raw.version || "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Sanity NDJSON Export
// ============================================================================

export function parseSanityExport(ndjsonText: string, token: string): SNCEnvelope | null {
  try {
    const lines = ndjsonText.trim().split("\n");
    const entries: SNCEntry[] = [];
    const imageRefs = new Map<string, string>(); // _id → image URL pattern

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);
        if (!doc._id || doc._type === "system.metadata" || doc._type === "sanity.imageAsset")
          continue;

        // Store image asset references
        if (doc._type === "sanity.imageAsset" && doc.url) {
          imageRefs.set(doc._id, doc.url);
          continue;
        }

        entries.push({
          externalId: String(doc._id),
          title: String(doc.title || doc.name || doc.heading || doc._id),
          slug: String(doc.slug?.current || doc.slug || ""),
          status: doc._id?.startsWith("drafts.") ? "draft" : "published",
          content: "",
          createdAt: doc._createdAt || nowISODateString(),
          updatedAt: doc._updatedAt || nowISODateString(),
          taxonomies: {
            vocabularies: extractSanityTaxonomies(doc).vocabularies,
            terms: extractSanityTaxonomies(doc).terms,
          },
          rawCustomFields: {
            ...doc,
            _portableText: doc.body || doc.content || doc.richText,
          },
          assetsToMirror: extractSanityAssets(doc, imageRefs),
        });
      } catch {
        /* skip malformed lines */
      }
    }

    return {
      sourcePlatform: "sanity",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function extractSanityTaxonomies(doc: any): {
  vocabularies: string[];
  terms: Record<string, string[]>;
} {
  const terms: Record<string, string[]> = {};
  const vocabularies: string[] = [];
  if (doc.categories) {
    terms.categories = Array.isArray(doc.categories)
      ? doc.categories.map((c: any) => c.title || c._ref || c)
      : [];
    vocabularies.push("categories");
  }
  if (doc.tags) {
    terms.tags = Array.isArray(doc.tags) ? doc.tags.map((t: any) => t.title || t._ref || t) : [];
    vocabularies.push("tags");
  }
  return { vocabularies, terms };
}

function extractSanityAssets(doc: any, imageRefs: Map<string, string>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (value && typeof value === "object" && (value as any)._type === "image") {
      const ref = (value as any).asset?._ref || "";
      const url =
        imageRefs.get(ref) ||
        `https://cdn.sanity.io/images/${ref.replace("image-", "").replace("-jpg", ".jpg").replace("-png", ".png")}`;
      assets.push({
        externalUrl: url,
        originalId: ref,
        fieldTarget: key,
        altText: (value as any).alt || "",
      });
    }
  }
  return assets;
}

// ============================================================================
// Strapi JSON Export
// ============================================================================

export function parseStrapiExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const attrs = item.attributes || item;
      const id = String(item.id || attrs.id || "");
      entries.push({
        externalId: id,
        title: String(attrs.title || attrs.name || "Untitled"),
        slug: String(attrs.slug || attrs.handle || ""),
        status: attrs.publishedAt ? "published" : "draft",
        content: String(attrs.content || attrs.body || attrs.text || ""),
        excerpt: String(attrs.description || attrs.excerpt || attrs.summary || ""),
        createdAt: attrs.createdAt || attrs.created_at || nowISODateString(),
        updatedAt: attrs.updatedAt || attrs.updated_at || nowISODateString(),
        taxonomies: { vocabularies: [], terms: extractStrapiRelations(attrs) },
        rawCustomFields: attrs,
        assetsToMirror: extractStrapiMedia(attrs, id),
      });
    }

    return {
      sourcePlatform: "strapi",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function extractStrapiRelations(attrs: any): Record<string, string[]> {
  const terms: Record<string, string[]> = {};
  if (attrs.tags?.data)
    terms.tags = attrs.tags.data.map((t: any) => t.attributes?.name || t.name || t.id);
  if (attrs.categories?.data)
    terms.categories = attrs.categories.data.map((c: any) => c.attributes?.name || c.name || c.id);
  return terms;
}

function extractStrapiMedia(attrs: any, parentId: string): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  const imageFields = [
    "image",
    "images",
    "cover",
    "thumbnail",
    "avatar",
    "photo",
    "banner",
    "logo",
  ];
  for (const key of imageFields) {
    const field = attrs[key];
    if (field?.data?.attributes?.url) {
      assets.push({
        externalUrl: field.data.attributes.url,
        originalId: `${parentId}_${key}`,
        fieldTarget: key,
        altText: field.data.attributes.alternativeText || "",
      });
    }
  }
  return assets;
}

// ============================================================================
// Directus JSON Export
// ============================================================================

export function parseDirectusExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const id = String(item.id || item._id || "");
      entries.push({
        externalId: id,
        title: String(item.title || item.name || item.label || "Untitled"),
        slug: String(item.slug || item.handle || ""),
        status: item.status === "published" || item.status === "active" ? "published" : "draft",
        content: String(item.content || item.body || item.text || ""),
        excerpt: String(item.description || item.excerpt || item.summary || ""),
        createdAt: item.date_created || item.created_at || item.createdAt || nowISODateString(),
        updatedAt: item.date_updated || item.updated_at || item.updatedAt || nowISODateString(),
        authorName: String(
          item.user_created?.first_name
            ? `${item.user_created.first_name} ${item.user_created.last_name || ""}`
            : "",
        ),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror: item.image
          ? [
              {
                externalUrl: String(item.image),
                originalId: `${id}_image`,
                fieldTarget: "featuredImage",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "directus",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Payload CMS JSON Export
// ============================================================================

export function parsePayloadExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.docs || raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const id = String(item.id || "");
      entries.push({
        externalId: id,
        title: String(item.title || item.name || "Untitled"),
        slug: String(item.slug || ""),
        status: item._status === "published" ? "published" : "draft",
        content: String(item.content || item.body || item.richText || ""),
        excerpt: String(item.excerpt || item.description || ""),
        createdAt: item.createdAt || nowISODateString(),
        updatedAt: item.updatedAt || nowISODateString(),
        authorName: String(item.createdBy?.name || item.author || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror: item.image?.url
          ? [
              {
                externalUrl: item.image.url,
                originalId: `${id}_image`,
                fieldTarget: "featuredImage",
                altText: item.image.alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "payload",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Storyblok Stories JSON
// ============================================================================

export function parseStoryblokExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const stories = raw.stories || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const story of stories) {
      const content = story.content || {};
      entries.push({
        externalId: String(story.uuid || story.id || ""),
        title: String(story.name || content.title || "Untitled"),
        slug: String(story.full_slug || story.slug || ""),
        status: story.published ? "published" : "draft",
        content: "",
        createdAt: story.created_at || nowISODateString(),
        updatedAt: story.published_at || story.updated_at || nowISODateString(),
        taxonomies: {
          vocabularies: [],
          terms: story.tag_list
            ? {
                tags: Array.isArray(story.tag_list) ? story.tag_list : [story.tag_list],
              }
            : {},
        },
        rawCustomFields: {
          ...content,
          _slices: content.body || [],
          _component: content.component,
        },
        assetsToMirror: content.image?.filename
          ? [
              {
                externalUrl: content.image.filename,
                originalId: String(content.image.id || ""),
                fieldTarget: "image",
                altText: content.image.alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "storyblok",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Prismic Documents JSON
// ============================================================================

export function parsePrismicExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const docs = raw.results || raw.documents || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const doc of docs) {
      const data = doc.data || {};
      const title = extractPrismicTitle(data) || doc.uid || "Untitled";
      entries.push({
        externalId: String(doc.id || doc.uid || ""),
        title: String(title),
        slug: String(doc.uid || doc.slugs?.[0] || ""),
        status: doc.first_publication_date ? "published" : "draft",
        content: extractPrismicContent(data),
        createdAt: doc.first_publication_date || nowISODateString(),
        updatedAt: doc.last_publication_date || nowISODateString(),
        languageCode: String(doc.lang || ""),
        taxonomies: { vocabularies: [], terms: extractPrismicTags(data) },
        rawCustomFields: { ...data, _slices: data.body || data.slices || [] },
        assetsToMirror: extractPrismicAssets(data, String(doc.id)),
      });
    }

    return {
      sourcePlatform: "prismic",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function extractPrismicTitle(data: any): string {
  if (!data.title) return "";
  if (typeof data.title === "string") return data.title;
  if (Array.isArray(data.title)) return data.title.map((b: any) => b.text || "").join(" ");
  return String(data.title);
}

function extractPrismicContent(data: any): string {
  if (typeof data.body === "string") return data.body;
  if (Array.isArray(data.body)) {
    return data.body
      .map((slice: any) => {
        if (slice.primary?.text) return slice.primary.text;
        if (slice.primary?.title) return slice.primary.title;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (data.content) return String(data.content);
  return "";
}

function extractPrismicTags(data: any): Record<string, string[]> {
  const terms: Record<string, string[]> = {};
  if (data.tags && Array.isArray(data.tags)) terms.tags = data.tags;
  if (data.category) terms.categories = [String(data.category.slug || data.category)];
  return terms;
}

function extractPrismicAssets(data: any, parentId: string): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  for (const [key, val] of Object.entries(data)) {
    if (
      (val as any)?.url &&
      (key === "image" || key === "thumbnail" || key === "cover" || key === "banner")
    ) {
      assets.push({
        externalUrl: (val as any).url,
        originalId: `${parentId}_${key}`,
        fieldTarget: key,
        altText: (val as any).alt || "",
      });
    }
  }
  return assets;
}

// ============================================================================
// Helpers
// ============================================================================

function getLocalized(field: any, locale: string): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return String(field[locale] || field["en-US"] || field["en"] || Object.values(field)[0] || "");
}
