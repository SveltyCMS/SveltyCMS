/**
 * @file src/routes/(app)/config/collectionbuilder/smart-inference.ts
 * @description Heuristic engine for natural-language widget inferencing in the Collection Builder.
 *
 * Features:
 * - Automatically infers optimal SveltyCMS widget from field names (e.g. "email", "price", "cover")
 * - Sanitizes database field names and humanizes labels
 * - Detects relational target collections based on existing content structure
 * - Zero external dependencies; safe for both client and server execution
 */

import type { FieldInstance } from "@src/content/types";

export interface InferredWidgetResult {
  widgetKey: string;
  displayName: string;
  label: string;
  db_fieldName: string;
  icon: string;
  required?: boolean;
  defaults?: Record<string, unknown>;
}

/** Converts an input string like "user_email" or "productPrice" into a clean Title Case label */
export function humanizeLabel(input: string): string {
  const clean = input.trim().replace(/[_-]+/g, " ");
  // Insert space before capital letters in camelCase
  const spaced = clean.replace(/([a-z])([A-Z])/g, "$1 $2");
  return (
    spaced
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || "Field"
  );
}

/** Sanitizes an input string into a safe database field identifier */
export function sanitizeDbFieldName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "field";
}

/**
 * Infer optimal widget type, clean label, and default configurations from a field name.
 *
 * @param input - The raw user input (e.g. "email", "total_price", "cover_photo", "author")
 * @param existingCollections - Optional list of known collection names for relation detection
 */
export function inferWidgetFromFieldName(
  input: string,
  existingCollections: string[] = [],
): InferredWidgetResult {
  const raw = input.trim();
  const lower = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = humanizeLabel(raw);
  const db_fieldName = sanitizeDbFieldName(raw);

  // 1. Relational Matching: Check if field name matches or references an existing collection
  if (existingCollections.length > 0) {
    const singularMatches = existingCollections.find((c) => {
      const cLower = c.toLowerCase();
      return (
        lower === cLower ||
        lower === `${cLower}_id` ||
        lower.replace(/_id$/, "") === cLower ||
        lower.replace(/s$/, "") === cLower
      );
    });

    if (singularMatches) {
      return {
        widgetKey: "relation",
        displayName: `Relation to ${singularMatches}`,
        label,
        db_fieldName,
        icon: "mdi:relation-many-to-one",
        defaults: {
          relationCollection: singularMatches,
          displayField: "name",
        },
      };
    }
  }

  // 2. Email Pattern
  if (lower === "email" || lower.endsWith("_email") || lower.includes("email_address")) {
    return {
      widgetKey: "input",
      displayName: "Email (Input)",
      label,
      db_fieldName,
      icon: "mdi:email-outline",
      defaults: {
        type: "email",
        placeholder: "name@example.com",
      },
    };
  }

  // 3. Price / Currency Pattern
  if (
    lower === "price" ||
    lower.endsWith("_price") ||
    lower.startsWith("price_") ||
    lower === "cost" ||
    lower === "amount" ||
    lower === "fee" ||
    lower === "total" ||
    lower === "subtotal" ||
    lower === "salary"
  ) {
    return {
      widgetKey: "currency",
      displayName: "Currency / Price",
      label,
      db_fieldName,
      icon: "mdi:currency-usd",
      defaults: {
        currency: "USD",
      },
    };
  }

  // 4. Media / Image Pattern
  if (
    lower === "image" ||
    lower.endsWith("_image") ||
    lower === "photo" ||
    lower.endsWith("_photo") ||
    lower === "cover" ||
    lower.endsWith("_cover") ||
    lower === "avatar" ||
    lower === "thumbnail" ||
    lower === "banner" ||
    lower === "logo" ||
    lower === "media"
  ) {
    return {
      widgetKey: "media",
      displayName: "Image (Media)",
      label,
      db_fieldName,
      icon: "mdi:image-outline",
      defaults: {
        maxFiles: 1,
      },
    };
  }

  // 5. Rich Text / Markdown / Body Pattern
  if (
    lower === "content" ||
    lower.endsWith("_content") ||
    lower === "body" ||
    lower.endsWith("_body") ||
    lower === "description" ||
    lower.endsWith("_description") ||
    lower === "bio" ||
    lower === "notes" ||
    lower === "article" ||
    lower === "markdown" ||
    lower.includes("markdown") ||
    lower === "summary"
  ) {
    return {
      widgetKey: "markdown",
      displayName: "Markdown / Rich Text",
      label,
      db_fieldName,
      icon: "mdi:format-text",
      defaults: {},
    };
  }

  // 6. Boolean / Switch Pattern
  if (
    lower.startsWith("is_") ||
    lower.startsWith("has_") ||
    lower === "enabled" ||
    lower === "active" ||
    lower === "published" ||
    lower === "visible" ||
    lower === "draft" ||
    lower === "featured"
  ) {
    return {
      widgetKey: "boolean",
      displayName: "Boolean Switch",
      label,
      db_fieldName,
      icon: "mdi:toggle-switch-outline",
      defaults: {
        defaultValue: false,
      },
    };
  }

  // 7. Date & Time Pattern
  if (
    lower === "date" ||
    lower.endsWith("_date") ||
    lower.startsWith("date_") ||
    lower.endsWith("_at") ||
    lower === "deadline" ||
    lower === "dob" ||
    lower === "birthday" ||
    lower === "published_at" ||
    lower === "event_date"
  ) {
    return {
      widgetKey: "date",
      displayName: "Date / Time",
      label,
      db_fieldName,
      icon: "mdi:calendar-outline",
      defaults: {
        includeTime: lower.endsWith("_at") || lower.includes("time"),
      },
    };
  }

  // 8. Tags / Keywords / Labels Pattern
  if (lower === "tags" || lower === "keywords" || lower === "labels" || lower === "categories") {
    return {
      widgetKey: "tags",
      displayName: "Tags",
      label,
      db_fieldName,
      icon: "mdi:tag-multiple-outline",
      defaults: {},
    };
  }

  // 9. Phone Number Pattern
  if (
    lower === "phone" ||
    lower === "telephone" ||
    lower === "mobile" ||
    lower.endsWith("_phone") ||
    lower === "tel"
  ) {
    return {
      widgetKey: "phone-number",
      displayName: "Phone Number",
      label,
      db_fieldName,
      icon: "mdi:phone-outline",
      defaults: {},
    };
  }

  // 10. Rating / Score Pattern
  if (lower === "rating" || lower === "score" || lower === "stars" || lower === "grade") {
    return {
      widgetKey: "rating",
      displayName: "Rating",
      label,
      db_fieldName,
      icon: "mdi:star-outline",
      defaults: {
        maxRating: 5,
      },
    };
  }

  // 11. Address / Location Pattern
  if (
    lower === "address" ||
    lower === "location" ||
    lower === "city" ||
    lower === "street" ||
    lower === "coordinates"
  ) {
    return {
      widgetKey: "address",
      displayName: "Address",
      label,
      db_fieldName,
      icon: "mdi:map-marker-outline",
      defaults: {},
    };
  }

  // 12. SEO / Meta Pattern
  if (lower === "seo" || lower === "meta" || lower === "metadata") {
    return {
      widgetKey: "seo",
      displayName: "SEO Metadata",
      label,
      db_fieldName,
      icon: "mdi:search-web",
      defaults: {},
    };
  }

  // 13. Number / Quantity / Count Pattern
  if (
    lower === "quantity" ||
    lower === "count" ||
    lower === "stock" ||
    lower === "inventory" ||
    lower === "views" ||
    lower === "age" ||
    lower === "order" ||
    lower === "position" ||
    lower.endsWith("_count")
  ) {
    return {
      widgetKey: "number",
      displayName: "Number",
      label,
      db_fieldName,
      icon: "mdi:numeric",
      defaults: {},
    };
  }

  // Default fallback: Standard Text Input
  return {
    widgetKey: "input",
    displayName: "Text Input",
    label,
    db_fieldName,
    icon: "mdi:form-textbox",
    defaults: {},
  };
}

export interface GeneratedSchemaResult {
  name: string;
  icon: string;
  description: string;
  fields: FieldInstance[];
}

/**
 * Common icon mappings based on collection theme keywords
 */
const THEME_ICONS: Record<string, string> = {
  blog: "mdi:post-outline",
  post: "mdi:post-outline",
  article: "mdi:newspaper",
  news: "mdi:newspaper-variant-outline",
  product: "mdi:shopping-outline",
  commerce: "mdi:cart-outline",
  shop: "mdi:storefront-outline",
  order: "mdi:receipt-text-outline",
  customer: "mdi:account-group-outline",
  user: "mdi:account-outline",
  profile: "mdi:account-circle-outline",
  member: "mdi:card-account-details-outline",
  event: "mdi:calendar-star",
  webinar: "mdi:video-vintage",
  conference: "mdi:account-voice",
  recipe: "mdi:silverware-fork-knife",
  food: "mdi:food-apple-outline",
  dish: "mdi:pot-steam-outline",
  property: "mdi:home-city-outline",
  estate: "mdi:office-building",
  hotel: "mdi:bed-outline",
  course: "mdi:school-outline",
  lesson: "mdi:book-open-page-variant-outline",
  tutorial: "mdi:teach",
  podcast: "mdi:podcast",
  video: "mdi:video-outline",
  movie: "mdi:filmstrip",
  track: "mdi:music",
  album: "mdi:album",
  review: "mdi:comment-quote-outline",
  testimonial: "mdi:format-quote-close",
  faq: "mdi:help-circle-outline",
  ticket: "mdi:ticket-outline",
  task: "mdi:checkbox-marked-circle-outline",
  project: "mdi:briefcase-outline",
  portfolio: "mdi:palette-outline",
  author: "mdi:feather",
  category: "mdi:shape-outline",
  tag: "mdi:tag-multiple-outline",
};

/**
 * Determine a clean collection icon from name or prompt
 */
function inferCollectionIcon(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, icon] of Object.entries(THEME_ICONS)) {
    if (lower.includes(key)) {
      return icon;
    }
  }
  return "mdi:folder-outline";
}

/**
 * Parses a natural language prompt into a complete SveltyCMS collection schema,
 * including inferring widgets, tab grouping, section division, and validation flags.
 *
 * @param prompt - Natural language instructions
 * @param existingCollections - Known existing collections for relational auto-linking
 */
export function generateSchemaFromPrompt(
  prompt: string,
  existingCollections: string[] = [],
): GeneratedSchemaResult {
  const raw = prompt.trim();
  if (!raw) {
    return {
      name: "New Collection",
      icon: "mdi:folder-outline",
      description: "A newly created collection in SveltyCMS.",
      fields: [],
    };
  }

  // 1. Separate collection name from fields
  let collectionName = "New Collection";
  let fieldsText = raw;

  // Patterns like: "Create a Blog Post with ...", "Products collection including ..."
  const match = raw.match(
    /^(?:create|build|make|generate|define|add)?\s*(?:a|an)?\s*([a-zA-Z0-9_\s-]+?)\s*(?:collection|schema|model|table)?\s*(?:with|having|including|containing|composed of|:)\s*(.+)$/i,
  );

  if (match) {
    collectionName = humanizeLabel(match[1].trim());
    fieldsText = match[2].trim();
  } else {
    // If no explicit separator, check if first sentence or clause names it
    const parts = raw.split(/\bwith\b|\bincluding\b|:/i);
    if (parts.length > 1) {
      collectionName = humanizeLabel(
        parts[0].replace(/create|build|make|a|an|collection|schema/gi, "").trim(),
      );
      fieldsText = parts.slice(1).join(" ");
    }
  }

  if (!collectionName || collectionName === "Field") {
    collectionName = "Collection";
  }

  const icon = inferCollectionIcon(`${collectionName} ${fieldsText}`);
  const description = `Collection for managing ${collectionName.toLowerCase()} entries in SveltyCMS.`;

  // 2. Tokenize field specifications
  // Split on commas, semicolons, newlines, "and", bullet points
  const rawTokens = fieldsText
    .split(/[,;\n\r]|(?:\band\b)/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seenDbNames = new Set<string>();
  const fields: FieldInstance[] = [];

  for (const rawToken of rawTokens) {
    // Ignore pure conjunctions or filler words
    const stripped = rawToken.replace(/^[-*•\s]+/, "").trim();
    if (
      !stripped ||
      /^(and|with|etc|some|field|fields|optional|attributes|properties)$/i.test(stripped)
    ) {
      continue;
    }

    // Check for "required" indicator
    const isRequired = /\b(required|mandatory|must have|non-empty)\b/i.test(stripped);

    // Clean token from modifier keywords
    let cleanToken = stripped
      .replace(/\b(required|mandatory|must have|non-empty|optional)\b/gi, "")
      .replace(/[()[\]]/g, "")
      .trim();

    if (!cleanToken) continue;

    // Check if token specifies a widget descriptor suffix, e.g. "content markdown" -> name "content", explicitWidget "markdown"
    let explicitWidget: string | undefined;
    const descMatch = cleanToken.match(
      /^(.+?)\s+(markdown|rich-text|richtext|relation|switch|boolean|metadata|dropdown|select)$/i,
    );
    if (descMatch) {
      cleanToken = descMatch[1].trim();
      const rawDesc = descMatch[2].toLowerCase();
      if (rawDesc === "markdown" || rawDesc === "richtext" || rawDesc === "rich-text") {
        explicitWidget = "markdown";
      } else if (rawDesc === "relation") {
        explicitWidget = "relation";
      } else if (rawDesc === "switch" || rawDesc === "boolean") {
        explicitWidget = "boolean";
      } else if (rawDesc === "metadata") {
        explicitWidget = "seo";
      } else if (rawDesc === "dropdown" || rawDesc === "select") {
        explicitWidget = "select";
      }
    }

    // Check for conditional mentions like "discount_percent showIf on_sale"
    let conditionRule: { field: string; operator: "equals"; value: unknown } | undefined;
    const condMatch = cleanToken.match(
      /^(.+?)\s+(?:if|when|only if|show if)\s+([a-zA-Z0-9_]+)(?:\s*=\s*([a-zA-Z0-9_]+))?$/i,
    );
    if (condMatch) {
      cleanToken = condMatch[1].trim();
      const targetField = sanitizeDbFieldName(condMatch[2]);
      const targetVal = condMatch[3] !== undefined ? condMatch[3] : true;
      conditionRule = {
        field: targetField,
        operator: "equals",
        value: targetVal === "true" ? true : targetVal === "false" ? false : targetVal,
      };
    }

    const inferred = inferWidgetFromFieldName(cleanToken, existingCollections);
    if (explicitWidget) {
      inferred.widgetKey = explicitWidget;
    }

    // De-duplicate db_fieldName
    let dbName = inferred.db_fieldName;
    let counter = 1;
    while (seenDbNames.has(dbName)) {
      dbName = `${inferred.db_fieldName}_${++counter}`;
    }
    seenDbNames.add(dbName);

    // Determine smart tab and section
    let tab = "General";
    let section = "Basic Information";

    const wKey = inferred.widgetKey;
    const lowerToken = cleanToken.toLowerCase();

    if (wKey === "seo" || lowerToken.includes("seo") || lowerToken.includes("meta")) {
      tab = "SEO";
      section = "Search Engine Optimization";
    } else if (
      wKey === "media" ||
      lowerToken.includes("image") ||
      lowerToken.includes("photo") ||
      lowerToken.includes("gallery") ||
      lowerToken.includes("cover") ||
      lowerToken.includes("avatar")
    ) {
      tab = "Media";
      section = "Visual Assets";
    } else if (
      wKey === "markdown" ||
      wKey === "rich-text" ||
      lowerToken.includes("content") ||
      lowerToken.includes("body") ||
      lowerToken.includes("description") ||
      lowerToken.includes("article")
    ) {
      tab = "Content";
      section = "Main Content";
    } else if (
      wKey === "boolean" ||
      lowerToken.startsWith("is_") ||
      lowerToken.startsWith("has_") ||
      lowerToken.includes("published") ||
      lowerToken.includes("status")
    ) {
      tab = "Settings";
      section = "Publication & Status";
    } else if (
      wKey === "currency" ||
      lowerToken.includes("price") ||
      lowerToken.includes("cost") ||
      lowerToken.includes("inventory") ||
      lowerToken.includes("stock") ||
      lowerToken.includes("sku")
    ) {
      tab = "Commerce";
      section = "Pricing & Inventory";
    }

    const fieldInstance = {
      label: inferred.label,
      db_fieldName: dbName,
      required: isRequired || dbName === "title" || dbName === "name",
      tab,
      section,
      showIf: conditionRule,
      widget: {
        Name: inferred.widgetKey.charAt(0).toUpperCase() + inferred.widgetKey.slice(1),
        key: inferred.widgetKey,
        Icon: inferred.icon,
      },
      icon: inferred.icon,
      ...inferred.defaults,
    } as unknown as FieldInstance;

    fields.push(fieldInstance);
  }

  return {
    name: collectionName,
    icon,
    description,
    fields,
  };
}
