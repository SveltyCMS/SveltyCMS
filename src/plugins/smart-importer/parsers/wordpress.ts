/**
 * @file src/plugins/smart-importer/parsers/wordpress.ts
 * @description WordPress WXR (WordPress eXtended RSS) parser.
 *
 * Handles the complete WordPress export format:
 * - Posts, pages, and custom post types
 * - Categories and tags with hierarchy
 * - Custom fields (ACF, CMB2, Meta Box, Pods)
 * - Media attachments with URL extraction
 * - Comments (threaded with author/email/date)
 * - Authors with display names
 * - Post meta (all underscore-prefixed and custom keys)
 * - Featured images (_thumbnail_id resolution)
 * - Parent/child page hierarchy
 * - Menu order and post formats
 * - Post status mapping (publish→published, draft→draft, etc.)
 * - GUID and ping status preservation
 */

import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import type { SNCEnvelope, SNCEntry } from "../types";

// ============================================================================
// Main WXR Parser
// ============================================================================

/**
 * Parses a WordPress WXR XML export file into SNC format.
 * Handles the full WXR 1.2 specification with all WordPress namespaces.
 */
export function parseWordPressWXR(xmlText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const entries: SNCEntry[] = [];
    const authors = new Map<string, string>(); // login → display_name
    const attachmentMap = new Map<string, { url: string; title: string; alt: string }>(); // id → media info
    const categoryMap = new Map<string, string>(); // slug → name
    const tagMap = new Map<string, string>(); // slug → name

    // ── Parse channel metadata (authors, categories, tags) ──
    const channelXml = extractTag(xmlText, "channel");
    if (channelXml) {
      // Authors: <wp:author><wp:author_login>...</wp:author_login><wp:author_display_name>...</wp:author_display_name></wp:author>
      const authorRegex = /<wp:author>([\s\S]*?)<\/wp:author>/g;
      let authorMatch: RegExpExecArray | null;
      while ((authorMatch = authorRegex.exec(channelXml)) !== null) {
        const login = extractTag(authorMatch[1], "wp:author_login");
        const display = extractTag(authorMatch[1], "wp:author_display_name");
        if (login && display) authors.set(login, display);
      }

      // Categories: <wp:category><wp:cat_name>...</wp:cat_name><wp:category_nicename>...</wp:category_nicename></wp:category>
      const catRegex = /<wp:category>([\s\S]*?)<\/wp:category>/g;
      let catMatch: RegExpExecArray | null;
      while ((catMatch = catRegex.exec(channelXml)) !== null) {
        const name = extractCData(catMatch[1], "wp:cat_name");
        const slug = extractTag(catMatch[1], "wp:category_nicename");
        if (name) categoryMap.set(slug || name.toLowerCase(), name);
      }

      // Tags: <wp:tag><wp:tag_slug>...</wp:tag_slug><wp:tag_name>...</wp:tag_name></wp:tag>
      const tagRegex = /<wp:tag>([\s\S]*?)<\/wp:tag>/g;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(channelXml)) !== null) {
        const name = extractCData(tagMatch[1], "wp:tag_name");
        const slug = extractTag(tagMatch[1], "wp:tag_slug");
        if (name) tagMap.set(slug || name.toLowerCase(), name);
      }
    }

    // ── Parse items (posts, pages, attachments, custom post types) ──
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch: RegExpExecArray | null;

    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
      const itemXml = itemMatch[1];
      const postType = extractCData(itemXml, "wp:post_type") || "post";

      // Skip navigation menu items
      if (postType === "nav_menu_item") continue;

      // ── Base entry fields ──
      const entry: SNCEntry = {
        externalId:
          extractCData(itemXml, "wp:post_id") || extractTag(itemXml, "guid") || `wp_${Date.now()}`,
        title: decodeHtmlEntities(extractTag(itemXml, "title") || "Untitled"),
        slug: extractCData(itemXml, "wp:post_name") || "",
        status: mapWPStatus(extractCData(itemXml, "wp:status")),
        content: extractContentEncoded(itemXml),
        excerpt: extractExcerpt(itemXml),
        createdAt:
          extractTag(itemXml, "wp:post_date") ||
          extractTag(itemXml, "pubDate") ||
          nowISODateString(),
        updatedAt: extractTag(itemXml, "wp:post_modified") || nowISODateString(),
        authorName:
          authors.get(extractCData(itemXml, "dc:creator") || "") ||
          extractCData(itemXml, "dc:creator") ||
          "",
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {},
        assetsToMirror: [],
      };

      // ── Hierarchical attributes ──
      const parentId = extractCData(itemXml, "wp:post_parent");
      if (parentId && parentId !== "0") {
        entry.parentExternalId = parentId;
      }
      const menuOrder = extractCData(itemXml, "wp:menu_order");
      if (menuOrder) entry.menuOrder = parseInt(menuOrder) || 0;

      // ── Post format ──
      const postFormat = extractCData(itemXml, "wp:post_format");
      if (postFormat) {
        entry.rawCustomFields._postFormat = postFormat;
      }

      // Content type for wizard filtering (post, page, custom post types)
      entry.rawCustomFields.type = postType;

      // ── Comment status ──
      const commentStatus = extractCData(itemXml, "wp:comment_status");
      if (commentStatus) {
        entry.rawCustomFields._commentStatus = commentStatus;
      }

      // ── GUID ──
      const guid = extractTag(itemXml, "guid");
      if (guid) {
        entry.rawCustomFields._wpGuid = guid;
      }

      // ── Categories ──
      const categories: string[] = [];
      const catItemRegex = /<category[^>]*>([\s\S]*?)<\/category>/g;
      let catItemMatch: RegExpExecArray | null;
      while ((catItemMatch = catItemRegex.exec(itemXml)) !== null) {
        const catXml = catItemMatch[0];
        const domain = extractAttr(catXml, "domain");
        const nicename = extractAttr(catXml, "nicename");
        const catName =
          extractCData(catItemMatch[1], "") ||
          catItemMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();

        if (domain === "category" || (!domain && catName)) {
          const resolved = categoryMap.get(nicename || catName.toLowerCase()) || catName;
          if (resolved) categories.push(resolved);
        }
      }

      if (categories.length > 0) {
        entry.taxonomies.terms.categories = categories;
        entry.taxonomies.vocabularies.push("categories");
      }

      // ── Tags ──
      const tags: string[] = [];
      const tagItemRegex = /<category[^>]*domain="post_tag"[^>]*>([\s\S]*?)<\/category>/g;
      let tagItemMatch: RegExpExecArray | null;
      while ((tagItemMatch = tagItemRegex.exec(itemXml)) !== null) {
        const tagName =
          extractCData(tagItemMatch[1], "") ||
          tagItemMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        if (tagName) {
          const resolved = tagMap.get(tagName.toLowerCase()) || tagName;
          tags.push(resolved);
        }
      }

      if (tags.length > 0) {
        entry.taxonomies.terms.tags = tags;
        entry.taxonomies.vocabularies.push("tags");
      }

      // ── Comments ──
      const comments = parseWPComments(itemXml);
      if (comments.length > 0) {
        entry.rawCustomFields._comments = comments;
      }

      // ── Custom Fields / Post Meta ──
      const customFields: Record<string, unknown> = {};
      const metaRegex = /<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g;
      let metaMatch: RegExpExecArray | null;

      while ((metaMatch = metaRegex.exec(itemXml)) !== null) {
        const metaXml = metaMatch[1];
        const metaKey = extractCData(metaXml, "wp:meta_key");
        const metaValue = extractCData(metaXml, "wp:meta_value");

        if (metaKey) {
          // Skip internal WordPress meta
          if (metaKey.startsWith("_wp_") || metaKey === "_edit_lock" || metaKey === "_edit_last") {
            continue;
          }

          // Featured image reference
          if (metaKey === "_thumbnail_id") {
            const attachment = attachmentMap.get(metaValue || "");
            if (attachment) {
              entry.assetsToMirror.push({
                externalUrl: attachment.url,
                originalId: metaValue || "",
                fieldTarget: "featuredImage",
                altText: attachment.alt || attachment.title || "",
              });
            }
            entry.rawCustomFields._thumbnailId = metaValue;
            continue;
          }

          // Store custom field
          if (metaKey.startsWith("_")) {
            // Serialized meta — store as-is
            customFields[metaKey.slice(1)] = tryUnserialize(metaValue || "");
          } else {
            customFields[metaKey] = tryUnserialize(metaValue || "");
          }
        }
      }

      if (Object.keys(customFields).length > 0) {
        entry.rawCustomFields = { ...entry.rawCustomFields, ...customFields };
      }

      // ── Handle attachments (media items) ──
      if (postType === "attachment") {
        const attUrl = extractCData(itemXml, "wp:attachment_url");
        const attTitle = extractTag(itemXml, "title") || "";
        if (attUrl) {
          attachmentMap.set(entry.externalId, {
            url: attUrl,
            title: attTitle,
            alt: extractExcerpt(itemXml) || attTitle,
          });
        }
        // Don't add attachments as entries unless explicitly requested
        // They're referenced via _thumbnail_id from posts
      }

      // ── Detect content format ──
      if (entry.content && (entry.content.includes("<") || entry.content.includes("&lt;"))) {
        entry.rawCustomFields._contentFormat = "html";
      }

      entries.push(entry);
    }

    // ── Second pass: resolve attachment references ──
    // Some WXR files place attachment items AFTER the posts that reference them
    for (const entry of entries) {
      const thumbnailId = entry.rawCustomFields._thumbnailId as string;
      if (thumbnailId && entry.assetsToMirror.length === 0) {
        const attachment = attachmentMap.get(thumbnailId);
        if (attachment) {
          entry.assetsToMirror.push({
            externalUrl: attachment.url,
            originalId: thumbnailId,
            fieldTarget: "featuredImage",
            altText: attachment.alt || attachment.title || "",
          });
        }
      }
    }

    logger.info(
      `[WordPressParser] Parsed ${entries.length} entries, ${authors.size} authors, ${attachmentMap.size} attachments, ${categoryMap.size} categories, ${tagMap.size} tags`,
    );

    return {
      sourcePlatform: "wordpress",
      version: "WXR 1.2",
      transactionToken,
      entries,
    };
  } catch (err) {
    logger.error("[WordPressParser] Failed to parse WXR:", err);
    return null;
  }
}

// ============================================================================
// Comment Parser
// ============================================================================

function parseWPComments(itemXml: string): Array<{
  id: string;
  author: string;
  email: string;
  url: string;
  ip: string;
  date: string;
  content: string;
  status: string;
  parentId: string;
}> {
  const comments: ReturnType<typeof parseWPComments> = [];
  const commentRegex = /<wp:comment>([\s\S]*?)<\/wp:comment>/g;
  let match: RegExpExecArray | null;

  while ((match = commentRegex.exec(itemXml)) !== null) {
    const cxml = match[1];
    comments.push({
      id: extractCData(cxml, "wp:comment_id") || "",
      author: extractCData(cxml, "wp:comment_author") || "",
      email: extractCData(cxml, "wp:comment_author_email") || "",
      url: extractCData(cxml, "wp:comment_author_url") || "",
      ip: extractCData(cxml, "wp:comment_author_IP") || "",
      date: extractCData(cxml, "wp:comment_date") || "",
      content: extractCData(cxml, "wp:comment_content") || "",
      status: extractCData(cxml, "wp:comment_approved") === "1" ? "approved" : "pending",
      parentId: extractCData(cxml, "wp:comment_parent") || "",
    });
  }

  return comments;
}

// ============================================================================
// XML Helpers
// ============================================================================

function extractTag(xml: string, tag: string): string {
  // Match both <tag>value</tag> and <tag><![CDATA[value]]></tag>
  const regex = new RegExp(
    `<${tag}[^>]*>` + // Opening tag with possible attributes
      `(?:<!\\[CDATA\\[)?` + // Optional CDATA start
      `([\\s\\S]*?)` + // Content (non-greedy)
      `(?:\\]\\]>)?` + // Optional CDATA end
      `<\\/${tag}>`, // Closing tag
    "i",
  );
  const match = regex.exec(xml);
  return match ? match[1].trim() : "";
}

function extractCData(xml: string, tag: string): string {
  // Try CDATA first, then regular
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    "i",
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  return extractTag(xml, tag);
}

function extractAttr(xml: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`, "i");
  const match = regex.exec(xml);
  return match ? match[1] : "";
}

function extractContentEncoded(itemXml: string): string {
  return extractCData(itemXml, "content:encoded") || extractCData(itemXml, "encoded[\\d]*") || "";
}

function extractExcerpt(itemXml: string): string {
  return extractCData(itemXml, "excerpt:encoded") || extractCData(itemXml, "description") || "";
}

// ============================================================================
// Data Helpers
// ============================================================================

function mapWPStatus(wpStatus: string): "published" | "draft" | "pending" | "archived" {
  const s = (wpStatus || "draft").toLowerCase();
  switch (s) {
    case "publish":
      return "published";
    case "draft":
      return "draft";
    case "pending":
      return "pending";
    case "future":
      return "pending";
    case "private":
      return "archived";
    case "trash":
      return "archived";
    case "inherit":
      return "published"; // Attachments inherit parent status
    default:
      return "draft";
  }
}

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function tryUnserialize(value: string): unknown {
  if (!value) return value;

  // PHP serialized array: a:2:{i:0;s:5:"value";i:1;s:6:"value2";}
  if (/^a:\d+:/.test(value)) {
    try {
      return parsePHPArray(value);
    } catch {
      return value;
    }
  }

  // PHP serialized object: O:8:"stdClass":...
  if (/^O:\d+:".*":/.test(value)) {
    return value; // Keep as string — too complex to reliably parse
  }

  // Boolean/int/float serialized
  if (value === "b:1;") return true;
  if (value === "b:0;") return false;
  if (/^i:\d+;$/.test(value)) return parseInt(value.slice(2, -1));
  if (/^d:[\d.]+;$/.test(value)) return parseFloat(value.slice(2, -1));

  return value;
}

function parsePHPArray(serialized: string): unknown[] {
  const result: unknown[] = [];
  let i = 2; // Skip "a:"
  // Find colon after array size
  while (serialized[i] !== ":") i++;
  i++; // Skip colon
  // Parse array size
  let sizeStr = "";
  while (serialized[i] !== ":") sizeStr += serialized[i++];
  i++; // Skip colon
  // Skip opening brace
  if (serialized[i] === "{") i++;

  // Parse elements
  let depth = 0;
  let current = "";
  let stringLen = 0;
  let parsingStringLen = false;

  for (; i < serialized.length; i++) {
    const ch = serialized[i];

    if (parsingStringLen) {
      if (ch === ":") {
        parsingStringLen = false;
        stringLen = parseInt(current);
        current = "";
        i++; // Skip opening quote
        let str = "";
        for (let j = 0; j < stringLen; j++) str += serialized[++i];
        result.push(str);
        i++; // Skip closing semicolon after string
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "s" && serialized[i + 1] === ":") {
      parsingStringLen = true;
      current = "";
      i++; // Move to after s:
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth < 0) break;
    }
  }

  return result;
}
