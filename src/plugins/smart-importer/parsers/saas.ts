/**
 * @file src/plugins/smart-importer/parsers/saas.ts
 * @description SaaS platform parsers — Ghost, Webflow, HubSpot, Wix, Squarespace, Duda, Tilda.
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";

// ============================================================================
// Ghost JSON Export
// ============================================================================

export function parseGhostExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const posts = raw.db?.[0]?.data?.posts || raw.posts || [];
    const tags = raw.db?.[0]?.data?.tags || raw.tags || [];
    const users = raw.db?.[0]?.data?.users || raw.users || [];
    const entries: SNCEntry[] = [];

    const tagMap = new Map<string, string>();
    for (const t of tags) tagMap.set(String(t.id), String(t.name || t.slug));

    const userMap = new Map<string, string>();
    for (const u of users) userMap.set(String(u.id), String(u.name || u.slug));

    for (const post of posts) {
      const id = String(post.id || post.uuid || "");
      const postTags = Array.isArray(post.tags)
        ? post.tags
            .map((t: any) =>
              typeof t === "string" ? t : tagMap.get(String(t.id)) || t.name || t.slug,
            )
            .filter(Boolean)
        : [];
      const authorId = String(post.author_id || post.author || "");
      entries.push({
        externalId: id,
        title: String(post.title || "Untitled"),
        slug: String(post.slug || ""),
        status: post.status === "published" ? "published" : "draft",
        content: "",
        excerpt: String(post.custom_excerpt || post.excerpt || post.meta_description || ""),
        createdAt: post.created_at || nowISODateString(),
        updatedAt: post.updated_at || nowISODateString(),
        authorName: userMap.get(authorId) || String(post.author || ""),
        taxonomies: { vocabularies: ["tags"], terms: { tags: postTags } },
        rawCustomFields: {
          ...post,
          _lexicalData: post.mobiledoc || post.lexical,
          _featured: post.featured,
        },
        assetsToMirror: post.feature_image
          ? [
              {
                externalUrl: post.feature_image,
                originalId: id,
                fieldTarget: "featuredImage",
                altText: post.feature_image_alt || post.feature_image_caption || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "ghost",
      version: raw.version || "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Webflow CMS Collections CSV
// ============================================================================

export function parseWebflowExport(csvText: string, token: string): SNCEnvelope | null {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = parseCSVLine(lines[0]);
    const entries: SNCEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;
      const id = values[headers.indexOf("_id")] || values[0] || `wf_${i}`;

      const entry: SNCEntry = {
        externalId: String(id),
        title: String(
          values[headers.indexOf("Name")] ||
            values[headers.indexOf("name")] ||
            values[1] ||
            "Untitled",
        ),
        slug: String(values[headers.indexOf("Slug")] || values[headers.indexOf("slug")] || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        status:
          values[headers.indexOf("_archived")] === "true"
            ? "archived"
            : values[headers.indexOf("_draft")] === "true"
              ? "draft"
              : "published",
        content: "",
        createdAt:
          values[headers.indexOf("Created On")] ||
          values[headers.indexOf("Created")] ||
          nowISODateString(),
        updatedAt:
          values[headers.indexOf("Updated On")] ||
          values[headers.indexOf("Updated")] ||
          nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {},
        assetsToMirror: [] as SNCEntry["assetsToMirror"],
      };

      for (let j = 0; j < headers.length; j++) {
        entry.rawCustomFields[headers[j]] = values[j] || "";
        if (headers[j].toLowerCase().includes("image") && values[j]?.startsWith("http")) {
          entry.assetsToMirror.push({
            externalUrl: values[j],
            originalId: `${id}_${headers[j]}`,
            fieldTarget: headers[j],
          });
        }
      }

      entries.push(entry);
    }

    return { sourcePlatform: "webflow", version: "1.0", transactionToken: token, entries };
  } catch {
    return null;
  }
}

// ============================================================================
// HubSpot CMS JSON Export
// ============================================================================

export function parseHubSpotExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.results || raw.objects || raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const props = item.properties || item;
      entries.push({
        externalId: String(item.id || ""),
        title: String(props.name || props.title || props.page_title || "Untitled"),
        slug: String(props.slug || props.url || "").replace(/^\/+/, ""),
        status: props.publish_date ? "published" : "draft",
        content: String(props.html || props.body || props.content || ""),
        createdAt: props.created || props.createdAt || props.publish_date || nowISODateString(),
        updatedAt: props.updated || props.updatedAt || nowISODateString(),
        taxonomies: {
          vocabularies: [],
          terms: props.tags
            ? {
                tags:
                  typeof props.tags === "string"
                    ? props.tags.split(",").map((s: string) => s.trim())
                    : props.tags,
              }
            : {},
        },
        rawCustomFields: item,
        assetsToMirror: props.featured_image
          ? [
              {
                externalUrl: props.featured_image,
                originalId: String(item.id),
                fieldTarget: "featuredImage",
              },
            ]
          : [],
      });
    }

    return { sourcePlatform: "hubspot", version: "1.0", transactionToken: token, entries };
  } catch {
    return null;
  }
}

// ============================================================================
// Wix CMS JSON Export
// ============================================================================

export function parseWixExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.items || raw.data || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const data = item.data || item;
      entries.push({
        externalId: String(item.id || data._id || ""),
        title: String(data.title || data.name || "Untitled"),
        slug: String(data.slug || data.url || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        status: data.status === "PUBLIC" || data.published ? "published" : "draft",
        content: String(data.content || data.body || data.richContent || ""),
        createdAt: data._createdDate || data.createdDate || nowISODateString(),
        updatedAt: data._updatedDate || data.updatedDate || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror:
          data.image || data.mainMedia
            ? [
                {
                  externalUrl: String(data.image || data.mainMedia),
                  originalId: String(item.id),
                  fieldTarget: "featuredImage",
                },
              ]
            : [],
      });
    }

    return { sourcePlatform: "wix", version: "1.0", transactionToken: token, entries };
  } catch {
    return null;
  }
}

// ============================================================================
// Squarespace JSON Export
// ============================================================================

export function parseSquarespaceExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items = raw.collection?.items || raw.items || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const item of items) {
      const data = item.data || item;
      entries.push({
        externalId: String(item.id || data.id || ""),
        title: String(data.title || "Untitled"),
        slug: String(data.slug || data.urlId || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        status: data.publishOn ? "published" : "draft",
        content: String(data.body || data.description || ""),
        createdAt: data.addedOn || data.publishOn || nowISODateString(),
        updatedAt: data.updatedOn || nowISODateString(),
        taxonomies: {
          vocabularies: [],
          terms: data.tags ? { tags: Array.isArray(data.tags) ? data.tags : [data.tags] } : {},
        },
        rawCustomFields: item,
        assetsToMirror: data.assetUrl
          ? [
              {
                externalUrl: data.assetUrl,
                originalId: String(item.id),
                fieldTarget: "featuredImage",
              },
            ]
          : [],
      });
    }

    return { sourcePlatform: "squarespace", version: "1.0", transactionToken: token, entries };
  } catch {
    return null;
  }
}

// ============================================================================
// Generic SaaS JSON (Duda, Tilda, Builder.io)
// ============================================================================

export function parseGenericSaaS(
  jsonText: string,
  platform: string,
  token: string,
): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items =
      raw.items || raw.pages || raw.data || raw.results || (Array.isArray(raw) ? raw : [raw]);
    const entries: SNCEntry[] = (Array.isArray(items) ? items : [items]).map(
      (item: any, idx: number) => ({
        externalId: String(item.id || item._id || `${platform}_${idx}`),
        title: String(item.title || item.name || item.label || "Untitled"),
        slug: String(item.slug || item.url || item.path || "")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/^\/+/, ""),
        status: item.published || item.active || item.status === "live" ? "published" : "draft",
        content: String(item.content || item.body || item.html || item.text || ""),
        createdAt: item.createdAt || item.created || item.date || nowISODateString(),
        updatedAt: item.updatedAt || item.updated || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: item,
        assetsToMirror: [] as SNCEntry["assetsToMirror"],
      }),
    );

    return { sourcePlatform: platform as any, version: "1.0", transactionToken: token, entries };
  } catch {
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
